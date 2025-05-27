# Shopify应用配置指南

## 必需的权限范围（Scopes）

根据应用功能，需要以下Shopify API权限：

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

## 应用配置

### 1. 基本信息
- **应用名称**: Product Importer
- **应用描述**: 从CJ和Pepperjam API导入产品到Shopify商店
- **应用类型**: Public App（公开应用）

### 2. URL配置
- **应用URL**: `https://your-domain.com`
- **重定向URL**: `https://your-domain.com/auth/callback`
- **Webhook URL**: `https://your-domain.com/webhooks/shopify`

### 3. 环境变量配置

在你的`.env`文件中添加以下配置：

```env
# Shopify应用配置
SHOPIFY_API_KEY=your_api_key_from_partners
SHOPIFY_API_SECRET=your_api_secret_from_partners
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_collections,write_collections
SHOPIFY_HOST_NAME=your-domain.com
SHOPIFY_API_VERSION=2024-07

# 现有的其他配置保持不变
CJ_API_TOKEN=your_cj_token
BRAND_CID=your_cj_company_id
ASCEND_API_KEY=your_pepperjam_key
```

### 4. 应用架构

你的应用是一个**嵌入式应用**，需要：
- 支持Shopify OAuth认证流程
- 处理应用安装和卸载
- 提供嵌入式界面（在Shopify Admin中显示）

## 开发环境设置

### 1. 使用ngrok进行本地开发
```bash
# 安装ngrok
npm install -g ngrok

# 启动你的应用
npm run dev

# 在另一个终端中启动ngrok
ngrok http 3000
```

### 2. 更新Partners Dashboard中的URL
将ngrok提供的HTTPS URL更新到Partners Dashboard中：
- App URL: `https://your-ngrok-id.ngrok.io`
- Redirection URL: `https://your-ngrok-id.ngrok.io/auth/callback`

## 测试流程

### 1. 创建开发商店
1. 在Partners Dashboard中创建开发商店
2. 在开发商店中安装你的应用
3. 测试所有功能

### 2. 功能测试清单
- [ ] OAuth认证流程
- [ ] 品牌管理功能
- [ ] 产品导入功能
- [ ] Shopify产品创建/更新
- [ ] 产品集合管理
- [ ] 元字段设置（联盟链接）
- [ ] 错误处理和日志记录

## 部署准备

### 1. 生产环境配置
- 确保所有环境变量正确设置
- 配置HTTPS证书
- 设置数据库（PostgreSQL推荐）
- 配置Redis（如果使用）

### 2. 性能优化
- 启用数据库连接池
- 配置适当的API限制
- 实现缓存策略
- 设置监控和日志

## 应用提交审核

### 1. 准备材料
- 应用截图和演示视频
- 详细的应用描述
- 隐私政策和服务条款
- 支持文档

### 2. 审核要点
- 遵循Shopify设计规范
- 确保数据安全和隐私保护
- 提供良好的用户体验
- 处理边缘情况和错误

## 分发策略

### 1. 应用商店发布
- 完成Shopify App Store审核
- 设置定价策略
- 准备营销材料

### 2. 直接安装
- 提供安装链接给特定商家
- 支持白标解决方案
- 提供技术支持 