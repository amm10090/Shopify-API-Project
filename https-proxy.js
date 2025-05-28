const https = require('https');
const httpProxy = require('http-proxy');
const fs = require('fs');

// 创建代理服务器
const proxy = httpProxy.createProxyServer({});

// 读取 SSL 证书
const sslOptions = {
  key: fs.readFileSync('/root/Shopify-API-Project/certs/key.pem'),
  cert: fs.readFileSync('/root/Shopify-API-Project/certs/cert.pem')
};

// 创建 HTTPS 服务器，代理到本地 HTTP 服务器
const server = https.createServer(sslOptions, (req, res) => {
  proxy.web(req, res, {
    target: 'http://localhost:3000',
    secure: false,
    changeOrigin: true
  });
});

// 错误处理
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  if (!res.headersSent) {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Proxy error: ' + err.message);
  }
});

const PORT = 8443;server.listen(PORT, () => {
  console.log(`🔒 HTTPS Proxy server running on port ${PORT}`);
  console.log(`📡 Proxying HTTPS requests to http://localhost:3000`);
  console.log(`🌐 Access your app at: https://69.62.86.176:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down HTTPS proxy...');
  server.close(() => {
    console.log('✅ HTTPS proxy closed');
    process.exit(0);
  });
});