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

  console.log(`[${new Date().toISOString()}] ${req.method} ${parsedUrl.path} -> Backend:3000`);

  // 设置响应头以允许iframe嵌入
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shopify-*');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 创建代理请求选项 - 所有请求都转发到后端
  const backendPort = process.env.BACKEND_PORT || 3000;
  const options = {
    hostname: 'localhost',
    port: backendPort,
    path: parsedUrl.path,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${backendPort}`,
      // 确保正确转发协议信息
      'x-forwarded-proto': 'https',
      'x-forwarded-for': req.connection.remoteAddress,
      'x-forwarded-host': req.headers.host
    },
    timeout: 30000 // 30秒超时
  };

  // 创建代理请求
  const proxyReq = http.request(options, (proxyRes) => {
    // 复制响应头，但移除可能冲突的安全头
    const responseHeaders = { ...proxyRes.headers };
    delete responseHeaders['x-frame-options'];

    // 设置响应头
    res.writeHead(proxyRes.statusCode, responseHeaders);
    // 传输响应数据
    proxyRes.pipe(res);
  });

  // 错误处理
  proxyReq.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Proxy Error:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Bad Gateway',
        message: 'Backend server is not responding',
        timestamp: new Date().toISOString()
      }));
    }
  });

  // 超时处理
  proxyReq.on('timeout', () => {
    console.error(`[${new Date().toISOString()}] Proxy Timeout for ${req.method} ${parsedUrl.path}`);
    if (!res.headersSent) {
      res.writeHead(524, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Timeout',
        message: 'Backend server took too long to respond',
        timestamp: new Date().toISOString()
      }));
    }
    proxyReq.destroy();
  });

  // 传输请求数据
  req.pipe(proxyReq);

  // 处理请求错误
  req.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Request Error:`, err.message);
    proxyReq.destroy();
  });
});

const PORT = 8443;
const backendPort = process.env.BACKEND_PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔒 HTTPS Proxy server running on port ${PORT}`);
  console.log(`📡 Proxying all requests to Backend: http://localhost:${backendPort}`);
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