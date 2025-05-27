# 生产环境部署指南

## 快速开始

**重要：在生产环境中，你只需要启动一个服务进程！**

### 1. 构建应用

```bash
# 方式1：使用部署脚本（推荐）
./scripts/deploy.sh

# 方式2：手动构建
pnpm install
pnpm run build
npx prisma generate
```

### 2. 检查环境

```bash
# 检查构建文件和环境变量
./scripts/production-check.sh
```

### 3. 运行数据库迁移

```bash
# 部署数据库迁移
pnpm run prod:migrate
```

### 4. 启动应用

```bash
# 方式1：使用npm脚本
pnpm start

# 方式2：直接运行
NODE_ENV=production node dist/server/index.js

# 方式3：使用PM2（推荐）
pm2 start dist/server/index.js --name "shopify-app"
```

## 为什么只需要启动服务端？

### 架构说明

这是一个**单体应用架构**，前端和后端在生产环境中被整合为一个服务：

1. **前端构建**：React应用被构建为静态文件（HTML、CSS、JS）
2. **后端集成**：Express服务器提供API服务并托管前端静态文件
3. **单一入口**：所有请求都通过Express服务器处理

### 文件结构

```
dist/
├── server/           # 编译后的服务端代码
│   ├── index.js     # 主入口文件 ⭐
│   ├── routes/      # API路由
│   ├── services/    # 业务逻辑
│   └── ...
└── client/          # 构建后的前端静态文件
    ├── index.html   # 前端入口
    ├── assets/      # CSS、JS等资源
    └── ...
```

### 请求处理流程

```
用户请求 → Express服务器 → 路由判断
                           ├── /api/* → API处理
                           ├── /auth/* → 认证处理
                           └── /* → 返回前端静态文件
```

## 环境变量配置

### 必需变量

```env
NODE_ENV=production
DATABASE_URL=postgresql://username:password@host:5432/database
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
```

### 可选变量

```env
# API配置
CJ_API_TOKEN=your_cj_api_token
BRAND_CID=your_cj_company_id
ASCEND_API_KEY=your_pepperjam_api_key

# 其他配置
PORT=3000
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
```

## 部署脚本说明

### `./scripts/deploy.sh`
- 清理旧构建文件
- 安装依赖
- 构建前端和后端
- 生成Prisma客户端
- 验证构建结果

### `./scripts/production-check.sh`
- 检查构建文件是否存在
- 验证环境变量配置
- 检查运行环境
- 提供启动建议

## 常用命令

```bash
# 构建和部署
pnpm run deploy              # 运行部署脚本
pnpm run build              # 构建应用
pnpm run prod:check         # 检查生产环境
pnpm run prod:migrate       # 运行数据库迁移

# 启动应用
pnpm start                  # 启动生产服务器
pnpm run start:prod         # 明确指定生产环境启动

# 开发环境（仅用于开发）
pnpm run dev               # 启动开发服务器（前端+后端）
pnpm run dev:server        # 仅启动后端开发服务器
pnpm run dev:client        # 仅启动前端开发服务器
```

## 监控和维护

### 使用PM2管理进程

```bash
# 启动应用
pm2 start dist/server/index.js --name "shopify-app"

# 查看状态
pm2 status

# 查看日志
pm2 logs shopify-app

# 重启应用
pm2 restart shopify-app

# 停止应用
pm2 stop shopify-app
```

### 健康检查

应用提供健康检查端点：

```bash
curl http://localhost:3000/health
```

响应示例：
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

## 故障排除

### 常见问题

1. **构建文件不存在**
   ```bash
   # 重新构建
   pnpm run build
   ```

2. **环境变量未配置**
   ```bash
   # 检查环境变量
   ./scripts/production-check.sh
   ```

3. **数据库连接失败**
   ```bash
   # 检查数据库URL
   echo $DATABASE_URL
   
   # 运行迁移
   pnpm run prod:migrate
   ```

4. **端口被占用**
   ```bash
   # 检查端口使用
   lsof -i :3000
   
   # 或使用其他端口
   PORT=8000 pnpm start
   ```

### 日志查看

```bash
# 应用日志
tail -f logs/combined.log

# 错误日志
tail -f logs/error.log

# PM2日志
pm2 logs shopify-app
```

## 性能优化

### 生产环境优化

1. **启用压缩**：Express已配置gzip压缩
2. **静态文件缓存**：设置适当的缓存头
3. **数据库连接池**：Prisma自动管理连接池
4. **Redis缓存**：可选，用于会话和缓存

### 扩展建议

1. **负载均衡**：使用Nginx或云负载均衡器
2. **CDN**：为静态资源配置CDN
3. **监控**：集成APM工具（如New Relic、DataDog）
4. **备份**：定期备份数据库

## 安全注意事项

1. **环境变量**：不要在代码中硬编码敏感信息
2. **HTTPS**：生产环境必须使用HTTPS
3. **防火墙**：只开放必要的端口
4. **更新**：定期更新依赖包

---

**总结：生产环境只需要运行一个命令启动服务端，它会自动处理所有前端和API请求。** 