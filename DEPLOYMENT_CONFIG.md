# Shopify 应用部署配置说明

## 域名配置

您的 Shopify 应用现在已配置为使用自定义域名：**https://shopify.amoze.cc**

## 已完成的配置

### 1. Shopify 应用配置 (shopify.app.toml)
- ✅ 应用 URL: `https://shopify.amoze.cc`
- ✅ 认证回调 URL: 已更新为使用自定义域名
- ✅ 应用代理 URL: 已更新为使用自定义域名

### 2. 环境变量配置 (.env)
- ✅ `APPLICATION_URL="https://shopify.amoze.cc"`
- ✅ `SHOPIFY_APP_URL="https://shopify.amoze.cc"`
- ✅ `SHOPIFY_HOST_NAME="shopify.amoze.cc"`

### 3. Nginx 反向代理配置
- ✅ 配置文件: `/etc/nginx/sites-available/shopify.amoze.cc`
- ✅ HTTP -> HTTPS 重定向
- ✅ SSL 配置（当前使用自签名证书）
- ✅ 反向代理到本地端口 3000
- ✅ WebSocket 支持
- ✅ 静态文件优化
- ✅ API 路由代理

### 4. 服务器代码更新
- ✅ 更新了 CSP 头部以包含自定义域名
- ✅ 移除了硬编码的 Cloudflare 隧道 URL

## 需要完成的步骤

### 1. DNS 配置
您需要在域名 `amoze.cc` 的 DNS 设置中添加以下记录：

```
A记录: shopify.amoze.cc -> [您的服务器IP地址]
```

### 2. SSL 证书配置
当前使用的是自签名证书，建议配置正式的 SSL 证书：

#### 选项 1: Let's Encrypt（推荐）
```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d shopify.amoze.cc

# 自动续期
crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

#### 选项 2: 商业证书
将证书文件放置到服务器并更新 nginx 配置：
```nginx
ssl_certificate /path/to/your/certificate.crt;
ssl_certificate_key /path/to/your/private.key;
```

### 3. 防火墙配置
确保防火墙允许以下端口：
```bash
ufw allow 80/tcp
ufw allow 443/tcp
```

## 测试配置

### 1. 本地测试
```bash
# 测试 HTTP 重定向
curl -I -H "Host: shopify.amoze.cc" http://localhost

# 测试 HTTPS 代理
curl -k -I -H "Host: shopify.amoze.cc" https://localhost/?shop=amm10090.myshopify.com
```

### 2. 应用启动
```bash
cd /root/Shopify-API-Project
npm run dev
```

## 服务状态检查

### 检查应用
```bash
ps aux | grep -E '(node.*dev|shopify)'
netstat -tlnp | grep 3000
```

### 检查 Nginx
```bash
systemctl status nginx
nginx -t
```

### 检查日志
```bash
# Nginx 日志
tail -f /var/log/nginx/shopify.amoze.cc.access.log
tail -f /var/log/nginx/shopify.amoze.cc.error.log

# 应用日志
cd /root/Shopify-API-Project && npm run dev
```

## 重要提醒

1. **备份配置**: 定期备份 nginx 配置和应用配置
2. **监控服务**: 建议设置监控确保服务正常运行
3. **更新证书**: 如使用 Let's Encrypt，确保自动续期正常工作
4. **安全设置**: 考虑额外的安全配置，如 fail2ban 等

## 故障排除

### 应用无法访问
1. 检查应用是否运行在端口 3000
2. 检查 nginx 配置是否正确
3. 检查防火墙设置

### SSL 错误
1. 验证证书路径和权限
2. 检查域名是否正确解析
3. 验证证书有效期

### Shopify 认证问题
1. 确认 Shopify 合作伙伴账户中的应用 URL 设置
2. 检查认证回调 URL 配置
3. 验证 CSP 头部是否包含正确的域名

配置完成后，您的 Shopify 应用将通过 `https://shopify.amoze.cc` 访问，不再依赖 Cloudflare 隧道。