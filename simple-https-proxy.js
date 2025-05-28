const https = require('https');
const http = require('http');
const fs = require('fs');
const url = require('url');

// 读取 SSL 证书
const sslOptions = {
  key: fs.readFileSync('/root/Shopify-API-Project/certs/key.pem'),
  cert: fs.readFileSync('/root/Shopify-API-Project/certs/cert.pem')
};

// 创建 HTTPS 服务器
const server = https.createServer(sslOptions, (req, res) => {
  // 解析请求 URL
  const parsedUrl = url.parse(req.url);
  
  // 创建代理请求选项
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: parsedUrl.path,
    method: req.method,
    headers: req.headers
  };

  // 创建代理请求
  const proxyReq = http.request(options, (proxyRes) => {
    // 设置响应头
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    // 传输响应数据
    proxyRes.pipe(res);
  });

  // 错误处理
  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Proxy error: ' + err.message);
  });

  // 传输请求数据
  req.pipe(proxyReq);
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