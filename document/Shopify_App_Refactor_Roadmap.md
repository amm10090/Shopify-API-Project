# Shopify 应用重构路线图

## 🗺️ Shopify应用开发完整路线图

### 📋 第一阶段：技术架构规划 (1-2周)

#### 1.1 技术栈选择

**前端技术栈：**

- **React 19+** - 现代化UI框架
- **Shopify Polaris** - Shopify官方设计系统
- **TypeScript** - 类型安全
- **Vite** - 快速构建工具
- **React Query/TanStack Query** - 数据状态管理

**后端技术栈：**

- **Node.js + Express.js** - 服务器框架
- **TypeScript** - 统一语言栈
- **Prisma ORM** - 数据库操作
- **PostgreSQL** - 主数据库
- **Redis** - 缓存和会话存储

**Shopify集成：**

- **Shopify CLI** - 开发工具
- **Shopify App Bridge** - 嵌入式应用框架
- **GraphQL Admin API** - Shopify数据操作
- **Webhooks** - 实时数据同步

#### 1.2 架构设计

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Shopify       │    │   Node.js API    │    │   External APIs │
│   Admin Panel   │◄──►│   Server         │◄──►│   (CJ/Pepperjam)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React UI      │    │   PostgreSQL     │    │   Background    │
│   (Polaris)     │    │   Database       │    │   Jobs Queue    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 📱 第二阶段：核心功能开发 (4-6周)

#### 2.1 数据模型设计

```typescript
// 核心数据模型
interface Product {
  id: string;
  sourceApi: 'cj' | 'pepperjam';
  sourceProductId: string;
  brandName: string;
  title: string;
  description: string;
  price: number;
  salePrice?: number;
  currency: string;
  imageUrl: string;
  affiliateUrl: string;
  categories: string[];
  availability: boolean;
  shopifyProductId?: string;
  importStatus: 'pending' | 'imported' | 'failed';
  lastUpdated: Date;
}

interface Brand {
  id: string;
  name: string;
  apiType: 'cj' | 'pepperjam';
  apiId: string;
  isActive: boolean;
  lastSync: Date;
}

interface ImportJob {
  id: string;
  brandId: string;
  status: 'running' | 'completed' | 'failed';
  productsFound: number;
  productsImported: number;
  filters: ProductFilters;
  createdAt: Date;
}
```

#### 2.2 API服务层重构

将现有Python代码转换为Node.js服务：

```typescript
// services/ProductRetriever.ts
export class ProductRetriever {
  async fetchCJProducts(params: CJFetchParams): Promise<UnifiedProduct[]> {
    // 重构现有的CJ API逻辑
  }
  
  async fetchPepperjamProducts(params: PepperjamFetchParams): Promise<UnifiedProduct[]> {
    // 重构现有的Pepperjam API逻辑
  }
}

// services/ShopifyService.ts
export class ShopifyService {
  async createProduct(product: UnifiedProduct): Promise<ShopifyProduct> {
    // 使用GraphQL Admin API创建产品
  }
  
  async updateProduct(productId: string, updates: Partial<UnifiedProduct>): Promise<void> {
    // 更新产品信息
  }
}
```

### 🎨 第三阶段：前端界面开发 (3-4周)

#### 3.1 主要页面组件

**1. 产品浏览页面**

