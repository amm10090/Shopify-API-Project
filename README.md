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
- **🔗 Webhook集成**: 自动监听Shopify商品删除事件，实时同步商品状态

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

## 🔗 Webhook配置

### 概述
应用集成了Shopify webhooks来实时监听商品删除事件，当在Shopify中删除了导入的商品后，会自动更新本地数据库中的商品状态为"未导入"。

### 自动配置
应用会在OAuth认证成功后自动注册必需的webhooks：

- **products/delete**: 监听商品删除事件
- **products/update**: 监听商品更新事件  
- **app/uninstalled**: 监听应用卸载事件

### 通过设置页面管理
在应用的"设置"页面中，您可以：

1. **查看Webhook状态**: 实时显示webhook配置状态
2. **验证配置**: 检查所有webhook是否正确注册
3. **修复配置**: 自动修复缺失或错误的webhook
4. **重新注册**: 手动重新注册所有webhooks
5. **管理详情**: 查看每个webhook的详细信息

### 使用说明

#### 1. 自动注册（推荐）
- 应用安装后会自动注册所有必需的webhooks
- 在设置页面可以验证和监控状态

#### 2. 手动管理
如果需要手动操作：
```bash
# 注册webhooks
POST /api/webhook-management/register

# 验证配置
GET /api/webhook-management/validate

# 修复配置
POST /api/webhook-management/repair
```

#### 3. 故障排除
如果webhook未正常工作：
1. 在设置页面检查webhook状态
2. 点击"验证配置"查看详细问题
3. 使用"修复配置"自动解决问题
4. 必要时重新注册webhook

### 安全特性
- **HMAC-SHA256签名验证**: 确保webhook来源可信
- **重复事件检测**: 防止重复处理同一事件
- **时间戳验证**: 拒绝过期的webhook请求

详细配置指南请查看：[WEBHOOK_CONFIGURATION_GUIDE.md](./WEBHOOK_CONFIGURATION_GUIDE.md)

## 🚨 常见问题排查

### 产品导入状态修复

#### 问题症状
通过应用导入产品时，产品默认被设置为活跃状态(active)而不是草稿状态(draft)。

#### 解决方法
修复了产品导入时的状态设置问题：
1. 确保`ShopifyService.createProduct`方法默认使用`draft`状态
2. 修复了在重新创建产品时错误使用`active`状态的问题
3. 添加状态参数验证，确保始终使用有效的状态值

这个修复确保所有新导入的产品都会默认为草稿状态，让商家有机会在产品发布前进行审核和修改。

### API弃用警告解决方案

#### 问题症状
PM2日志中出现大量 `[shopify-api/WARNING] API Deprecation Notice` 警告：

```
[shopify-api/WARNING] API Deprecation Notice: {"message":"https://shopify.dev/api/admin-rest/latest/resources/product","path":"products"}
[shopify-api/WARNING] API Deprecation Notice: {"message":"https://shopify.dev/api/admin-rest/latest/resources/product-image","path":"products/8763546370222/images"}
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

### Shopify API 2024-07版本兼容性

本项目已更新至支持Shopify API 2024-07版本，包含以下重要改进：

1. **新ProductSet同步方法**：利用Shopify新产品模型API进行产品同步，提高同步成功率
   ```env
   # 在导入时启用ProductSet同步
   SHOPIFY_USE_PRODUCT_SET_SYNC=true
   ```

2. **元字段(Metafields)替代SKU**：由于新API不再在ProductVariantInput中支持SKU字段，我们现在使用元字段存储SKU信息

3. **改进的变体和选项处理**：更新了变体创建和选项处理逻辑，符合新API要求

4. **元字段API更新**：从2024-07版本开始，`metafieldSet`突变已被替换为`metafieldsSet`，支持批量设置元字段，提高效率和性能

5. **使用方法**：
   在产品导入API调用中，添加`useProductSetSync: true`参数来启用新的同步方法：
   ```json
   {
     "productIds": ["id1", "id2"],
     "useProductSetSync": true
   }
   ```

6. **兼容性**：应用保持向后兼容，如无需使用新特性，可继续使用原有导入方法

### GraphQL产品创建错误修复

#### 问题症状
在产品导入过程中出现如下GraphQL错误：

```
ProductCreateInput isn't a defined input type (on $product)
```

```
Variable $variants of type [ProductVariantsBulkInput!]! was provided invalid value for 0.sku (Field is not defined on ProductVariantsBulkInput)
```

#### 原因
Shopify Admin API的GraphQL模式需要做两处修正：
1. 主产品创建使用 `input: $input` 而不是 `product: $product`，且输入类型应为 `ProductInput` 而非 `ProductCreateInput`
2. 变体更新需使用 `productVariantUpdate` 而非 `productVariantsBulkUpdate`，因为批量更新的输入类型 `ProductVariantsBulkInput` 不支持 `sku` 字段

#### 解决方法
已更新 `ShopifyService.ts` 中的两个关键方法：

**createProductWithGraphQL 方法**：
- 将 `mutation productCreate($product: ProductCreateInput!, ...)` 更正为 `mutation productCreate($input: ProductInput!, ...)`
- 将 `productCreate(product: $product, ...)` 更正为 `productCreate(input: $input, ...)`
- 变量传递时使用 `{ input: productInput }` 而非 `{ product: productInput }`

**updateDefaultVariantGraphQL 方法**：
- 使用 `productVariantUpdate` 单个变体更新而不是 `productVariantsBulkUpdate` 批量更新
- 正确构建 `input` 对象包含 `id`、`price`、`compareAtPrice` 和 `sku` 字段

> 此修复已应用于版本2.3.2及以上。

#### 🔧 技术实现亮点

**智能API架构**
- **双API支持**：GraphQL优先，REST API作为智能回退
- **无缝切换**：单一环境变量控制，不影响现有功能
- **自动故障恢复**：GraphQL失败时自动降级到REST API

**遵循Shopify最佳实践**
- ✅ **现代化Mutations**：使用`productCreate`、`productVariantUpdate`和`productCreateMedia`
- ✅ **正确的输入结构**：`ProductInput`用于产品创建，`ProductVariantInput`用于变体更新
- ✅ **分离的变体更新**：通过单独调用`productVariantUpdate`处理SKU和价格更新
- ✅ **Global ID使用**：`gid://shopify/Product/123`格式
- ✅ **完整错误处理**：所有操作都有专用的`userErrors`处理
- ✅ **变量和类型安全**：遵循最新的Shopify GraphQL schema类型定义

