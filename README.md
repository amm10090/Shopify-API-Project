# Shopify Product Importer

一个用于从 CJ 和 Pepperjam API 导入产品到 Shopify 的应用程序。

## 🚀 技术栈

- **前端**: React 19 + TypeScript + Shopify Polaris + Vite
- **后端**: Node.js + Express + TypeScript + Prisma ORM
- **数据库**: PostgreSQL
- **缓存**: Redis
- **包管理器**: pnpm

## ✨ 主要功能

- 🔍 从 CJ 和 Pepperjam API 获取产品数据
- 🎯 智能产品筛选和关键词匹配
- 📦 手动选择产品导入到 Shopify
- 🏷️ 品牌管理和配置
- 💰 价格范围和库存状态过滤
- 🔄 自动产品信息同步
- 📊 实时导入状态监控
- 🎨 现代化的用户界面

## 🛠️ 快速开始

### 1. 环境准备

确保您的系统已安装：
- Node.js >= 18.0.0
- npm >= 8.0.0 或 pnpm >= 8.0.0
- PostgreSQL 数据库

### 2. 安装依赖

```bash
npm install
# 或
pnpm install
```

### 3. 环境配置

复制环境变量模板并配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要变量：

```env
# 数据库
DATABASE_URL="postgresql://username:password@localhost:5432/shopify_importer"

# Shopify 应用配置
SHOPIFY_API_KEY="your_shopify_api_key"
SHOPIFY_API_SECRET="your_shopify_api_secret"
SHOPIFY_SCOPES="read_products,write_products,read_inventory,write_inventory"

# 服务器配置
NODE_ENV="development"                    # 开发环境设置
SERVER_HOST="localhost"                   # 开发环境使用localhost，生产环境设置为实际IP

# CJ API 配置
CJ_API_KEY="your_cj_api_key"
CJ_COMPANY_ID="your_cj_company_id"

# Pepperjam API 配置
PEPPERJAM_API_KEY="your_pepperjam_api_key"

# Redis (可选)
REDIS_URL="redis://localhost:6379"
```

### 4. 数据库设置

```bash
# 生成 Prisma 客户端
npm run db:generate

# 运行数据库迁移
npm run db:migrate

# (可选) 打开数据库管理界面
npm run db:studio
```

## 开发环境

### 启动开发服务器

```bash
npm run dev
```

