# Shopify Partners 应用设置和部署指南

## 概述

本指南将帮助您将现有的Shopify产品导入应用转换为可在Shopify Partners中分发的公开应用。

## 当前状态分析

您的应用目前具备：
- ✅ 完整的OAuth认证系统 (`server/routes/auth.ts`)
- ✅ 会话管理和数据库存储 (`prisma/schema.prisma`)
- ✅ Shopify API集成 (`server/services/ShopifyService.ts`)
- ✅ 产品导入功能 (CJ和Pepperjam API)
- ✅ 现代化的React前端界面

## 第一步：在Shopify Partners中创建应用

### 1. 注册Shopify Partners账户
1. 访问 [partners.shopify.com](https://partners.shopify.com)
2. 注册或登录您的Partners账户
3. 完成账户验证

### 2. 创建新应用
1. 在Partners Dashboard中点击 "Apps" → "Create app"
2. 选择 "Create app manually"
3. 填写应用信息：
   - **App name**: Product Importer
   - **App URL**: `https://your-domain.com` (稍后更新)
   - **Allowed redirection URL(s)**: `https://your-domain.com/auth/shopify/callback`

### 3. 配置应用权限
在应用设置中配置以下权限范围：
```
read_products
write_products
read_inventory
write_inventory
read_product_listings
write_product_listings
read_collections
write_collections
read_content
write_content
```

## 第二步：更新环境变量

更新您的 `.env` 文件：

```env
# Shopify Partners应用配置
SHOPIFY_API_KEY=your_api_key_from_partners_dashboard
SHOPIFY_API_SECRET=your_api_secret_from_partners_dashboard
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_collections,write_collections,read_content,write_content
SHOPIFY_HOST_NAME=your-production-domain.com
SHOPIFY_API_VERSION=2024-07

# 移除这些（仅用于Custom App）
# SHOPIFY_ACCESS_TOKEN=
# SHOPIFY_STORE_NAME=

# 保留现有的其他配置
DATABASE_URL="postgresql://username:password@localhost:5432/shopify_app"
CJ_API_TOKEN="your_cj_api_token"
ASCEND_API_KEY="your_pepperjam_api_key"
# ... 其他配置
```

## 第三步：本地开发和测试

### 1. 安装ngrok（用于本地测试）
```bash
# 使用npm安装
npm install -g ngrok

# 或使用官方安装包
# 下载：https://ngrok.com/download
```

### 2. 启动本地开发环境
```bash
# 启动应用
pnpm run dev

# 在另一个终端启动ngrok
ngrok http 3000
```

### 3. 更新Partners Dashboard中的URL
1. 复制ngrok提供的HTTPS URL (例如: `https://abc123.ngrok.io`)
2. 在Partners Dashboard中更新：
   - **App URL**: `https://abc123.ngrok.io`
   - **Allowed redirection URL(s)**: `https://abc123.ngrok.io/auth/shopify/callback`

### 4. 创建开发商店进行测试
1. 在Partners Dashboard中创建开发商店
2. 在开发商店中安装您的应用
3. 测试OAuth流程和所有功能

## 第四步：功能测试清单

在提交审核前，确保以下功能正常工作：

### OAuth和会话管理
- [ ] 应用安装流程 (`/auth/shopify`)
- [ ] OAuth回调处理 (`/auth/shopify/callback`)
- [ ] 会话验证中间件
- [ ] 应用卸载处理

### 核心功能
- [ ] 品牌管理 (CJ和Pepperjam)
- [ ] 产品导入和同步
- [ ] Shopify产品创建/更新
- [ ] 产品集合管理
- [ ] 元字段设置（联盟链接）
- [ ] 仪表板数据显示

### 错误处理
- [ ] API限制处理
- [ ] 网络错误重试
- [ ] 用户友好的错误消息
- [ ] 日志记录

## 第五步：生产环境部署

### 1. 选择托管平台
推荐选项：
- **Heroku**: 简单易用，适合快速部署
- **Railway**: 现代化平台，支持PostgreSQL
- **DigitalOcean App Platform**: 性价比高
- **AWS/GCP**: 企业级解决方案

### 2. 数据库设置
```bash
# 运行数据库迁移
npx prisma migrate deploy

# 生成Prisma客户端
npx prisma generate
```

### 3. 环境变量配置
在生产环境中设置所有必需的环境变量：
```env
NODE_ENV=production
DATABASE_URL=your_production_database_url
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_HOST_NAME=your-production-domain.com
# ... 其他配置
```

### 4. 更新Partners Dashboard
将生产环境URL更新到Partners Dashboard：
- **App URL**: `https://your-production-domain.com`
- **Allowed redirection URL(s)**: `https://your-production-domain.com/auth/shopify/callback`

## 第六步：应用审核准备

### 1. 准备审核材料
- **应用截图**: 展示主要功能界面
- **演示视频**: 3-5分钟功能演示
- **应用描述**: 详细说明功能和价值
- **隐私政策**: 数据处理和隐私保护
- **支持文档**: 用户使用指南

### 2. 代码质量检查
```bash
# 运行类型检查
pnpm run type-check

# 运行代码检查
pnpm run lint

# 构建生产版本
pnpm run build
```

### 3. 性能优化
- 启用数据库连接池
- 实现API请求缓存
- 优化图片加载
- 设置适当的错误边界

## 第七步：提交审核

### 1. 应用商店提交
1. 在Partners Dashboard中点击 "Submit for review"
2. 填写所有必需信息
3. 上传截图和视频
4. 设置定价策略（如果收费）

### 2. 审核要点
Shopify会检查：
- **功能性**: 应用是否按描述工作
- **用户体验**: 界面是否直观易用
- **性能**: 加载速度和响应时间
- **安全性**: 数据处理和API使用
- **合规性**: 遵循Shopify政策

### 3. 常见审核问题
- 权限范围过于宽泛
- 错误处理不充分
- 用户界面不符合Polaris设计规范
- 缺少必要的文档

## 第八步：分发策略

### 1. 应用商店发布
- 完成审核后在Shopify App Store公开发布
- 设置合理的定价策略
- 准备营销材料和SEO优化

### 2. 直接安装
- 为特定客户提供直接安装链接
- 支持白标解决方案
- 提供定制化服务

### 3. 合作伙伴分发
- 与Shopify Plus合作伙伴合作
- 参与Shopify生态系统活动
- 建立渠道合作关系

## 故障排除

### 常见问题

**1. OAuth认证失败**
- 检查API密钥和回调URL配置
- 确认权限范围设置正确
- 验证ngrok或生产域名可访问

**2. 会话存储问题**
- 检查数据库连接
- 验证Prisma模式是否最新
- 确认会话存储逻辑正确

**3. API限制错误**
- 实现适当的重试机制
- 添加请求限制处理
- 监控API使用情况

### 调试工具
```bash
# 查看应用日志
tail -f logs/app.log

# 检查数据库连接
npx prisma studio

# 测试API端点
curl -X GET https://your-domain.com/health
```

## 下一步

1. **监控和分析**: 设置应用性能监控
2. **用户反馈**: 收集和处理用户反馈
3. **功能迭代**: 根据用户需求添加新功能
4. **扩展集成**: 支持更多联盟营销平台

## 支持资源

- [Shopify Partners文档](https://partners.shopify.com/docs)
- [Shopify API文档](https://shopify.dev/docs)
- [App Store审核指南](https://shopify.dev/docs/apps/store/review-guidelines)
- [Polaris设计系统](https://polaris.shopify.com/)

---

**注意**: 这个过程可能需要几周时间完成，特别是应用审核阶段。请确保充分测试所有功能，并准备好响应Shopify的审核反馈。 