**图片处理优化**
- **现代Media API**：使用`productCreateMedia`替代弃用的REST图片API
- **智能URL编码**：自动修复空格等特殊字符问题
- **多重回退策略**：URL编码→代理服务→格式转换
- **分离创建流程**：产品创建与图片添加解耦，提高成功率

**性能与兼容性**
- **减少API调用**：GraphQL单次请求获取更多数据
- **向后兼容**：现有REST功能完全保留
- **渐进迁移**：可按需启用，风险最小化

#### 📊 实际效果

| 指标 | 之前（REST API） | 现在（GraphQL API） |
|------|-----------------|---------------------|
| 弃用警告 | ❌ 大量警告 | ✅ 零警告 |
| API调用次数 | 多次分离调用 | 单次整合请求 |
| 错误处理 | 基础HTTP状态码 | 结构化用户错误 |
| 图片处理 | 弃用API | 现代Media API |
| 兼容性 | 完全依赖REST | 智能回退机制 |

#### 升级状态
✅ **已完成的GraphQL迁移**：
- ✅ 产品创建 (`productCreate` with full validation)
- ✅ 产品更新 (`productUpdate` with selective fields)
- ✅ 产品查询 (`products` query with SKU filters)
- ✅ 图片管理 (`productCreateMedia` with Media API)
- ✅ 智能回退机制（确保100%兼容性）

这些改进确保应用完全符合Shopify现代化标准，同时保持与现有系统的完美兼容性。

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

### 🏗️ 架构概览
本项目采用**monorepo多包管理**架构，使用**TypeScript全栈开发**，前后端分离设计，支持本地开发和生产部署。