这个命令会同时启动：
- 🟢 **后端服务器** (http://localhost:3000) - API 服务

> **注意**: 
> - 在开发环境中，应用会在localhost:3000运行
> - Shopify CLI会自动创建隧道来访问您的应用
> - 不再需要手动配置HTTPS代理，Shopify CLI会处理所有的隧道和SSL需求

### 单独启动服务

```bash
# 只启动后端服务器
npm run dev:server

# 只启动前端开发服务器
npm run dev:client

# 使用 Shopify CLI 开发模式
npm run dev:shopify
```

### 开发工具

```bash
# 类型检查
npm run type-check
npm run type-check:server
npm run type-check:client

# 代码检查和修复
npm run lint
npm run lint:fix

# 检查环境变量配置
npm run check-env
```

## 生产环境

### 构建应用

```bash
npm run build
```

构建过程包括：
1. 清理旧的构建文件
2. 生成 Prisma 客户端
3. 类型检查
4. 构建共享模块
5. 构建服务器端代码
6. 构建客户端静态文件
7. 复制必要的生产文件

### 启动生产服务器

```bash
# 构建并启动
npm run start:prod

# 或者分步执行
npm run build
cd dist
npm install --production
npm start
```

## 脚本说明

### 开发脚本
- `npm run dev` - 启动完整的开发环境
- `npm run dev:server` - 启动后端开发服务器
- `npm run dev:client` - 启动前端开发服务器
- `npm run dev:shopify` - 使用 Shopify CLI 开发模式

### 构建脚本
- `npm run build` - 完整的生产环境构建
- `npm run build:server` - 只构建服务器端
- `npm run build:client` - 只构建客户端
- `npm run build:shared` - 只构建共享模块
- `npm run build:watch` - 监听模式构建

### 生产脚本
- `npm run start` - 启动生产服务器
- `npm run start:prod` - 构建并启动生产服务器
- `npm run preview` - 预览构建结果

### 数据库脚本
- `npm run db:generate` - 生成 Prisma 客户端
- `npm run db:push` - 推送 schema 到数据库
- `npm run db:migrate` - 运行数据库迁移
- `npm run db:studio` - 打开 Prisma Studio

### 工具脚本
- `npm run clean` - 清理构建文件
- `npm run lint` - 代码检查
- `npm run lint:fix` - 自动修复代码问题
- `npm run type-check` - TypeScript 类型检查
- `npm run check-env` - 检查环境变量配置

## 部署

### 使用 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 构建应用
npm run build

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs
```

### 使用 Docker 部署

```bash
# 构建 Docker 镜像
docker build -t shopify-importer .

# 运行容器
docker run -p 3000:3000 --env-file .env shopify-importer
```

## 故障排除

### 常见问题

1. **端口冲突**
   ```bash
   # 检查端口占用
   lsof -i :3000
   lsof -i :5173
   
   # 杀死占用进程
   kill -9 <PID>
   ```

2. **数据库连接失败**
   ```bash
   # 检查数据库连接
   npm run check-env
   
   # 重新生成 Prisma 客户端
   npm run db:generate
   ```

3. **构建失败**
   ```bash
   # 清理并重新构建
   npm run clean
   npm run build
   ```

4. **依赖问题**
   ```bash
   # 清理 node_modules 并重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

### 日志查看

开发环境日志会直接显示在终端中。生产环境日志位置：
- 应用日志：`logs/app.log`
- 错误日志：`logs/error.log`
- PM2 日志：`~/.pm2/logs/`

## 贡献

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📋 使用指南

### 1. 配置品牌

1. 进入 "Brands" 页面
2. 点击 "Add Brand" 添加新品牌
3. 填写品牌信息：
   - 品牌名称
   - API 类型 (CJ 或 Pepperjam)
   - API ID (CJ 的 Advertiser ID 或 Pepperjam 的 Program ID)

### 2. 导入产品

1. 进入 "Import" 页面
2. 选择要导入的品牌
3. (可选) 输入关键词进行筛选
4. 设置产品数量限制
5. 点击 "搜索产品"
6. 选择要导入的产品
7. 点击 "导入到 Shopify"

### 3. 管理产品

1. 进入 "Products" 页面
2. 使用筛选器查看不同状态的产品
3. 批量操作或单个产品管理
4. 查看导入状态和同步信息

## 🔑 API 配置

### CJ (Commission Junction)

1. 登录 CJ Affiliate 账户
2. 前往 Account → Web Services
3. 生成或获取 API Token
4. 记录您的 Company ID

### Pepperjam

1. 登录 Pepperjam 账户
2. 前往 Tools → API
3. 生成 API Key

### Shopify

1. 在 Shopify 管理后台创建私有应用
2. 启用 Admin API 权限：
   - Products: Read/Write
   - Inventory: Read/Write
3. 复制生成的 Access Token

## 📁 项目结构

```
Shopify-API-Project/
├── client/                 # React 前端应用
│   ├── components/        # React 组件
│   ├── pages/            # 页面组件
│   ├── contexts/         # React Context
│   └── services/         # API 服务
├── server/                # Node.js 后端服务
│   ├── routes/           # API 路由
│   ├── services/         # 业务逻辑服务
│   ├── middleware/       # 中间件
│   └── utils/           # 工具函数
├── shared/               # 共享类型和工具
│   └── types/           # TypeScript 类型定义
├── scripts/             # 构建和部署脚本
├── prisma/              # 数据库 schema 和迁移
└── dist/                # 构建输出目录
```

## Python 脚本使用（传统方式）

如果您想使用原有的 Python 脚本：

1. **创建并激活虚拟环境**:
   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS/Linux
   source .venv/bin/activate
   ```

2. **安装 Python 依赖**:
   ```bash
   pip install -r requirements.txt
   ```

4.  **配置环境变量**: 
    *   复制 `.env.example` 文件为 `.env`。
    *   编辑 `.env` 文件，填入您真实的 API 密钥和店铺信息:
        *   `PEPPERJAM_API_KEY` 或 `ASCEND_API_KEY`: 您的 Pepperjam/Ascend API 密钥。
        *   `CJ_API_TOKEN`: 您的 CJ GraphQL API 令牌。
        *   `BRAND_CID`: 您的 CJ Publisher Company ID。
        *   `CJ_PID`: 您的 CJ Publisher ID (用于生成链接)。
        *   `SHOPIFY_STORE_NAME`: 您的 Shopify 店铺域名 (例如 `your-store.myshopify.com`)。
        *   `SHOPIFY_API_VERSION`: 您希望使用的 Shopify API 版本 (例如 `2024-07`)。
        *   **Shopify 认证**: 根据您的 Shopify 应用类型填写：
            *   **私有应用 (Private App)**: 填写 `SHOPIFY_API_KEY` 和 `SHOPIFY_API_PASSWORD` (使用私有应用的密码)。
            *   **自定义应用 (Custom App)**: 填写 `SHOPIFY_API_KEY` (应用 API 密钥) 和 `SHOPIFY_ACCESS_TOKEN` (Admin API 访问令牌)。
            *   将未使用的凭证字段留空或注释掉。

## 品牌配置

脚本使用 `src/Core/sync_orchestrator.py` 文件顶部的 `BRAND_CONFIG` 字典来映射品牌名称、API 来源 (`cj` 或 `pepperjam`) 以及对应的 API ID (`advertiserId` for CJ, `programId` for Pepperjam)。

请根据您的实际情况修改此字典。示例：

```python
BRAND_CONFIG: Dict[str, Dict[str, str]] = {
    "Canada Pet Care": {"api_type": "cj", "id": "4247933"},
    "Dreo": {"api_type": "cj", "id": "6088764"},
    # ... 其他 CJ 品牌 ...
    "PepperjamBrand6200": {"api_type": "pepperjam", "id": "6200"} # Pepperjam 品牌
}
```

## 使用方法

通过 `src/main.py` 脚本运行同步。

```bash
python src/main.py [options]
```

**可用选项**: 

*   `--brand "<Brand Name>"`: 只同步指定的单个品牌。品牌名称必须与 `BRAND_CONFIG` 中的键匹配。
*   `--all-brands`: 同步 `BRAND_CONFIG` 中定义的所有品牌。
*   `--keywords "kw1,kw2,..."`: 提供逗号分隔的关键词用于筛选产品。 
    *   如果与 `--brand` 一起使用，关键词仅应用于该品牌。
    *   如果与 `--all-brands` 一起使用，这些关键词将应用于所有品牌，除非被 `--keywords-json` 覆盖。
*   `--keywords-json <path/to/keywords.json>`: 指定一个 JSON 文件的路径，该文件包含品牌特定的关键词。JSON 文件格式应为：
    ```json
    {
      "Brand Name 1": "kw1,kw2",
      "Brand Name 2": "kw3",
      ...
    }
    ```
    这会覆盖 `--keywords` 参数为相应品牌设置的关键词。
*   `--dry-run`: 运行同步过程，但不会对 Shopify 进行任何实际的创建、更新或删除操作。它会记录将要执行的操作。这对于测试配置和流程非常有用。
*   `-v` 或 `--verbose`: 启用详细的调试级别日志输出，用于故障排除。

**运行示例**: 

*   **同步所有品牌 (无关键词)**: 
    ```bash
    python src/main.py --all-brands
    ```
    (如果没有任何参数，默认也是同步所有品牌无关键词)

*   **同步单个品牌 'Dreo' (无关键词)**: 
    ```bash
    python src/main.py --brand "Dreo"
    ```

*   **同步单个品牌 'Dreo'，使用关键词 'air fryer'**: 
    ```bash
    python src/main.py --brand "Dreo" --keywords "air fryer"
    ```

*   **同步所有品牌，通用关键词 'sale'**: 
    ```bash
    python src/main.py --all-brands --keywords "sale"
    ```

*   **同步所有品牌，使用 `keywords.json` 文件定义特定关键词，并启用 Dry Run 模式和详细日志**: 
    ```bash
    python src/main.py --all-brands --keywords-json path/to/your/keywords.json --dry-run -v
    ```

## Shopify 集成细节

*   **产品系列 (Collections)**: 
    *   脚本会自动为每个同步的品牌创建一个名为 `[Brand Name] - API Products - Draft` 的 **自定义产品系列**，并将其状态设置为 **草稿 (Draft)**。
    *   所有从 API 获取并同步到 Shopify 的产品，初始状态为 **草稿 (Draft)**，并被添加到这个主草稿产品系列中。
    *   用户需要 **手动** 在 Shopify 后台创建他们希望展示给顾客的 **活动产品系列** (例如 "Men's Boots", "Featured Gadgets")。
    *   用户的工作流程是浏览品牌的主草稿产品系列，选择合适的产品，将它们 **手动** 添加到相应的活动产品系列，并将这些产品的状态 **手动** 更改为 **激活 (Active)**。
*   **联盟链接 (Affiliate Links)**: 
    *   产品的联盟链接 (来自 CJ 的 `clickUrl` 或 Pepperjam 的 `buy_url`) 会被存储在 Shopify 产品的 **元字段 (Metafield)** 中。
    *   使用的元字段是：
        *   **Namespace**: `custom` (可以在 `sync_orchestrator.py` 中修改 `METAFIELD_NAMESPACE`)
        *   **Key**: `affiliate_link` (可以在 `sync_orchestrator.py` 中修改 `METAFIELD_KEY_AFFILIATE_LINK`)
        *   **Type**: `url`
    *   **重要**: 您需要修改您的 Shopify 主题 (Theme) 的 Liquid 代码，以便在产品页面或列表页面读取这个元字段，并生成一个指向联盟链接的按钮或链接 (最好在新窗口 `target="_blank"` 打开)。
        *   示例 Liquid 代码片段 (具体实现取决于您的主题):
            ```liquid
            {% comment %} 获取元字段值 {% endcomment %}
            {% assign affiliate_link = product.metafields.custom.affiliate_link.value %}
            
            {% if affiliate_link and affiliate_link != "" %}
              <a href="{{ affiliate_link }}" target="_blank" class="btn btn--external-link">
                View on Partner Site
              </a>
            {% else %}
              {% comment %} 显示标准的添加到购物车按钮 {% endcomment %}
              <button type="submit" name="add" class="btn product-form__cart-submit">
                Add to Cart
              </button>
            {% endif %}
            ```
*   **产品状态与更新**: 
    *   如果一个产品之前被用户手动设为 **激活 (Active)** 并添加到某个活动产品系列，当同步脚本再次运行时（假设该产品仍然符合 API 获取和筛选条件），脚本会 **更新** 该产品的价格、描述、图片、联盟链接元字段等信息，但会 **尊重** 其 "Active" 状态和用户设置的产品系列，**不会** 将其强制改回 "Draft" 或移出用户添加的产品系列。
*   **旧产品处理**: 
    *   当前版本的脚本主要关注将最新的、符合条件的产品同步到主草稿产品系列。清理（例如归档或删除）那些之前同步过但现在不再符合条件（例如缺货、不再是关键词结果）且仍处于主草稿状态的产品的功能，在当前实现中较为简化。未来版本可以增强此清理逻辑。

## 注意事项

*   请务必保护好您的 `.env` 文件，不要将其提交到版本控制系统。
*   Shopify API 有速率限制。如果同步大量产品或频繁运行，可能会遇到限制。脚本中包含基本的重试逻辑，但可能需要根据实际情况调整。
*   库存同步逻辑目前较为简化。脚本主要依赖产品创建时的状态和从API获取的 `availability` 标记。精确的库存数量同步（特别是多地点库存）是一个复杂问题，当前未完全实现。
*   修改 Shopify 主题需要一定的 Liquid 编程知识。

# Existing README Content (If any)

# Shopify API Project

This project aims to integrate with various shopping platform APIs, starting with CJ and Pepperjam, to fetch product data and potentially synchronize it with other platforms like Shopify.

## Current Status

*   CJ API integration (`src/CJ`) allows fetching products using GraphQL.
*   Pepperjam (Ascend) API integration (`src/Ascend`) allows fetching various resources including publisher product creatives.
*   Basic command-line interfaces exist for testing individual API fetchers.

## Next Steps (Potentially outdated, see main description above)

*   Implement Shopify integration.
*   Develop a core orchestration module to manage the workflow.
*   Define a unified data model.
*   Refine error handling and logging.

# CJ 产品获取工具

这是一个使用CJ (Commission Junction)和Ascendpartner商业联盟API查询品牌商品信息的工具。通过该工具，您可以轻松获取指定品牌CID的产品feed、产品详情以及金融信用卡产品信息。

## 功能特点

- 查询指定品牌CID的产品Feed信息
- 获取产品详细信息（标题、描述、价格等）
- 基于关键词搜索产品
- 查询特定产品ID的详细信息
- 查询金融信用卡产品
- 查询广告商信息（XML转JSON格式）
- 使用Ascendpartner API查询商品和交易数据
- 命令行交互界面
- 结果保存为JSON文件

## 安装

### JavaScript 版本

1. 克隆仓库：

```bash
git clone [仓库URL]
cd cj-product-fetcher
```

2. 安装依赖：

```bash
npm install
```

### Python 版本

1. 确保安装了Python 3.8或更高版本：

```bash
python --version
```

2. 安装依赖：

```bash
pip install -r requirements.txt
```

## 配置环境变量

创建一个`.env`文件，并设置以下变量：

```
# CJ API配置
CJ_API_TOKEN=your_personal_access_token
CJ_API_ENDPOINT=https://ads.api.cj.com/query
CJ_API_KEY=your_api_key_here
CJ_CID=your_cid_here

# 默认品牌CID (Commission Junction的广告商ID)
BRAND_CID=7520009

# PID配置 (用于生成链接)
CJ_PID=9999999

# Ascendpartner API配置
ASCEND_API_BASE_URL=https://api.ascendpartner.com
ASCEND_API_KEY=your_api_key_here
ASCEND_API_VERSION=1.0
```

## 使用方法

### JavaScript 版本

#### 广告商查询工具（XML转JSON）

查询已加入关系的所有广告商并转换为JSON：

```bash
npm run advertiser joined
```

查询特定ID的广告商并转换为JSON：

```bash
npm run advertiser 5535819
```

使用交互式CLI界面查询广告商信息：

```bash
npm run advertiser-cli
```

通过CLI界面，您可以：
- 查询已加入的所有广告商并查看列表
- 根据ID查询特定广告商的详细信息
- 查看广告商的佣金、EPC等重要信息

查询结果将保存为JSON文件，并在控制台显示基本信息。

#### 品牌商品查询CLI工具

运行交互式CLI工具：

```bash
npm run brand-cli
```

通过CLI界面，您可以：
- 查询品牌产品Feed信息
- 查询品牌产品详情
- 查询品牌金融信用卡产品
- 执行所有查询

#### 直接查询品牌商品

使用命令行参数查询特定品牌：

```bash
# 使用默认品牌CID
npm run brand

# 使用指定品牌CID
npm run brand 12345
```

#### 产品详情查询工具

获取特定产品ID的详细信息：

```bash
# 使用默认公司ID
npm run product -- --id 1436540608

# 使用指定公司ID
npm run product -- --id 1436540608 --company 7520009
```

关键词搜索产品：

```bash
# 搜索关键词，使用默认公司ID
npm run product -- --search "hotel"

# 搜索关键词，指定公司ID和结果数量
npm run product -- --search "hotel" --company 7520009 --limit 20
```

查询结果将保存在`output/`目录下的JSON文件中。

### Python 版本

#### CJ产品查询工具

根据广告商ID查询商品：

```bash
python src/CJ/product_fetcher.py advertiser 5535819 50
```

关键词搜索商品：

```bash
python src/CJ/product_fetcher.py search "hotel" 50
```

查询已加入广告商的商品：

```bash
python src/CJ/product_fetcher.py joined 50
```

查看帮助信息：

```bash
python src/CJ/product_fetcher.py
```

#### Ascendpartner API查询工具

使用Ascendpartner API查询商品数据：

```bash
# 获取所有广告商信息
python src/ascendpartner_api.py advertiser

# 获取特定广告商信息
python src/ascendpartner_api.py advertiser 12345

# 获取商品列表
python src/ascendpartner_api.py products --advertiser 12345 --page 1

# 获取特定商品详情
python src/ascendpartner_api.py product 12345

# 搜索商品
python src/ascendpartner_api.py search "关键词" --advertiser 12345

# 获取交易记录
python src/ascendpartner_api.py transactions --start 2023-01-01 --end 2023-12-31

# 获取交易详情
python src/ascendpartner_api.py transaction 12345

# 获取交易项目
python src/ascendpartner_api.py transaction-items 12345

# 获取默认条款
python src/ascendpartner_api.py term-defaults
```

查询结果将保存在`output/`目录下的JSON文件中。

## API参考

### 查询示例

1. **品牌商品Feed查询**:

```graphql
{
  shoppingProductFeeds(companyId: "7520009") {
    totalCount
    count
    resultList {
      adId
      feedName
      advertiserId
      productCount
      advertiserCountry
      lastUpdated
      advertiserName
      language
      currency
      sourceFeedType
    }
  }
}
```

2. **产品详情查询**:

```graphql
{
  products(companyId: "7520009") {
    resultList {
      advertiserId
      catalogId
      id
      title
      description
      price {
        amount
        currency
      }
      linkCode(pid: "9999999") {
        clickUrl
      }
    }
  }
}
```

3. **特定产品ID查询**:

```graphql
{
  products(companyId: "7520009", productIds: ["1436540608"]) {
    resultList {
      id
      title
      description
      price {
        amount
        currency
      }
      imageUrl
      buyUrl
      advertiserName
      manufacturer
      inStock
    }
  }
}
```

4. **关键词搜索产品**:

```graphql
{
  products(companyId: "7520009", keywords: ["hotel"]) {
    totalCount
    count
    resultList {
      id
      title
      description
      price {
        amount
        currency
      }
    }
  }
}
```

5. **金融信用卡产品查询**:

```graphql
{
  financeProducts(companyId: 7520009, subId: "12345678") {
    resultList {
      id
      title
      linkCode(pid: "9999999") {
        clickUrl
      }
      ...creditCard
    }
  }
  fragment creditCard on CreditCard {
    creditRating
    marketingCopy
  }
}
```

## 注意事项

- 您必须拥有有效的CJ Personal Access Token才能使用此工具
- 在CJ开发者门户中获取API凭据：https://developers.cj.com/
- 确保拥有查询权限和正确的广告商关系

## 故障排除

如果遇到API错误，请检查：

1. API令牌是否有效
2. 是否有权限访问请求的资源
3. 品牌CID是否正确
4. 网络连接是否正常

## 许可证

ISC