const WebSocket = require('ws')
const jwt = require('jsonwebtoken')
const keys = require('../../config/keys')
const tokenValidator = require('../../validation/tokenValidator')
const db = require('../../config/mysqldb')

const users = require('./users')
const chat = require('./chat')

const wsserver = {
	wss: null,
	initSocket: function(server) {
		const wss = new WebSocket.Server({
			server: server, // 将注册函数绑定到 koa 返回的 http对象上，与 koa 监听同一个端口
			verifyClient: function(info) {
				const token = tokenValidator(info.req.url) // ws://url?token=xxx
				if (!token.isvalid) {
					return false // token 不合法，拒绝连接
				}
				delete token.payload.iat
				delete token.payload.exp
				// 给 ws 连接做上标记
				info.req.connection.token = token.payload
				return true
			}
		})

		wss.sendMsg = function(message) {
			for (let ws of wss.clients) {
				if (ws._sender._socket.token.userId === message.target) {
					ws.send(JSON.stringify(message))
					break
				}
			}
		}
		// 判断用户是否在线
		wss.isOnline = function(userId) {
			for (let ws of wss.clients) {
				if (ws._sender._socket.token.userId === userId && ws.readyState === WebSocket.OPEN) {
					return ws
				}
			}
			return null
		}
		/**
		 * hasClient(1) true/false
		 */
		// 群发消息
		wss.sendGroup = function(message) {
			for (let ws of wss.clients) {
				ws.send(message)
			}
		}

		wss.on('connection', function connection(ws) {
			// 查询未读消息记录返回
		    ws.on('message', function incoming(message) {
		    	// console.log(ws._sender._socket.token)
		    	// 判断消息类型
		    	let info = null;
		    	try {
		    		if (typeof message === 'string') {
						info = JSON.parse(message)
		    		}else if (Buffer.isBuffer(message)) {
						return chat.saveChatFile(ws, message)
		    		}else { return }
		    	}catch(err) {
					return
		    	}
		    	// 根据消息类型处理回复
		    	switch(info.type) {
					case 'transToken':  // 客户端请求一个新的token
						return ws.send(JSON.stringify({
							type: 'transToken', origin: 'koa', target: ws._sender._socket.token.userId,
							content: jwt.sign(ws._sender._socket.token, keys.tokenKey, {expiresIn: 60*20})
						}))
					case 'send_chat_message':  // 客户端发送消息
						chat.sendChatMessage(ws, info, wss)
						break
					case 'get_shop_cat':  // 获取购物车信息
						users.getShopCarInfo(ws)
						break
					case 'add_shopcar_product': // 购物车添加商品
						users.addShopCarProduct(ws, info)
						break
					case 'shop_car_number_minus':  // 购物车商品数量减一
						users.shopCarNumberMinus(ws, info)
						break
					case 'shop_car_number_plus':  // 购物车商品数量加一
						users.shopCarNumberPlus(ws, info)
						break
					case 'delete_shop_car_product':  // 购物车删除商品
						users.deleteShopCarProduct(ws, info)
						break
					case 'init_chat_messages':
						users.initChatMessage(ws)
						break
					case 'get_contacts':
						users.getContacts(ws, wss)
						break
					case 'add_contacts': // 添加好友
						users.addContacts(ws, info, wss)
						break
					case 'msg_be_read': // 消息已读
						users.messageBeRead(ws, info)
						break;
					// case 'buffer_start':
					// 	ws._sender._socket.filename = info.filename
					// case 'buffer_end':
					// 	delete ws._sender._socket.filename
					default:
						return
		    	}
		    })
		    
		})
		wsserver.wss = wss
		console.log('ws_running....')
		return wss
	}
}

module.exports = wsserver