```
Shopify-API-Project/
├── 📱 client/                    # React前端应用 (Vite + React 19)
│   ├── components/               # 可复用UI组件
│   │   ├── common/              # 通用组件 (Loading, Modal等)
│   │   ├── forms/               # 表单组件
│   │   ├── charts/              # 图表和数据可视化
│   │   └── layout/              # 布局组件
│   ├── pages/                   # 页面组件 (路由页面)
│   │   ├── Dashboard.tsx        # 仪表板主页
│   │   ├── Products.tsx         # 产品管理页
│   │   ├── Import.tsx           # 产品导入页
│   │   ├── Brands.tsx           # 品牌管理页
│   │   └── Settings.tsx         # 设置页面
│   ├── contexts/                # React Context状态管理
│   │   ├── AuthContext.tsx      # 认证状态
│   │   ├── AppContext.tsx       # 应用全局状态
│   │   └── ShopifyContext.tsx   # Shopify App Bridge
│   ├── services/                # API服务层
│   │   ├── api.ts               # API客户端配置
│   │   ├── products.ts          # 产品相关API
│   │   ├── brands.ts            # 品牌相关API
│   │   └── import.ts            # 导入相关API
│   ├── utils/                   # 前端工具函数
│   │   ├── format.ts            # 数据格式化
│   │   ├── validation.ts        # 表单验证
│   │   └── constants.ts         # 常量定义
│   ├── App.tsx                  # 根组件
│   ├── main.tsx                 # 应用入口
│   └── tsconfig.json            # 前端TypeScript配置
├── 🔧 server/                   # Express后端服务器 (Node.js + TypeScript)
│   ├── routes/                  # API路由定义
│   │   ├── auth.ts              # 认证路由 (OAuth)
│   │   ├── products.ts          # 产品CRUD路由
│   │   ├── brands.ts            # 品牌管理路由
│   │   ├── import.ts            # 导入任务路由
│   │   ├── sync.ts              # 同步任务路由
│   │   ├── webhook.ts           # Shopify Webhook处理
│   │   └── dashboard.ts         # 仪表板数据路由
│   ├── services/                # 业务逻辑服务层
│   │   ├── ShopifyService.ts    # Shopify API集成
│   │   ├── CJService.ts         # CJ API集成
│   │   ├── PepperjamService.ts  # Pepperjam API集成
│   │   ├── ProductService.ts    # 产品业务逻辑
│   │   ├── BrandService.ts      # 品牌业务逻辑
│   │   ├── ImportService.ts     # 导入业务逻辑
│   │   └── SyncService.ts       # 同步业务逻辑
│   ├── middleware/              # Express中间件
│   │   ├── auth.ts              # 认证中间件
│   │   ├── cors.ts              # CORS配置
│   │   ├── error.ts             # 错误处理
│   │   ├── rate-limit.ts        # 请求限流
│   │   └── validation.ts        # 请求验证
│   ├── utils/                   # 后端工具函数
│   │   ├── logger.ts            # 日志管理
│   │   ├── cache.ts             # 缓存管理
│   │   ├── helpers.ts           # 通用帮助函数
│   │   └── constants.ts         # 服务端常量
│   ├── config/                  # 配置文件
│   │   ├── database.ts          # 数据库配置
│   │   ├── redis.ts             # Redis缓存配置
│   │   └── shopify.ts           # Shopify API配置
│   ├── index.ts                 # 服务器入口文件
│   └── tsconfig.json            # 后端TypeScript配置
├── 🔗 shared/                   # 前后端共享代码
│   ├── types/                   # TypeScript类型定义
│   │   ├── api.ts               # API请求/响应类型
│   │   ├── product.ts           # 产品相关类型
│   │   ├── brand.ts             # 品牌相关类型
│   │   ├── import.ts            # 导入相关类型
│   │   └── shopify.ts           # Shopify相关类型
│   ├── constants/               # 共享常量
│   ├── utils/                   # 共享工具函数
│   ├── index.ts                 # 导出入口
│   └── tsconfig.json            # 共享代码TypeScript配置
├── 🗄️ prisma/                   # 数据库层 (PostgreSQL + Prisma ORM)
│   ├── schema.prisma            # 数据库模型定义
│   ├── migrations/              # 数据库迁移文件
│   └── seed.ts                  # 数据库种子数据
├── 🐍 src/                      # Python脚本和工具 (辅助功能)
│   ├── Shopify/                 # Shopify相关Python脚本
│   ├── CJ/                      # CJ API相关脚本
│   ├── Ascend/                  # Ascend平台脚本
│   ├── Core/                    # 核心Python工具
│   └── main.py                  # Python主入口
├── 🔨 scripts/                  # 构建和部署脚本
│   ├── build.js                 # 构建脚本
│   ├── dev.js                   # 开发环境启动脚本
│   ├── deploy.js                # 部署脚本
│   ├── restart-services.sh      # 服务重启脚本
│   └── stop-services.sh         # 服务停止脚本
├── ⚙️ 配置文件
│   ├── package.json             # 项目依赖和脚本配置
│   ├── pnpm-workspace.yaml      # PNPM工作区配置
│   ├── tsconfig.json            # 根TypeScript配置
│   ├── vite.config.ts           # Vite构建配置
│   ├── ecosystem.config.js      # PM2进程管理配置
│   ├── .env.example             # 环境变量模板
│   ├── .gitignore              # Git忽略文件
│   └── .npmrc                  # NPM配置
├── 📋 Shopify配置文件
│   ├── shopify.app.toml         # Shopify应用配置
│   ├── shopify.web.toml         # Shopify Web配置
│   └── shopify.app.product-importer.toml # 产品导入器配置
├── 📄 文档文件
│   ├── README.md                # 项目说明文档
│   ├── requirements.txt         # Python依赖 (如果使用Python)
│   └── index.html               # HTML模板文件
└── 📊 其他文件
    ├── tsconfig.tsbuildinfo     # TypeScript构建缓存
    └── logs/                    # 日志文件目录 (运行时生成)
```

### 🎯 核心技术栈

#### **前端技术栈**
- **React 19** - 最新版本React框架
- **TypeScript** - 类型安全的JavaScript
- **Vite** - 现代化前端构建工具
- **Shopify Polaris** - Shopify官方UI组件库
- **Shopify App Bridge** - Shopify应用桥接
- **React Query** - 服务端状态管理
- **Axios** - HTTP客户端

#### **后端技术栈**
- **Node.js 18+** - 服务器运行环境
- **Express.js** - Web框架
- **TypeScript** - 类型安全开发
- **Prisma ORM** - 数据库ORM
- **PostgreSQL** - 关系型数据库
- **Bull Queue** - 任务队列管理
- **Winston** - 日志管理
- **JWT** - 身份认证

#### **DevOps和工具**
- **PNPM** - 包管理器
- **PM2** - 进程管理
- **Cloudflare Tunnels** - 本地开发隧道
- **ESLint** - 代码检查
- **Prettier** - 代码格式化
- **Shopify CLI** - Shopify开发工具

### 🔧 关键文件说明

#### **根目录配置文件**
| 文件 | 作用 | 重要性 |
|------|------|--------|
| `package.json` | 项目依赖、脚本定义、元数据 | ⭐⭐⭐⭐ |
| `pnpm-workspace.yaml` | PNPM工作区配置，monorepo管理 | ⭐⭐⭐ |
| `tsconfig.json` | 根TypeScript配置，路径映射 | ⭐⭐⭐⭐ |
| `vite.config.ts` | 前端构建配置，开发服务器 | ⭐⭐⭐⭐ |
| `ecosystem.config.js` | PM2生产环境进程管理 | ⭐⭐⭐ |
| `.env.example` | 环境变量模板 | ⭐⭐⭐⭐ |

