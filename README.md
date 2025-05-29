# Shopify Product Importer

一个全功能的 Shopify 产品导入应用，支持从 CJ 和 Pepperjam 联盟网络导入产品。

## 🚀 主要功能

- **多平台支持**: 支持 CJ (Commission Junction) 和 Pepperjam 联盟网络
- **智能产品导入**: 自动获取产品信息、图片和描述
- **实时同步**: 支持产品库存和价格的实时更新
- **品牌管理**: 集中管理导入的品牌和产品
- **仪表板**: 直观的数据统计和导入进度监控

## 🛠️ 技术栈

- **前端**: React 19 + TypeScript + Shopify Polaris
- **后端**: Node.js + Express + TypeScript
- **数据库**: PostgreSQL (Prisma ORM)
- **构建工具**: Vite + TSX
- **部署**: Shopify App Bridge + Cloudflare Tunnels

## 📋 环境要求

- Node.js >= 18.0.0
- npm >= 8.0.0 或 pnpm >= 8.0.0
- PostgreSQL 数据库

## ⚙️ 安装和配置

### 1. 克隆项目

```bash
git clone <repository-url>
cd Shopify-API-Project
```

### 2. 安装依赖

```bash
pnpm install
# 或
npm install
```

### 3. 配置环境变量

复制 `.env.example` 文件为 `.env` 并填写配置：

```bash
cp .env.example .env
```

关键环境变量说明：

```env
# Shopify应用配置
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_STORE_NAME=your-store.myshopify.com
SHOPIFY_APP_URL=https://your-tunnel-url.trycloudflare.com

# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/shopify_importer"

# API配置
CJ_API_KEY=your_cj_api_key
CJ_WEBSITE_ID=your_cj_website_id
PEPPERJAM_API_KEY=your_pepperjam_api_key
PEPPERJAM_PROGRAM_ID=your_pepperjam_program_id
```

### 4. 数据库设置

```bash
# 生成Prisma客户端
npm run db:generate

# 应用数据库迁移
npm run db:migrate

# (可选) 启动数据库管理界面
npm run db:studio
```

## 🚀 开发模式启动

### 使用Shopify CLI (推荐)

```bash
npm run shopify:dev
# 或
shopify app dev
```

### 手动启动

```bash
# 启动开发服务器
npm run dev

# 或者分别启动前后端
npm run dev:server  # 后端服务器
npm run dev:client  # 前端开发服务器
```

## 🔧 Shopify iframe嵌入问题解决方案

### 问题描述
- 本地访问 `localhost:3000` 正常
- Shopify商店预览中出现 "Refused to display in a frame" 错误
- Cloudflare 524 超时错误

### 解决方案

#### 1. CSP (Content Security Policy) 配置
应用已配置动态CSP以支持Shopify iframe嵌入：

```typescript
// 动态设置frame-ancestors
res.setHeader(
    'Content-Security-Policy',
    `frame-ancestors https://${shopDomain} https://admin.shopify.com https://*.shopify.com https://${tunnelDomain};`
);
```

#### 2. CORS配置
支持Cloudflare隧道和Shopify域名：

```typescript
const allowedOrigins = [
    /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/,
    /^https:\/\/admin\.shopify\.com$/,
    /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.trycloudflare\.com$/,
    // ... 其他域名
];
```

#### 3. 请求超时处理
防止Cloudflare 524错误：

```typescript
// 设置90秒超时（Cloudflare默认100秒）
req.setTimeout(90000);
res.setTimeout(90000);
```

#### 4. 环境变量配置
确保 `SHOPIFY_APP_URL` 设置为当前的Cloudflare隧道URL：

```env
SHOPIFY_APP_URL=https://your-current-tunnel.trycloudflare.com
```

### 调试步骤

1. **检查隧道URL**: 确保 `shopify.app.toml` 中的 `application_url` 与当前隧道匹配
2. **查看日志**: 检查服务器日志中的CSP和CORS相关信息
3. **浏览器开发者工具**: 查看Console和Network标签中的错误信息
4. **测试嵌入**: 直接访问Shopify Admin中的应用页面

## 📦 构建和部署

### 构建项目

```bash
npm run build
```

### 生产部署

```bash
# 构建并启动生产服务器
npm run start:prod

# 或者
npm run build
npm start
```

### Shopify应用部署

```bash
npm run shopify:deploy
```

## 🔍 可用脚本

- `npm run dev` - 启动开发服务器
- `npm run dev:shopify` - 使用Shopify CLI启动开发
- `npm run build` - 构建生产版本
- `npm run start` - 启动生产服务器
- `npm run db:generate` - 生成Prisma客户端
- `npm run db:migrate` - 运行数据库迁移
- `npm run db:studio` - 启动Prisma Studio
- `npm run lint` - 代码检查
- `npm run type-check` - TypeScript类型检查

## 📁 项目结构

```
Shopify-API-Project/
├── client/           # React前端应用
│   ├── components/   # 可复用组件
│   ├── pages/        # 页面组件
│   ├── contexts/     # React上下文
│   └── services/     # API服务
├── server/           # Express后端服务器
│   ├── routes/       # API路由
│   ├── services/     # 业务逻辑服务
│   ├── middleware/   # 中间件
│   └── utils/        # 工具函数
├── shared/           # 共享类型定义
├── prisma/           # 数据库模型和迁移
└── scripts/          # 构建和部署脚本
```

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 支持

如果遇到问题，请：

1. 查看本文档的故障排除部分
2. 检查 [Issues](../../issues) 页面
3. 创建新的 Issue 描述问题

## 🔗 相关链接

- [Shopify App Development](https://shopify.dev/apps)
- [Shopify Polaris](https://polaris.shopify.com/)
- [CJ Affiliate API](https://developers.cj.com/)
- [Pepperjam API Documentation](https://help.pepperjam.com/api/)