```tsx
// components/ProductGrid.tsx
export function ProductGrid() {
  return (
    <Page title="产品管理">
      <Layout>
        <Layout.Section oneThird>
          <FilterPanel />
        </Layout.Section>
        <Layout.Section>
          <ProductList />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

**2. 品牌筛选器**

```tsx
// components/FilterPanel.tsx
export function FilterPanel() {
  return (
    <Card>
      <Card.Section>
        <Stack vertical>
          <BrandFilter />
          <PriceRangeFilter />
          <CategoryFilter />
          <AvailabilityFilter />
        </Stack>
      </Card.Section>
    </Card>
  );
}
```

**3. 产品卡片组件**

```tsx
// components/ProductCard.tsx
export function ProductCard({ product }: { product: UnifiedProduct }) {
  return (
    <Card>
      <Card.Section>
        <Stack>
          <Thumbnail source={product.imageUrl} alt={product.title} />
          <Stack vertical>
            <Text variant="headingMd">{product.title}</Text>
            <Text>${product.price}</Text>
            <Badge status={product.availability ? 'success' : 'critical'}>
              {product.availability ? '有货' : '缺货'}
            </Badge>
            <ImportButton product={product} />
          </Stack>
        </Stack>
      </Card.Section>
    </Card>
  );
}
```

#### 3.2 核心功能组件

**导入按钮组件**

```tsx
// components/ImportButton.tsx
export function ImportButton({ product }: { product: UnifiedProduct }) {
  const [importing, setImporting] = useState(false);
  
  const handleImport = async () => {
    setImporting(true);
    try {
      await importProductToShopify(product.id);
      // 显示成功消息
    } catch (error) {
      // 显示错误消息
    } finally {
      setImporting(false);
    }
  };
  
  return (
    <Button 
      primary 
      loading={importing}
      disabled={product.importStatus === 'imported'}
      onClick={handleImport}
    >
      {product.importStatus === 'imported' ? '已导入' : '导入到Shopify'}
    </Button>
  );
}
```

### 🔄 第四阶段：自动同步系统 (2-3周)

#### 4.1 Webhook处理

```typescript
// webhooks/productUpdate.ts
export async function handleProductUpdate(webhook: ShopifyWebhook) {
  const { product } = webhook.data;
  
  // 检查产品是否来自我们的应用
  const sourceProduct = await findSourceProduct(product.id);
  if (!sourceProduct) return;
  
  // 从API获取最新数据并更新
  const updatedData = await fetchLatestProductData(sourceProduct);
  await updateShopifyProduct(product.id, updatedData);
}
```

#### 4.2 定时同步任务

```typescript
// jobs/syncProducts.ts
export class ProductSyncJob {
  async execute() {
    const importedProducts = await getImportedProducts();
  
    for (const product of importedProducts) {
      try {
        const latestData = await fetchLatestProductData(product);
        await updateProductIfChanged(product, latestData);
      } catch (error) {
        logger.error(`同步产品失败: ${product.id}`, error);
      }
    }
  }
}
```

### 📊 第五阶段：高级功能开发 (2-3周)

#### 5.1 批量操作

```tsx
// components/BulkActions.tsx
export function BulkActions() {
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  
  return (
    <Card>
      <Card.Section>
        <Stack>
          <Button onClick={() => bulkImport(selectedProducts)}>
            批量导入 ({selectedProducts.length})
          </Button>
          <Button onClick={() => bulkUpdatePrices(selectedProducts)}>
            批量更新价格
          </Button>
        </Stack>
      </Card.Section>
    </Card>
  );
}
```

#### 5.2 实时数据更新

```tsx
// hooks/useRealTimeUpdates.ts
export function useRealTimeUpdates() {
  useEffect(() => {
    const ws = new WebSocket(WS_ENDPOINT);
  
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      // 更新本地状态
      updateProductInCache(update);
    };
  
    return () => ws.close();
  }, []);
}
```

### 🚀 第六阶段：部署和优化 (1-2周)

#### 6.1 部署架构

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - SHOPIFY_API_KEY=${SHOPIFY_API_KEY}
      - SHOPIFY_API_SECRET=${SHOPIFY_API_SECRET}
  
  postgres:
    image: postgres:14
    environment:
      - POSTGRES_DB=shopify_app
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
  
  redis:
    image: redis:7-alpine
```

#### 6.2 性能优化

- **数据库索引优化**
- **API响应缓存**
- **图片懒加载**
- **分页和虚拟滚动**
- **CDN集成**

### 📈 第七阶段：监控和维护 (持续)

#### 7.1 监控系统

```typescript
// monitoring/metrics.ts
export class MetricsCollector {
  trackProductImport(productId: string, success: boolean) {
    // 记录导入成功率
  }
  
  trackAPIResponse(api: string, responseTime: number) {
    // 监控API响应时间
  }
  
  trackUserAction(action: string, userId: string) {
    // 用户行为分析
  }
}
```

#### 7.2 错误处理和日志

```typescript
// utils/errorHandler.ts
export class ErrorHandler {
  static handle(error: Error, context: string) {
    logger.error(`${context}: ${error.message}`, {
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  
    // 发送到错误监控服务
    Sentry.captureException(error);
  }
}
```

## 🛠️ 开发工具和最佳实践

### 开发环境设置

```bash
# 1. 安装Shopify CLI
npm install -g @shopify/cli @shopify/theme

# 2. 创建新应用
shopify app create node --name="Product Importer"

# 3. 安装依赖
npm install @shopify/polaris @shopify/app-bridge-react
npm install prisma @prisma/client
npm install @tanstack/react-query
```

### 代码质量保证

```json
// package.json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:e2e": "playwright test"
  },
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  }
}
```

## 📅 时间线总结


| 阶段     | 时间        | 主要交付物             |
| -------- | ----------- | ---------------------- |
| 架构规划 | 1-2周       | 技术方案、数据模型设计 |
| 核心开发 | 4-6周       | API服务、基础功能      |
| 前端开发 | 3-4周       | 用户界面、交互功能     |
| 同步系统 | 2-3周       | 自动更新、Webhook处理  |
| 高级功能 | 2-3周       | 批量操作、实时更新     |
| 部署优化 | 1-2周       | 生产部署、性能优化     |
| **总计** | **13-20周** | **完整的Shopify应用**  |

这个路线图将现有的Python脚本转换为一个现代化、用户友好的Shopify应用，支持手动产品选择、实时同步和丰富的筛选功能。整个开发过程采用敏捷方法，可以根据实际需求调整优先级和功能范围。