#### **Shopify配置文件**
| 文件 | 作用 | 重要性 |
|------|------|--------|
| `shopify.app.toml` | Shopify应用主配置 | ⭐⭐⭐⭐ |
| `shopify.web.toml` | Shopify Web服务配置 | ⭐⭐⭐ |
| `shopify.app.product-importer.toml` | 产品导入器特定配置 | ⭐⭐⭐ |

#### **数据库相关**
| 文件 | 作用 | 重要性 |
|------|------|--------|
| `prisma/schema.prisma` | 数据库模型定义 | ⭐⭐⭐⭐ |
| `prisma/seed.ts` | 数据库种子数据 | ⭐⭐ |

### 🚀 开发流程

1. **环境准备**: 安装依赖 → 配置环境变量 → 初始化数据库
2. **开发启动**: `npm run dev` 或 `npm run shopify:dev`
3. **功能开发**: 前端页面 → 后端API → 数据库模型 → 测试
4. **生产部署**: 构建 → PM2部署 → Shopify应用发布

### 🔄 数据流向

```
用户操作 → React前端 → API路由 → 业务服务 → 数据库
                  ↓
外部API (CJ/Pepperjam) → 数据转换 → Shopify API → 本地存储
```

### 🎨 命名规范

- **文件夹**: 小写，单词用连字符分隔 (kebab-case)
- **文件名**: PascalCase (组件) 或 camelCase (工具)
- **变量**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **类型**: PascalCase

### 📂 详细目录说明

#### **Client目录结构**
```
client/
├── components/                        # 可复用React组件
│   ├── FilterPanel.tsx               # 产品过滤面板组件
│   ├── ImageWithFallback.tsx         # 带备用图片的图像组件
│   ├── ProductCard.tsx               # 产品卡片展示组件
│   ├── ProductDetailModal.tsx        # 产品详情弹窗组件
│   ├── ProductEditModal.tsx          # 产品编辑弹窗组件
│   └── ProductGrid.tsx               # 产品网格布局组件
├── contexts/                         # React Context状态管理
│   ├── AuthContext.tsx               # 用户认证状态管理
│   ├── AppContext.tsx                # 应用全局状态管理
│   └── ShopifyContext.tsx            # Shopify App Bridge集成
├── pages/                            # 页面级组件
│   ├── BrandsPage.tsx                # 品牌管理页面
│   ├── DashboardPage.tsx             # 仪表板首页
│   ├── ImportPage.tsx                # 产品导入页面
│   ├── ProductsPage.tsx              # 产品管理页面
│   └── SettingsPage.tsx              # 应用设置页面
├── services/                         # API服务封装
│   ├── api.ts                        # 基础API客户端配置
│   ├── brands.ts                     # 品牌相关API调用
│   ├── products.ts                   # 产品相关API调用
│   └── import.ts                     # 导入功能API调用
├── utils/                            # 前端工具函数
│   ├── format.ts                     # 数据格式化工具
│   ├── validation.ts                 # 表单验证工具
│   └── constants.ts                  # 前端常量定义
├── App.tsx                           # 根应用组件
├── main.tsx                          # 应用入口点
└── tsconfig.json                     # 前端TypeScript配置
```

#### **Server目录结构**
```
server/
├── routes/                           # Express路由定义
│   ├── auth.ts                       # 认证路由 (OAuth, JWT)
│   ├── brands.ts                     # 品牌管理API路由
│   ├── dashboard.ts                  # 仪表板数据API路由
│   ├── import.ts                     # 产品导入API路由
│   ├── products.ts                   # 产品CRUD API路由
│   ├── settings.ts                   # 应用设置API路由
│   ├── shopify.ts                    # Shopify集成API路由
│   ├── webhookManagement.ts          # Webhook管理API路由
│   └── webhooks.ts                   # Webhook处理路由
├── services/                         # 业务逻辑服务层
│   ├── CustomAppService.ts           # 自定义应用服务
│   ├── ProductRetriever.ts           # 产品获取服务
│   ├── ShopifyService.ts             # Shopify API集成服务
│   └── WebhookService.ts             # Webhook处理服务
├── middleware/                       # Express中间件
│   ├── auth.ts                       # 认证中间件
│   ├── cors.ts                       # CORS配置中间件
│   ├── error.ts                      # 错误处理中间件
│   ├── rate-limit.ts                 # 请求限流中间件
│   └── validation.ts                 # 请求验证中间件
├── utils/                           # 后端工具函数
│   ├── logger.ts                     # Winston日志管理
│   ├── cache.ts                      # Redis缓存管理
│   ├── helpers.ts                    # 通用帮助函数
│   └── constants.ts                  # 服务端常量定义
├── config/                          # 配置文件
│   ├── database.ts                   # 数据库连接配置
│   └── shopify.ts                    # Shopify API配置
├── index.ts                         # Express服务器入口
└── tsconfig.json                    # 后端TypeScript配置
```

#### **Shared目录结构**
```
shared/
├── types/                           # TypeScript类型定义
│   ├── api.ts                       # API请求/响应类型
│   ├── product.ts                   # 产品数据类型
│   ├── brand.ts                     # 品牌数据类型
│   ├── import.ts                    # 导入任务类型
│   └── shopify.ts                   # Shopify相关类型
├── constants/                       # 共享常量
├── utils/                          # 前后端共用工具函数
├── index.ts                        # 统一导出入口
└── tsconfig.json                   # 共享代码TypeScript配置
```

