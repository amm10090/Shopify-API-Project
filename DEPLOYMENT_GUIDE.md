# Shopify应用部署指南

## 概述

本指南将帮助您将Shopify产品导入应用部署到生产环境。我们提供多种部署选项，从简单的云平台到自建服务器。

## 部署前准备

### 1. 环境要求
- Node.js 18+ 
- PostgreSQL 12+
- Redis (可选，用于缓存和队列)
- SSL证书 (HTTPS必需)

### 2. 构建应用
```bash
# 安装依赖
pnpm install

# 构建前端
pnpm run build:client

# 构建后端
pnpm run build:server

# 生成Prisma客户端
npx prisma generate
```

### 3. 环境变量配置
创建生产环境的 `.env` 文件：

```env
# 基本配置
NODE_ENV=production
PORT=3000

# 数据库
DATABASE_URL="postgresql://username:password@host:5432/database_name"

# Shopify Partners应用配置
SHOPIFY_API_KEY=your_api_key_from_partners
SHOPIFY_API_SECRET=your_api_secret_from_partners
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_collections,write_collections
SHOPIFY_HOST_NAME=your-domain.com
SHOPIFY_API_VERSION=2024-07

# API配置
CJ_API_TOKEN=your_cj_api_token
BRAND_CID=your_cj_company_id
ASCEND_API_KEY=your_pepperjam_api_key

# Redis (可选)
REDIS_URL=redis://localhost:6379

# 其他配置
CLIENT_URL=https://your-domain.com
LOG_LEVEL=info
DEFAULT_PRODUCT_LIMIT=50
SKIP_IMAGE_VALIDATION=false
```

## 部署选项

### 选项1: Railway (推荐 - 简单快速)

Railway是一个现代化的云平台，支持自动部署和数据库。

#### 步骤：

