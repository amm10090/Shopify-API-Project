# Shopify Product Importer

一个全功能的 Shopify 产品导入应用，支持从 CJ 和 Pepperjam 联盟网络导入产品。

## 🚀 主要功能

- **多平台支持**: 支持 CJ (Commission Junction) 和 Pepperjam 联盟网络
- **智能产品导入**: 自动获取产品信息、图片和描述
- **原始数据保存**: 完整保存API原始响应数据，支持详细分析
- **智能匹配算法**: 多策略产品匹配，包括ID匹配、标题匹配、品牌匹配和模糊匹配
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

# API类型选择 (解决REST API弃用警告)
SHOPIFY_USE_GRAPHQL=true
SHOPIFY_SUPPRESS_REST_DEPRECATION_WARNINGS=true
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

## 🚨 常见问题排查

### API弃用警告解决方案

#### 问题症状
PM2日志中出现大量 `[shopify-api/WARNING] API Deprecation Notice` 警告：

```
[shopify-api/WARNING] API Deprecation Notice: {"message":"https://shopify.dev/api/admin-rest/latest/resources/product","path":"products"}
```

#### 解决方法

1. **启用GraphQL模式** (推荐)
   ```env
   SHOPIFY_USE_GRAPHQL=true
   ```

2. **或者抑制警告** (临时方案)
   ```env
   SHOPIFY_SUPPRESS_REST_DEPRECATION_WARNINGS=true
   ```

3. **重启应用**
   ```bash
   pm2 restart shopify-api-project
   ```

#### 技术细节
- 应用智能选择API类型：`SHOPIFY_USE_GRAPHQL=true` 时优先使用GraphQL
- GraphQL是Shopify推荐的新标准，性能更好且不会产生弃用警告
- REST API方法仍保留作为fallback选项

### 其他常见问题

#### 1. 数据库连接失败
```bash
# 检查数据库状态
sudo systemctl status postgresql
# 重启数据库
sudo systemctl restart postgresql
```

#### 2. Shopify认证失败
- 检查 `SHOPIFY_API_KEY` 和 `SHOPIFY_API_SECRET` 是否正确
- 确认应用URL与配置的隧道URL一致

#### 3. API配额限制
- CJ和Pepperjam API都有请求频率限制
- 查看日志中的API响应状态码
- 必要时调整 `REQUEST_DELAY` 参数

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

## 🔧 原始API数据保存功能

### 功能概述
系统现在完整保存所有API的原始响应数据到数据库的 `rawApiData` 字段中，确保数据的完整性和可追溯性。

### 工作原理

#### 1. 导入时自动保存
- 产品导入过程中自动获取并保存原始API响应数据
- 使用智能匹配算法将转换后的产品与原始API数据关联
- 支持CJ和Pepperjam两个平台的原始数据保存

#### 2. 多策略匹配算法
当查找产品的原始API数据时，系统使用以下匹配策略（按优先级排序）：

1. **精确ID匹配**: 通过源产品ID进行精确匹配
2. **标题匹配**: 多种标题匹配模式
   - 完全包含匹配
   - 清理特殊字符后匹配
   - 基于Jaccard相似度的关键词匹配（>50%相似度）
3. **品牌+部分标题匹配**: 验证品牌并进行部分标题匹配（>30%词汇匹配）
4. **模糊匹配**: 同品牌下相似度最高的产品（>20%相似度）

#### 3. 灵活的搜索策略
为提高匹配成功率，系统采用多种搜索策略：
- 使用产品标题关键词搜索
- 使用品牌名称搜索
- 使用已匹配的关键词搜索
- 无关键词限制的广泛搜索

### 技术实现

#### 数据库结构
```sql
-- Prisma schema中的rawApiData字段
rawApiData Json? // 存储完整的API原始响应
```

#### API端点
- `GET /api/products/:id/raw-data` - 获取产品的原始API数据
- 支持缓存机制，优先返回已保存的数据
- 当缓存不存在时，智能从源API重新获取

#### 故障排除

**问题**: 找不到原始API数据
**解决方案**:
1. 检查产品是否在源API中仍然可用
2. 验证品牌API配置是否正确
3. 查看日志了解匹配过程详情

**问题**: 匹配到错误的产品
**解决方案**:
1. 系统优先使用精确ID匹配
2. 多层验证确保匹配准确性
3. 详细日志记录匹配过程便于调试

## 🔗 相关链接

- [Shopify App Development](https://shopify.dev/apps)
- [Shopify Polaris](https://polaris.shopify.com/)
- [CJ Affiliate API](https://developers.cj.com/)
- [Pepperjam API Documentation](https://help.pepperjam.com/api/)

## 🚨 故障排除

### 网络连接问题

#### HTTP请求超时错误
**症状**：服务器日志中出现大量 `ERR_HTTP_REQUEST_TIMEOUT` 错误

**解决方案**：
- ✅ **自动错误节流**：重复错误在1分钟内仅记录一次，避免日志洪泛
- ✅ **智能超时设置**：30秒请求超时，20秒连接保持时间，适合云环境
- ✅ **Shopify API缓存**：验证结果缓存5分钟，减少不必要的API调用
- ✅ **连接池优化**：通过Agent配置优化网络连接复用

#### SendBeacon和沙盒错误
**症状**：Shopify iframe环境中的脚本限制和沙盒错误

**解决方案**：
- ✅ **iframe环境检测**：自动识别Shopify iframe环境
- ✅ **沙盒错误过滤**：静默处理预期的安全限制错误
- ✅ **API拦截保护**：安全包装可能导致沙盒错误的API调用

#### 网络错误分类处理
系统自动识别和处理以下网络错误：
- `HTTP2`/`PROTOCOL_ERROR`：代理环境协议错误
- `ECONNRESET`/`EPIPE`：连接重置错误
- `ETIMEDOUT`/`ENOTFOUND`：DNS和连接超时
- 通过错误节流机制避免重复日志记录

### 库存同步问题

**症状**：产品在API中显示有库存，但系统中显示缺货，手动修改后同步时又恢复为缺货。

**常见原因**：
1. **供应商产品ID变化**（最常见）
   - 供应商在API系统中更新了产品编号
   - 导致系统无法找到匹配产品进行同步
   
2. **API响应格式变化**
   - availability字段值格式发生变化
   - 转换逻辑无法正确处理新格式

**诊断步骤**：
1. 检查数据库中的sourceProductId
2. 获取API最新数据，比较产品ID
3. 验证availability字段的原始值和转换结果

**解决方案**：
- 如果是ID变化：更新数据库中的sourceProductId
- 如果是格式问题：调整转换逻辑以支持新格式
- 建议实施多字段匹配策略避免此类问题

**预防措施**：
- 定期监控产品ID变化
- 使用标题+品牌的备用匹配策略
- 记录和追踪所有同步异常