#### **数据库结构 (Prisma)**
```
prisma/
├── schema.prisma                    # 数据库模型定义
│   ├── Brand 模型                   # 品牌信息表
│   ├── Product 模型                 # 产品信息表
│   ├── ImportJob 模型               # 导入任务表
│   ├── SyncLog 模型                 # 同步日志表
│   └── ShopifyWebhook 模型          # Webhook记录表
├── migrations/                      # 数据库迁移文件
│   └── [timestamp]_[description]/   # 各版本迁移记录
└── seed.ts                         # 数据库初始数据
```

### 🔑 核心文件职责

#### **关键业务文件**
| 文件路径 | 主要职责 | 技术要点 |
|----------|----------|----------|
| `server/services/ShopifyService.ts` | Shopify API集成 | OAuth认证、产品CRUD、Webhook处理 |
| `server/services/ProductRetriever.ts` | 第三方API产品获取 | CJ/Pepperjam API集成、数据转换 |
| `server/services/WebhookService.ts` | Webhook事件处理 | 事件验证、状态同步、错误恢复 |
| `client/pages/ImportPage.tsx` | 产品导入界面 | 批量操作、进度显示、错误处理 |
| `client/pages/ProductsPage.tsx` | 产品管理界面 | 列表展示、筛选搜索、状态管理 |

#### **配置和工具文件**
| 文件路径 | 主要职责 | 配置要点 |
|----------|----------|----------|
| `vite.config.ts` | 前端构建配置 | HMR设置、代理配置、环境变量 |
| `ecosystem.config.js` | PM2进程管理 | 内存限制、日志配置、重启策略 |
| `prisma/schema.prisma` | 数据库模型 | 关系定义、索引设置、数据类型 |
| `shopify.app.toml` | Shopify应用配置 | 权限范围、回调URL、应用信息 |

#### **辅助Python脚本**
```
src/
├── Shopify/                         # Shopify相关Python工具
│   ├── data_processor.py            # 数据处理脚本
│   └── bulk_operations.py           # 批量操作脚本
├── CJ/                             # CJ API相关脚本
│   ├── product_fetcher.py           # 产品获取脚本
│   └── brand_analyzer.py            # 品牌分析脚本
├── Core/                           # 核心Python工具
│   ├── data_validator.py            # 数据验证工具
│   └── image_processor.py           # 图片处理工具
└── main.py                         # Python工具统一入口
```

## 📚 开发指南

### 🔧 开发环境配置

#### 1. 系统要求
- **Node.js**: >= 18.0.0
- **PNPM**: >= 8.0.0 (推荐) 或 NPM >= 8.0.0
- **PostgreSQL**: >= 12.0 (生产环境) 或 SQLite (开发环境)
- **Git**: 版本控制

#### 2. IDE推荐设置
**VS Code插件**:
- TypeScript Importer
- Prisma
- ES7+ React/Redux/React-Native snippets
- Shopify Liquid
- Auto Rename Tag
- Bracket Pair Colorizer

**配置文件** (`.vscode/settings.json`):
```json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### 3. 环境变量详解
```env
# =================
# Shopify应用配置
# =================
SHOPIFY_API_KEY=your_api_key                    # 从Shopify Partner Dashboard获取
SHOPIFY_API_SECRET=your_api_secret              # 从Shopify Partner Dashboard获取
SHOPIFY_STORE_NAME=your-store.myshopify.com    # 测试店铺域名
SHOPIFY_APP_URL=https://your-tunnel.trycloudflare.com  # 公网访问URL
SHOPIFY_SCOPES=read_products,write_products,read_orders  # 应用权限

# =================
# 数据库配置
# =================
DATABASE_URL="postgresql://user:password@localhost:5432/shopify_db"  # 生产环境
# DATABASE_URL="file:./dev.db"  # 开发环境SQLite

# =================
# 服务器配置
# =================
NODE_ENV=development          # 环境: development | production
PORT=3000                    # 服务器端口
CLIENT_PORT=5173             # 前端开发服务器端口
SERVER_HOST=localhost        # 服务器主机

# =================
# 联盟营销API配置
# =================
CJ_API_KEY=your_cj_api_key              # CJ Affiliate API密钥
CJ_WEBSITE_ID=your_cj_website_id        # CJ网站ID
PEPPERJAM_API_KEY=your_pepperjam_key    # Pepperjam API密钥
PEPPERJAM_PROGRAM_ID=your_program_id    # Pepperjam程序ID

# =================
# 可选配置
# =================
LOG_LEVEL=info                          # 日志级别: error | warn | info | debug
REDIS_URL=redis://localhost:6379        # Redis缓存 (可选)
WEBHOOK_SECRET=your_webhook_secret      # Webhook验证密钥
```

### 🚀 快速开始

#### 方法一: 使用Shopify CLI (推荐)
```bash
# 1. 安装Shopify CLI
npm install -g @shopify/cli @shopify/theme

# 2. 克隆项目
git clone <repository-url>
cd Shopify-API-Project

# 3. 安装依赖
pnpm install

# 4. 配置环境变量
cp .env.example .env
# 编辑.env文件填入你的配置

# 5. 初始化数据库
pnpm run db:generate
pnpm run db:migrate

# 6. 启动开发服务器
pnpm run shopify:dev
```

#### 方法二: 手动启动
```bash
# 1. 启动后端服务器
pnpm run dev:server