1. **注册Railway账户**
   - 访问 [railway.app](https://railway.app)
   - 使用GitHub账户登录

2. **创建新项目**
   ```bash
   # 安装Railway CLI
   npm install -g @railway/cli
   
   # 登录
   railway login
   
   # 在项目目录中初始化
   railway init
   ```

3. **添加PostgreSQL数据库**
   ```bash
   railway add postgresql
   ```

4. **配置环境变量**
   ```bash
   # 设置环境变量
   railway variables set NODE_ENV=production
   railway variables set SHOPIFY_API_KEY=your_api_key
   railway variables set SHOPIFY_API_SECRET=your_api_secret
   # ... 设置其他环境变量
   ```

5. **部署应用**
   ```bash
   # 部署
   railway up
   
   # 运行数据库迁移
   railway run npx prisma migrate deploy
   ```

6. **获取域名**
   ```bash
   # 生成Railway域名
   railway domain
   
   # 或绑定自定义域名
   railway domain add your-domain.com
   ```

### 选项2: Heroku

#### 步骤：

1. **安装Heroku CLI**
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   
   # 其他系统请访问 https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **创建Heroku应用**
   ```bash
   heroku create your-app-name
   heroku addons:create heroku-postgresql:mini
   heroku addons:create heroku-redis:mini
   ```

3. **配置环境变量**
   ```bash
   heroku config:set NODE_ENV=production
   heroku config:set SHOPIFY_API_KEY=your_api_key
   heroku config:set SHOPIFY_API_SECRET=your_api_secret
   # ... 设置其他环境变量
   ```

4. **创建Procfile**
   ```bash
   echo "web: node dist/server/index.js" > Procfile
   echo "release: npx prisma migrate deploy" >> Procfile
   ```

5. **部署**
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

### 选项3: DigitalOcean App Platform

#### 步骤：

1. **创建应用规范文件** (`app.yaml`)
   ```yaml
   name: shopify-product-importer
   services:
   - name: web
     source_dir: /
     github:
       repo: your-username/your-repo
       branch: main
     run_command: node dist/server/index.js
     environment_slug: node-js
     instance_count: 1
     instance_size_slug: basic-xxs
     envs:
     - key: NODE_ENV
       value: production
     - key: DATABASE_URL
       value: ${db.DATABASE_URL}
     - key: SHOPIFY_API_KEY
       value: your_api_key
       type: SECRET
     # ... 其他环境变量
   databases:
   - name: db
     engine: PG
     version: "12"
     size: basic-xs
   ```

2. **部署**
   - 在DigitalOcean控制台创建新应用
   - 上传 `app.yaml` 文件
   - 连接GitHub仓库
   - 配置环境变量
   - 部署应用

### 选项4: 自建服务器 (Ubuntu/CentOS)

#### 系统要求：
- Ubuntu 20.04+ 或 CentOS 8+
- 2GB+ RAM
- 20GB+ 存储空间

#### 步骤：

1. **安装Node.js**
   ```bash
   # Ubuntu
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # CentOS
   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
   sudo yum install -y nodejs
   ```

2. **安装PostgreSQL**
   ```bash
   # Ubuntu
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   
   # CentOS
   sudo yum install postgresql-server postgresql-contrib
   sudo postgresql-setup initdb
   sudo systemctl enable postgresql
   sudo systemctl start postgresql
   ```

3. **安装Redis (可选)**
   ```bash
   # Ubuntu
   sudo apt install redis-server
   
   # CentOS
   sudo yum install redis
   sudo systemctl enable redis
   sudo systemctl start redis
   ```

4. **安装PM2 (进程管理器)**
   ```bash
   npm install -g pm2
   ```

5. **配置数据库**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE shopify_app;
   CREATE USER app_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE shopify_app TO app_user;
   \q
   ```

6. **部署应用**
   ```bash
   # 克隆代码
   git clone https://github.com/your-username/your-repo.git
   cd your-repo
   
   # 安装依赖
   npm install
   
   # 构建应用
   npm run build
   
   # 运行数据库迁移
   npx prisma migrate deploy
   
   # 启动应用
   pm2 start dist/server/index.js --name "shopify-app"
   pm2 save
   pm2 startup
   ```

7. **配置Nginx反向代理**
   ```bash
   sudo apt install nginx
   ```

   创建Nginx配置文件 (`/etc/nginx/sites-available/shopify-app`)：
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   启用配置：
   ```bash
   sudo ln -s /etc/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

8. **配置SSL证书 (Let's Encrypt)**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

## 健康检查和监控

### 1. 创建健康检查脚本
```bash
# 创建健康检查脚本
cat > scripts/health-check.sh << 'EOF'
#!/bin/bash

# 健康检查脚本
HEALTH_URL="http://localhost:3000/health"
LOG_FILE="/var/log/shopify-app/health.log"

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

# 检查应用健康状态
response=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null)
timestamp=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$response" -eq 200 ]; then
    echo "[$timestamp] Application is healthy (HTTP $response)" >> "$LOG_FILE"
    exit 0
else
    echo "[$timestamp] Application is unhealthy (HTTP $response)" >> "$LOG_FILE"
    
    # 尝试重启应用
    echo "[$timestamp] Attempting to restart application..." >> "$LOG_FILE"
    pm2 restart shopify-app
    
    exit 1
fi
EOF

chmod +x scripts/health-check.sh
```

### 2. 设置定时健康检查
```bash
# 添加到crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /path/to/your/app/scripts/health-check.sh") | crontab -
```

### 3. 创建系统监控脚本
```bash
# 创建系统监控脚本
cat > scripts/system-monitor.sh << 'EOF'
#!/bin/bash

# 系统监控脚本
LOG_FILE="/var/log/shopify-app/system.log"
timestamp=$(date '+%Y-%m-%d %H:%M:%S')

# 获取系统信息
cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
memory_usage=$(free | grep Mem | awk '{printf("%.1f", $3/$2 * 100.0)}')
disk_usage=$(df -h / | awk 'NR==2{printf "%s", $5}')

# 获取应用进程信息
pm2_status=$(pm2 jlist | jq -r '.[] | select(.name=="shopify-app") | .pm2_env.status' 2>/dev/null || echo "unknown")

# 记录日志
echo "[$timestamp] CPU: ${cpu_usage}%, Memory: ${memory_usage}%, Disk: ${disk_usage}, PM2 Status: ${pm2_status}" >> "$LOG_FILE"

# 检查资源使用率警告
if (( $(echo "$memory_usage > 80" | bc -l) )); then
    echo "[$timestamp] WARNING: High memory usage: ${memory_usage}%" >> "$LOG_FILE"
fi

if [[ "${cpu_usage%.*}" -gt 80 ]]; then
    echo "[$timestamp] WARNING: High CPU usage: ${cpu_usage}%" >> "$LOG_FILE"
fi
EOF

chmod +x scripts/system-monitor.sh

# 每10分钟运行一次系统监控
(crontab -l 2>/dev/null; echo "*/10 * * * * /path/to/your/app/scripts/system-monitor.sh") | crontab -
```

## 数据库迁移

### 生产环境迁移
```bash
# 运行迁移
npx prisma migrate deploy

# 如果需要重置数据库 (谨慎使用)
npx prisma migrate reset --force

# 查看迁移状态
npx prisma migrate status
```

### 备份和恢复
```bash
# 备份数据库
pg_dump $DATABASE_URL > backup.sql

# 恢复数据库
psql $DATABASE_URL < backup.sql

# 自动化备份脚本
cat > scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/shopify-app"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup_$DATE.sql"

mkdir -p "$BACKUP_DIR"
pg_dump $DATABASE_URL > "$BACKUP_FILE"
gzip "$BACKUP_FILE"

# 保留最近7天的备份
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: ${BACKUP_FILE}.gz"
EOF

chmod +x scripts/backup-db.sh

# 每天凌晨2点自动备份
(crontab -l 2>/dev/null; echo "0 2 * * * /path/to/your/app/scripts/backup-db.sh") | crontab -
```

## 监控和日志

### 1. 应用监控
```bash
# PM2监控
pm2 monit

# 查看日志
pm2 logs shopify-app

# 重启应用
pm2 restart shopify-app

# 查看应用状态
pm2 status
```

### 2. 日志管理
```bash
# 配置日志轮转
sudo nano /etc/logrotate.d/shopify-app

# 内容：
/var/log/shopify-app/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 0644 app app
    postrotate
        pm2 reloadLogs
    endscript
}

/home/app/.pm2/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 0644 app app
}
```

### 3. 性能监控工具推荐
- **Uptime监控**: UptimeRobot, Pingdom
- **性能监控**: New Relic, DataDog
- **错误追踪**: Sentry
- **日志聚合**: LogRocket, Papertrail

## 安全配置

### 1. 防火墙设置
```bash
# Ubuntu UFW
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# CentOS Firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 2. 环境变量安全
- 使用强密码
- 定期轮换API密钥
- 限制数据库访问权限
- 使用环境变量而非硬编码

### 3. 应用安全
- 启用HTTPS
- 设置适当的CORS策略
- 使用Helmet.js安全头
- 定期更新依赖

## 性能优化

### 1. 数据库优化
```sql
-- 创建索引
CREATE INDEX idx_products_brand_id ON "Product"("brandId");
CREATE INDEX idx_products_import_status ON "Product"("importStatus");
CREATE INDEX idx_products_source_api ON "Product"("sourceApi");
CREATE INDEX idx_products_last_updated ON "Product"("lastUpdated");
CREATE INDEX idx_shopify_sessions_shop ON "ShopifySession"("shop");
```

### 2. 缓存策略
```javascript
// Redis缓存配置
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

// 缓存API响应
app.use('/api', cacheMiddleware);
```

### 3. 负载均衡
```bash
# PM2集群模式
pm2 start dist/server/index.js -i max --name "shopify-app"
```

## 故障排除

### 常见问题

1. **数据库连接失败**
   ```bash
   # 检查数据库状态
   sudo systemctl status postgresql
   
   # 检查连接
   psql $DATABASE_URL -c "SELECT 1"
   ```

2. **应用启动失败**
   ```bash
   # 检查日志
   pm2 logs shopify-app
   
   # 检查端口占用
   sudo netstat -tlnp | grep :3000
   ```

3. **SSL证书问题**
   ```bash
   # 续期证书
   sudo certbot renew
   
   # 测试续期
   sudo certbot renew --dry-run
   ```

4. **内存不足**
   ```bash
   # 检查内存使用
   free -h
   
   # 重启应用释放内存
   pm2 restart shopify-app
   ```

## 更新和维护

### 1. 应用更新
```bash
# 创建更新脚本
cat > scripts/update-app.sh << 'EOF'
#!/bin/bash
set -e

echo "Starting application update..."

# 备份当前版本
cp -r dist dist.backup.$(date +%Y%m%d_%H%M%S)

# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 构建应用
npm run build

# 运行数据库迁移
npx prisma migrate deploy

# 重启应用
pm2 restart shopify-app

echo "Application update completed successfully!"
EOF

chmod +x scripts/update-app.sh
```

### 2. 零停机部署
```bash
# 使用PM2的reload功能
pm2 reload shopify-app
```

### 3. 回滚策略
```bash
# 创建回滚脚本
cat > scripts/rollback.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="dist.backup.$1"

if [ ! -d "$BACKUP_DIR" ]; then
    echo "Backup directory $BACKUP_DIR not found!"
    exit 1
fi

echo "Rolling back to $BACKUP_DIR..."

# 停止应用
pm2 stop shopify-app

# 恢复备份
rm -rf dist
mv "$BACKUP_DIR" dist

# 重启应用
pm2 start shopify-app

echo "Rollback completed!"
EOF

chmod +x scripts/rollback.sh
```

## 成本优化

### 1. 资源监控
- 监控CPU和内存使用
- 优化数据库查询
- 使用CDN加速静态资源

### 2. 自动扩缩容
对于云平台部署，可以配置自动扩缩容：

```yaml
# Railway 自动扩缩容示例
services:
  web:
    autoscaling:
      min_instances: 1
      max_instances: 5
      target_cpu: 70
```

## 支持和维护

### 联系方式
- 技术支持: support@yourcompany.com
- 文档更新: docs@yourcompany.com

### 相关资源
- [Shopify Partners文档](https://partners.shopify.com/docs)
- [Shopify API文档](https://shopify.dev/docs)
- [Railway文档](https://docs.railway.app)
- [Heroku文档](https://devcenter.heroku.com)

---

**注意**: 部署到生产环境前，请确保在测试环境中充分测试所有功能。建议使用CI/CD流水线自动化部署过程。 