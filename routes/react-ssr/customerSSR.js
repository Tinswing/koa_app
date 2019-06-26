const ReactSSR = require('react-dom/server')
const fs = require('fs')
const path = require('path')
const url = require('url')

const createApp = require('../../views/customer/server-entry.js').default
let template = fs.readFileSync(path.join(__dirname, '../../views/customer/index.html'), 'utf-8')

module.exports = async (ctx, next) => {
	try {
		const appString = ReactSSR.renderToString(createApp(null, decodeURIComponent(ctx.request.url), null))
		ctx.response.type = 'html'
		ctx.body = template.replace('<!--app-->', appString)
	}catch(err) {
		console.error('react-ssr --->', err.message)
	}
}