# 2. 启动前端开发服务器 (新终端)
pnpm run dev:client

# 3. 设置Cloudflare隧道 (新终端)
cloudflared tunnel --url localhost:3000
```

### 🔄 开发工作流程

#### 1. 功能开发流程
```mermaid
graph TD
    A[需求分析] --> B[设计API接口]
    B --> C[创建数据库模型]
    C --> D[实现后端服务]
    D --> E[开发前端页面]
    E --> F[集成测试]
    F --> G[代码审查]
    G --> H[部署到测试环境]
```

#### 2. 代码提交规范
```bash
# 提交格式
git commit -m "type(scope): description"

# 类型说明
feat:     新功能
fix:      错误修复
docs:     文档更新
style:    代码格式
refactor: 重构
test:     测试相关
chore:    构建/工具变动
```

#### 3. 分支管理策略
```
main          # 主分支，生产环境代码
├── develop   # 开发分支
├── feature/* # 功能分支
├── hotfix/*  # 紧急修复分支
└── release/* # 发布分支
```

### 🔧 常用开发命令

#### 开发环境
```bash
# 启动开发服务器
pnpm run dev                    # 完整开发环境
pnpm run dev:server            # 仅后端服务器
pnpm run dev:client            # 仅前端服务器
pnpm run shopify:dev           # 使用Shopify CLI

# 代码检查和格式化
pnpm run lint                   # ESLint检查
pnpm run lint:fix              # 自动修复ESLint错误
pnpm run type-check            # TypeScript类型检查
```

#### 数据库操作
```bash
# 基础操作
pnpm run db:generate           # 生成Prisma客户端
pnpm run db:migrate            # 应用数据库迁移
pnpm run db:studio             # 打开数据库管理界面
pnpm run db:seed               # 插入种子数据

# 高级操作
pnpm run db:reset              # 重置数据库
pnpm run db:push               # 推送schema到数据库
```

#### 构建和部署
```bash
# 构建项目
pnpm run build                 # 构建生产版本
pnpm run build:watch           # 监听模式构建

# 生产部署
pnpm run start:prod            # 构建并启动生产服务器
pnpm run pm2:start             # 使用PM2启动
pnpm run pm2:logs              # 查看PM2日志
```

### 🔍 调试技巧

#### 1. 后端调试
```bash
# 启动调试模式
pnpm run dev:server --inspect

# VS Code调试配置
{
  "type": "node",
  "request": "attach",
  "name": "Attach to Server",
  "port": 9229
}
```

#### 2. 前端调试
- 使用React DevTools
- 使用Chrome DevTools的Network标签
- 使用Console.log调试
- 使用Shopify App Bridge DevTools

#### 3. API调试
```bash
# 测试API端点
curl -X GET "http://localhost:3000/api/products" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 使用Postman或Insomnia
# 导入API文档进行测试
```

### 📊 性能优化

#### 1. 前端优化
- 使用React.memo()避免不必要的重渲染
- 使用useMemo()和useCallback()优化计算
- 按需加载组件 (React.lazy())
- 优化图片加载 (lazy loading)

#### 2. 后端优化
- 数据库查询优化
- 使用Redis缓存热点数据
- API响应压缩
- 连接池管理

#### 3. 构建优化
- Tree shaking移除未使用的代码
- 代码分割和懒加载
- 资源压缩和混淆
- CDN加速静态资源

### 🧪 测试策略

#### 1. 单元测试
```bash
# 运行测试
pnpm run test

# 测试覆盖率
pnpm run test:coverage
```

#### 2. 集成测试
- API端点测试
- 数据库操作测试
- Shopify API集成测试

#### 3. E2E测试
- 用户操作流测试
- 完整业务流程测试

### 📝 文档维护

#### 1. API文档
- 使用JSDoc注释
- 保持README.md更新
- 维护CHANGELOG.md

#### 2. 代码注释
- 复杂业务逻辑必须注释
- 外部API集成说明
- 配置参数解释

### 🆘 常见问题解决

#### 1. 依赖安装问题
```bash
# 清除缓存
pnpm store prune
rm -rf node_modules
pnpm install

# 使用npm作为备选
npm ci
```

#### 2. 端口冲突
```bash
# 查找占用端口的进程
lsof -ti:3000
kill -9 <PID>

# 修改端口
export PORT=3001
```

#### 3. 数据库连接失败
```bash
# 检查数据库状态
systemctl status postgresql

# 重启数据库
systemctl restart postgresql
```

#### 4. Shopify认证失败
- 检查API密钥是否正确
- 确认应用URL配置
- 验证隧道连接状态
- 检查应用权限范围

## 🌟 项目特色功能

### 🎯 核心业务功能

#### 1. **智能产品导入系统**
- **多API源支持**: 同时支持CJ和Pepperjam两大联盟营销平台
- **智能数据映射**: 自动将第三方API数据转换为Shopify产品格式
- **批量导入处理**: 支持大批量产品同时导入，带进度跟踪
- **原始数据保存**: 完整保存API响应数据，便于后续分析和追溯

#### 2. **多策略产品匹配算法**
```typescript
// 匹配策略优先级（高到低）
1. 精确ID匹配 (sourceProductId)
2. 完整标题匹配 (title exact match)
3. 清理标题匹配 (normalized title)
4. Jaccard相似度匹配 (>50% similarity)
5. 品牌+部分标题匹配 (>30% word match)
6. 模糊匹配 (>20% similarity)
```

#### 3. **实时同步机制**
- **定时同步**: 定期更新产品库存和价格信息
- **Webhook同步**: 实时监听Shopify商品变化
- **增量同步**: 只同步变化的数据，提高效率
- **错误恢复**: 自动重试失败的同步任务

#### 4. **图片处理增强**
- **智能图片验证**: URL格式、可访问性、内容类型验证
- **多重回退策略**: URL编码、代理服务、格式转换
- **图片诊断工具**: 专门的API端点用于诊断图片问题
- **自动修复功能**: 一键修复产品图片问题

### 🔧 技术亮点

#### 1. **现代化前端架构**
- **React 19**: 使用最新版本React，支持并发特性
- **TypeScript严格模式**: 完整的类型安全保障
- **Shopify Polaris**: 原生Shopify设计语言
- **响应式设计**: 适配各种屏幕尺寸

#### 2. **可扩展后端架构**
- **分层架构**: 路由 → 服务 → 数据访问层
- **服务化设计**: 每个业务领域独立的服务类
- **中间件模式**: 认证、CORS、限流等横切关注点
- **错误边界**: 完善的错误处理和日志记录

#### 3. **数据库设计优化**
- **Prisma ORM**: 类型安全的数据库访问
- **关系模型**: 品牌、产品、导入任务的完整关系
- **索引优化**: 基于查询模式的索引设计
- **迁移管理**: 版本化的数据库变更管理

#### 4. **DevOps最佳实践**
- **Monorepo管理**: PNPM workspace统一管理
- **多环境配置**: 开发、测试、生产环境隔离
- **进程管理**: PM2生产环境进程管理
- **日志系统**: Winston结构化日志

### 🛡️ 安全性设计

#### 1. **认证和授权**
- **OAuth 2.0**: 标准的Shopify OAuth流程
- **JWT Token**: 安全的会话管理
- **权限验证**: 细粒度的API权限控制
- **CSRF保护**: 跨站请求伪造防护

#### 2. **数据安全**
- **参数验证**: Zod schema验证所有输入
- **SQL注入防护**: Prisma ORM自动防护
- **敏感数据加密**: API密钥等敏感信息加密存储
- **HTTPS强制**: 生产环境强制HTTPS

#### 3. **API安全**
- **请求限流**: 防止API滥用
- **Webhook验证**: HMAC-SHA256签名验证
- **重复请求检测**: 防止重复处理
- **超时处理**: 防止长时间阻塞

### 📊 性能优化

#### 1. **前端性能**
- **代码分割**: 按需加载减少初始包大小
- **图片懒加载**: 优化图片加载性能
- **缓存策略**: 合理的浏览器缓存配置
- **虚拟滚动**: 大列表性能优化

#### 2. **后端性能**
- **数据库优化**: 查询优化和索引使用
- **缓存层**: Redis缓存热点数据
- **连接池**: 数据库连接池管理
- **异步处理**: 耗时任务异步化

#### 3. **网络优化**
- **资源压缩**: Gzip压缩响应内容
- **CDN加速**: 静态资源CDN分发
- **HTTP/2**: 支持HTTP/2协议
- **长连接**: 减少连接建立开销

### 🔍 可观测性

#### 1. **日志系统**
- **结构化日志**: JSON格式便于解析
- **日志级别**: Error、Warn、Info、Debug
- **日志轮转**: 防止日志文件过大
- **日志聚合**: 集中日志收集和分析

#### 2. **监控告警**
- **性能监控**: API响应时间监控
- **错误监控**: 异常情况实时告警
- **业务监控**: 导入成功率等业务指标
- **资源监控**: CPU、内存使用情况

#### 3. **调试工具**
- **API调试**: 内置API测试工具
- **数据库调试**: Prisma Studio可视化
- **网络调试**: 详细的请求/响应日志
- **性能分析**: 性能瓶颈分析工具

### 🌐 部署方案

#### 1. **本地开发**
- **Cloudflare Tunnels**: 本地开发外网访问
- **热重载**: 代码修改即时生效
- **环境隔离**: 独立的开发环境配置
- **调试支持**: 完整的调试工具链

#### 2. **生产部署**
- **Docker化**: 容器化部署支持
- **PM2管理**: 进程管理和监控
- **负载均衡**: 支持多实例部署
- **蓝绿部署**: 零停机更新

#### 3. **云原生**
- **微服务架构**: 可拆分为多个服务
- **容器编排**: Kubernetes支持
- **服务发现**: 自动服务注册和发现
- **配置管理**: 外部化配置管理

## 🎉 总结

这个Shopify产品导入应用是一个**现代化、可扩展、高性能**的全栈应用，具有以下特点：

✅ **技术先进**: 采用最新的技术栈和最佳实践  
✅ **架构清晰**: 分层架构，职责明确，易于维护  
✅ **功能完善**: 覆盖产品导入的完整业务流程  
✅ **性能优化**: 多层次的性能优化方案  
✅ **安全可靠**: 完善的安全防护和错误处理  
✅ **开发友好**: 完整的开发工具链和文档  

无论是对于开发人员学习现代Web开发技术，还是对于企业实际使用产品导入功能，这个项目都提供了一个优秀的参考和解决方案。

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

## 🖼️ 图片处理增强功能

### 功能概述
系统现在包含了强大的图片处理和诊断功能，解决产品导入时图片无法正确设置的问题。

### 主要改进

#### 1. 智能图片验证
- **URL格式验证**: 支持标准图片扩展名和知名图片服务（Feedonomics、AWS S3、Cloudinary等）
- **可访问性测试**: 自动测试图片URL是否可访问，支持自定义超时设置
- **内容类型检查**: 验证返回的内容确实是图片格式
- **文件大小检查**: 检测异常小或过大的图片文件

#### 2. 灵活的导入策略
- **渐进式处理**: 优先创建产品，图片失败时单独重试
- **回退机制**: 如果初始导入图片失败，产品创建后会尝试单独添加图片
- **错误容忍**: 图片问题不会阻止整个产品的创建过程
- **智能重试**: 当Shopify拒绝图片URL时，自动尝试多种URL变体
- **多User-Agent测试**: 使用不同的User-Agent来提高图片URL兼容性

#### 3. 图片问题诊断工具

##### API端点: `POST /api/products/:id/diagnose-image`
全面诊断产品图片问题，包括：

**检查项目**:
- ✅ 图片URL是否存在
- ✅ URL格式验证
- ✅ 图片可访问性测试
- ✅ 内容类型验证
- ✅ 文件大小检查
- ✅ Shopify产品状态
- ✅ Shopify中的图片状态

**使用示例**:
```bash
curl -X POST "https://your-app.trycloudflare.com/api/products/123/diagnose-image" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**响应格式**:
```json
{
  "success": true,
  "data": {
    "productId": "123",
    "productTitle": "示例产品",
    "imageUrl": "https://example.com/image.jpg",
    "shopifyProductId": "456",
    "importStatus": "IMPORTED",
    "checks": [
      {
        "check": "Image URL Exists",
        "status": "pass",
        "message": "Image URL: https://example.com/image.jpg"
      },
      {
        "check": "URL Format",
        "status": "pass", 
        "message": "URL format is valid"
      },
      {
        "check": "Image Accessibility",
        "status": "pass",
        "message": "Image is accessible (200)",
        "details": {
          "responseTime": "234ms",
          "contentType": "image/jpeg",
          "contentLength": "156789 bytes"
        }
      }
    ]
  }
}
```

#### 4. 图片问题修复工具

##### API端点: `POST /api/products/:id/fix-image`
自动修复已导入产品的图片问题。

**功能**:
- 检查Shopify产品是否存在
- 验证现有图片状态
- 尝试添加缺失的图片
- 支持强制更新模式

**请求参数**:
```json
{
  "forceUpdate": false  // 是否强制更新已有图片
}
```

**使用场景**:
1. **产品导入时图片失败**: 产品创建成功但图片未能添加
2. **图片URL更新**: 源API中的图片URL发生变化
3. **批量修复**: 对大量产品进行图片修复

### 故障排除

#### 常见图片问题及解决方案

**1. 图片URL无法访问**
- **原因**: 源网站防盗链、图片已删除、网络问题
- **解决**: 使用诊断工具检查，考虑更换图片源

**2. 图片格式不支持**
- **原因**: 某些罕见格式或动态生成的图片
- **解决**: 系统已支持主流格式和图片服务

**3. 图片过大或过小**
- **原因**: 文件尺寸异常
- **解决**: 系统会警告但不阻止导入

**4. Shopify图片添加失败**
- **原因**: Shopify API限制、权限问题、图片服务器要求特殊User-Agent
- **解决**: 使用修复工具重试，检查应用权限

**5. Shopify拒绝图片URL（"不是有效的图片文件类型"）**
- **原因**: 图片URL缺少明确的扩展名、服务器返回的Content-Type不正确、需要特殊的请求头、URL包含未编码的空格或特殊字符
- **解决**: 
  - 🔧 **智能URL编码**: 自动检测并修复URL中的空格、特殊字符等问题
  - 系统自动尝试多种URL变体（添加时间戳、格式参数等）
  - 使用多种User-Agent进行兼容性测试
  - 产品仍会成功创建，只是暂时没有图片
  - 可以后续手动添加或使用诊断工具排查

**URL编码示例**:
```
原始URL: https://example.com/path/image name.jpg
编码后:   https://example.com/path/image%20name.jpg
```

**6. CDN或防盗链限制**
- **原因**: 图片服务器检查Referer或User-Agent
- **解决**: 系统自动使用浏览器标准User-Agent重试

**7. 特殊CDN域名限制（如Demandware/Salesforce Commerce）**
- **原因**: Shopify可能对特定CDN域名有限制
- **解决**: 自动使用图片代理服务重新托管图片
- **代理端点**: `GET /api/shopify/image-proxy?url={原始图片URL}`
- **特性**: 
  - 自动尝试多种User-Agent
  - 24小时缓存机制
  - 流式传输优化
  - 适用于Le Creuset等使用Demandware CDN的网站

### 配置选项

在环境变量中添加以下配置：

```env
# 图片处理配置
IMAGE_ACCESS_TIMEOUT=5000        # 图片访问测试超时（毫秒）
MAX_IMAGE_SIZE=10485760         # 最大图片大小（字节，默认10MB）
MIN_IMAGE_SIZE=1000             # 最小图片大小（字节）
```

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