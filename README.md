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

#### 🔧 技术实现亮点

**智能API架构**
- **双API支持**：GraphQL优先，REST API作为智能回退
- **无缝切换**：单一环境变量控制，不影响现有功能
- **自动故障恢复**：GraphQL失败时自动降级到REST API

**遵循Shopify最佳实践**
- ✅ **现代化Mutations**：使用`productCreate`和`productCreateMedia`
- ✅ **统一输入结构**：标准的`ProductInput`和`CreateMediaInput`
- ✅ **Global ID使用**：`gid://shopify/Product/123`格式
- ✅ **完整错误处理**：`userErrors`和`mediaUserErrors`标准化处理
- ✅ **变量和类型安全**：正确的GraphQL变量传递

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