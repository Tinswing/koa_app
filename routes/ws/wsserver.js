const WebSocket = require('ws')
const cookie = require('cookie')
const jwt = require('jsonwebtoken')
const keys = require('../../config/keys')
const tokenValidator = require('../../validation/tokenValidator')

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
		// { type: 'chat', origin: int, target: int, content: ''}
		wss.sendMsg = function(message) {
			for (let ws of wss.clients) {
				if (ws._sender._socket.token.userId === message.target) {
					ws.send(JSON.stringify(message))
					break
				}
			}
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
		wss.on('connection', function(ws) {
			// 查询未读消息记录返回
		    ws.on('message', function(message) {
		    	// console.log(ws._sender._socket.token)
		    	// 判断消息类型
		    	let info = null;
		    	try {
					info = JSON.parse(message)
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