/**
 * 页面获取信息路由
 */
const KoaRouter = require('koa-router');
const router = new KoaRouter();
const url = require('url');
const koaBody = require('koa-body')
const fs = require('fs')
const sharp = require('sharp')
const path = require('path')
const db = require('../../config/mysqldb');
const { searchProductValidator, addProductValidator } = require('../../validation/validator')
const { moveFile, randomStr } = require('../../config/tools')
/**
 * @route GET /api/goods/type
 * @desc 获得分类信息
 * @paramter type=big   type=smaill & (int)bigid   type=detail & (int)detailId
 * @access 接口是公开的
 */
router.get('/type', async ctx => {
	try {
		const info = url.parse(ctx.request.url, true).query;
		// 获取所有 big_type
		if (info.type === 'big') {
			const select = `select _id,bigName from tb_bigType limit ${info.limit || 16};`;
			const bigResult = await db.executeReader(select);
			bigResult.sort((a,b) => a._id - b._id);
			return ctx.body = {success: true, code: '0000', payload: bigResult, message: 'OK'};
		}
		// 获得所有 smaillType & detailType
		if (info.type === 'smaill' && /^\d{1,}$/.test(info.bigid)) {
			const smaill = `select _id, smaillName from tb_smaillType where bigId=${info.bigid};`;
			const result = await db.executeReader(smaill);
			result.sort((a,b) => a._id - b._id);
			// 获得 detailType
			const detail = `select _id,smaillId,detailName from tb_detailType where smaillId between ${result[0]._id} and ${result[result.length-1]._id};`;
			const detailResult = await db.executeReader(detail);
			// 合并 smaill 和 detail Type
			for (let i = 0, slen=result.length; i < slen; i++) {
				result[i].detail = [];
				for (let j = 0, dlen =detailResult.length; j<dlen; j++) {
					if (result[i]._id === detailResult[j].smaillId) result[i].detail.push(detailResult[j])
				}
			}
			return ctx.body = {success: true, code: '0000', payload: result, message: 'OK'};
		}
		// 获取 detailId 对应的 detailType 和 smaillType
		if (info.type === 'detail' && /^\d{1,}$/.test(info.detailId)) {
			const select = `select s._id as smaillId,d._id as detailId,s.smaillName,d.detailName from tb_detailType as d join tb_smaillType as s on d.smaillId=s._id where smaillId=(select smaillId from tb_detailType where _id=${info.detailId});`
			const smaillResult = await db.executeReader(select)
			return ctx.body = {success: true, code: '0000', payload: smaillResult, message: 'OK'};
		}
		ctx.body = {success: false, code: '0001', message: '接口参数错误'}
	}catch(err) {
		console.error(err);
		ctx.body = {success: false, code: '9999', message: err.message}
	}
});

/**
 * @route GET /api/goods/search_product
 * @desc 获得分类信息
 * @paramter q=(string) (关键字) , limit1(number) 查询过滤条数, limit2(number) 查询结果条数
 * @paramter bigId | smaillId | bigId | storeId (int), order(number销量, price价格, ) sort(desc asc), 
 * @access 接口是公开的
 * 
 * 1.搜索分类中 类似  4分
 * 		小分类，
 * 		大分类，返回小分类
 * 2.搜索商品名中 类似  2分
 * 3.搜索商品描述中 类似  1分
 *
 */
router.get('/search_product', async ctx => {
	const info = url.parse(ctx.request.url, true).query;
	const search = searchProductValidator(info)
	if (!search.isvalid) {
		return ctx.body = {success: false, code: '0001', message: '接口参数错误'}
	}
	// 根据商品名查询
	try {
		let goods = await db.executeReader(search.sql);
		ctx.body = {success:true, code: '0000', message: 'OK', payload: goods}
	}catch(err) {
		console.error(err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
	/*
	try {
		let seeSmaill = `select * from tb_goods, (select d._id from tb_detailType as d,(select _id from tb_smaillType where smaillName like '%${querykey}%') as s where smaillId=s._id) as did where tb_goods.detailId=did._id;`
		let goods = await db.executeReader(seeSmaill);
		if (goods.length >= 20) {
			// 小分类查询有结果超过 20 个, 返回
			return ctx.body = goods;
		}

		// 查详细分类
		let seeDetail = `select * from tb_goods, (select _id from tb_detailType where detailName like '%${querykey}%') as did where  tb_goods.detailId=did._id;`;
		const detailAns = await db.executeReader(seeDetail)
		goods = goods.concat(detailAns)
		if (goods.length >= 20) {
			return ctx.body = goods;
		}

		// 查商品名
		let seeGoodsName = `select * from tb_goods where goodName like '%${querykey}%';`;
		const goodsNameAns = await db.executeReader(seeGoodsName)
		goods = goods.concat(goodsNameAns)
		return ctx.body = goods;
	}
	*/
})

/**
 * @route GET /api/goods/search_store
 * @desc 获得分类信息
 * @paramter storeIds(JsonArr)
 * @access 接口是公开的
 */

router.get('/search_store', async ctx => {
	const query = url.parse(ctx.request.url, true).query;
	if (query.storeIds) {
		try {
			const storeIds = JSON.parse(query.storeIds)
			// 拼接 SQL
			let sql = 'select s._id,s.storeName,s.logo,s.storeStatus from tb_store as s';
			for (let i = 0, len = storeIds.length; i < len; i++) {
				if (i === 0) sql += " where ";
				sql = sql + "_id=" + storeIds[i] + " or "
			}
			sql = sql.substring(0, sql.length-4)
			let stores = await db.executeReader(sql)
			// 删除禁用的店铺
			for (let i = 0, len = stores.length; i < len; i++) {
				stores[i].storeStatus = stores[i].storeStatus.readUInt8(0, true)
				if (stores[i].storeStatus === 1) {
					stores.splice(i, 1)
					i--; len--
				}
			}
			ctx.body = {success:true, code: '0000', message: 'OK', payload: stores}

		}catch(err) {
			console.error(err.message)
			ctx.body = {success: false, code: '9999', message: err.message}
		}
	}else {
		ctx.body = {success: false, code: '0001', message: '接口参数错误'}
	}
})


/**
 * @route POST(formData) /api/goods/add_product
 * @desc 添加商品
 * @paramter detailId(int), storeId(int), goodName(String), goodFrom(String), nowPrice(String)
 * @paramter logo(image), goodSmaillPicture(image||image数组), goodInfoPicture(image||image数组)
 * @paramter specName(String数组)	['大小', '配置']
 * @paramter specValue(数组)			[['大','中','小'], ['高','中', '低']]
 * @paramter goodDetailInfo(数组)	[{amount(库存):12, price(价格):998},{amount:11, price:1008},{isDisable:true}...]
 * @access 接口需要 token 认证
 */

router.post('/add_product', koaBody({ multipart: true }), async ctx => {
	const info = ctx.request.body
	const files = ctx.request.files
	const ans = addProductValidator(info, files)
	if (!ans.isvalid) {
		return ctx.body = {success: false, code: '0001', message: '接口参数错误'}
	}
	try {
		// 查询商品已存在
		const product = await db.executeReader(`select _id from tb_goods where storeId=${info.storeId} and goodName='${info.goodName}';`)
		if (product.length > 0) return ctx.body = {success: false, code: '0001', message: '商品已存在'};
		const getImgName = randomStr()
		const logoName = getImgName()
		await moveFile(files.logo.path, path.join(__dirname, '../../views/image/goods/logo/' + logoName))
		const goodno = info.storeId + Date.now().toString()
		// 插入商品表数据
		let insertGoods = `insert into tb_goods(bigId,smaillId,detailId,storeId,goodName,goodFrom,logo,nowPrice,goodno) values(
								(select bigId from tb_smaillType where _id=(select smaillId from tb_detailType where _id=${info.detailId})),
								(select smaillId from tb_detailType where _id=${info.detailId}),
								${info.detailId},${info.storeId},'${info.goodName}','${info.goodFrom}','${logoName}',${info.nowPrice},'${goodno}');`
		const goodsAns = await db.executeNoQuery(insertGoods)
		if (goodsAns !== 1) return ctx.body = {success: false, code: '0001', message: '未知错误1'};
		let goodId = await db.executeReader(`select _id from tb_goods where goodno='${goodno}';`)
		if (goodId.length < 1) return ctx.body = {success: false, code: '0001', message: '未知错误2'};
		goodId = goodId[goodId.length-1]._id

		// 插入 tb_goodsmaillPicture 表数据
		const smaillPicture = []
		for (let i=0, len=files.goodSmaillPicture.length; i<len; i++) {
			let imgName = getImgName()
			let buf = await moveFile(files.goodSmaillPicture[i].path, path.join(__dirname, '../../views/image/goods/smaill/' + imgName))
			sharp(buf).resize({ height:430, fit:'inside' }).toFile(path.join(__dirname, `../../views/image/goods/smaill/${imgName}_430x430q90.jpg`), (err, info) => {
				if (err) console.error(err)
			})
			sharp(buf).resize({ height:60, fit:'inside' }).toFile(path.join(__dirname, `../../views/image/goods/smaill/${imgName}_60x60q90.jpg`), (err, info) => {
				if (err) console.error(err)
			})
			smaillPicture.push({imgName, index: i+1})
		}
		let insertSmaillPicture = 'insert into tb_goodsmaillPicture(goodId, link, pindex) values'
		for (let i = 0, len = smaillPicture.length; i < len; i++) {
			insertSmaillPicture += `(${goodId},'${smaillPicture[i].imgName}',${smaillPicture[i].index})`
			insertSmaillPicture += (i === len -1) ? ';' : ','
		}

		const smaillPictureAns = await db.executeNoQuery(insertSmaillPicture)
		if (smaillPictureAns < 1) return ctx.body = {success: false, code: '0001', message: '未知错误3'};

		// 插入 tb_goodPicture  表数据
		const infoPicture = []
		for (let i=0, len=files.goodInfoPicture.length; i<len; i++) {
			let imgName = getImgName()
			await moveFile(files.goodInfoPicture[i].path, path.join(__dirname, '../../views/image/goods/info/' + imgName))
			infoPicture.push({imgName, index: i+1})
		}
		let insertGoodInfoPicture = 'insert into tb_goodPicture(goodId, link, pindex) values'
		for (let i = 0, len = infoPicture.length; i < len; i++) {
			insertGoodInfoPicture += `(${goodId},'${infoPicture[i].imgName}',${infoPicture[i].index})`
			insertGoodInfoPicture += (i === len -1) ? ';' : ','
		}
		const infoPictureAns = await db.executeNoQuery(insertGoodInfoPicture)
		if (infoPictureAns < 1) return ctx.body = {success: false, code: '0001', message: '未知错误4'};
		
		// 插入 tb_specName, tb_SpecValue,tb_goodDetail,tb_goodSpecConfig 数据
		let insertGoodDetail = 'insert into tb_goodDetail(goodId,isDisable, amount, price, indexx) values'
		if (Array.isArray(info.specName) && info.specName.length > 0) {
			// 有属性分类
			let insertSpecName = 'insert into tb_SpecName(specName, goodId, indexx) values'
			let insertSpecValue = 'insert into tb_SpecValue(specValue, goodId, indexx, specNameIndex) values'
			let insertSpecConfig = 'insert into tb_goodSpecConfig(goodId, detailIndex, specNameIndex, specValueIndex) values'
			let specValueIndex = 1
			// 拼接 tb_specName, tb_SpecValue
			let valueIndex = []
			for (let i = 0, len1 = info.specName.length; i < len1; i++) {
				let end1 = (i === len1-1) ? ';' : ','
				insertSpecName += (`('${info.specName[i]}',${goodId},${i+1})` + end1)
				valueIndex[i] = []
				for (let j = 0, len2 = info.specValue[i].length; j < len2; j++) {
					let end2 = (end1 === ';' && j === len2 - 1) ? ';' : ','
					insertSpecValue += (`('${info.specValue[i][j]}',${goodId},${specValueIndex},${i+1})` + end2)
					valueIndex[i][j] = specValueIndex
					specValueIndex++
				}
			}
			// 拼接 tb_goodDetail
			for (let i = 0, len = info.goodDetailInfo.length; i < len; i++) {
				let end = (i === len-1) ? ';' : ','
				insertGoodDetail += (`(${goodId}, ${info.goodDetailInfo[i].isDisable ? 1 : 0}, ${info.goodDetailInfo[i].amount || 0},${info.goodDetailInfo[i].price || 0},${i+1})` + end)
			}
			// 拼接 tb_goodSpecConfig 
			let valueCount = []
			var countArr = []
			for (let i = 0; i < info.specName.length;i++) {
				valueCount[i] = 0
				countArr[i] = (function(){
					var index = i
					var max = info.specValue[i].length
					return function (add) {
						if (add) {
							valueCount[index]++
							if (valueCount[index] >= max) {
								valueCount[index] = 0
								if (index !== 0) {
									countArr[index-1](true) // 上一位加一
								}
							}
						}
					}
				}())
			}
			for (let i = 0, len1 = info.goodDetailInfo.length; i < len1; i++) {
				for (let j = 0, len2 = info.specName.length; j < len2; j++) {
					let end = (i === len1-1 && j === len2-1) ? ';' : ','
					insertSpecConfig += (`(${goodId},${i+1},${j+1},${valueIndex[j][valueCount[j]]})` + end)
				}
				countArr[countArr.length-1](true)
			}
			const specNameAns = await db.executeNoQuery(insertSpecName)
			if (specNameAns < 1) return ctx.body = {success: false, code: '0001', message: '未知错误6'};
			const specValueAns = await db.executeNoQuery(insertSpecValue)
			if (specValueAns < 1) return ctx.body = {success: false, code: '0001', message: '未知错误7'};
			const specConfigAns = await db.executeNoQuery(insertSpecConfig)
			if (specConfigAns < 1) return ctx.body = {success: false, code: '0001', message: '未知错误8'};
		}else {
			// 无属性分类
			insertGoodDetail += `(${goodId},0,${info.goodDetailInfo[0].amount},${info.goodDetailInfo[0].price});`
		}
		const goodDetailAns = await db.executeNoQuery(insertGoodDetail)
		if (goodDetailAns < 1) return ctx.body = {success: false, code: '0001', message: '未知错误8'};
		ctx.body = {success: true, code: '0000', message: 'OK'}
	}catch (err) {
		console.error(err.message)
		ctx.body = {success: false, code: '9999', message: err.message}
	}
})


module.exports = router.routes();