# Pepperjam API 使用指南 (原 Ascendpartner API)

## 概述

Pepperjam API 提供了一个REST接口，用于访问商品、广告商、交易等数据。本文档说明如何使用本项目中的 `ascendpartner_api.py` 工具与 Pepperjam API 进行交互。

## API 请求结构

Pepperjam API 请求使用以下URL结构：

```
https://api.pepperjamnetwork.com/{version}/{resource}?apiKey={apiKey}&format={format}
```

## API 请求参数

所有请求参数应该使用驼峰命名法（例如：firstName, programId, apiKey）。API请求需要以下参数：

| 参数      | 描述                        | 必填 | 默认值 |
|-----------|----------------------------|------|--------|
| version   | API版本                    | 是   | N/A    |
| resource  | 要访问的资源                | 是   | N/A    |
| apiKey    | 您的API密钥                | 是   | N/A    |
| format    | 响应格式                    | 是   | N/A    |
| page      | 分页参数                    | 否   | 1      |

## API 响应格式

API返回的响应格式可以是JSON或XML。所有的响应参数将使用蛇形命名法（例如：first_name, program_id, start_date）。

每页最多返回2500条结果。

## API 资源

主要的API资源包括：

1. 广告商详情 (advertiser)
2. 商品资源 (product)
3. 交易资源 (transaction)
4. 交易项目 (transactionItem)
5. 条款默认值 (termDefault)
6. 发布者产品创意素材 (publisher/creative/product)

## 配置

使用前需要在 `.env` 文件中设置以下环境变量：

```
PEPPERJAM_API_BASE_URL=https://api.pepperjamnetwork.com
PEPPERJAM_API_KEY=your_api_key_here
PEPPERJAM_API_VERSION=20120402
```

## 使用方法

### 获取广告商信息

获取所有广告商：

```bash
python src/ascendpartner_api.py advertiser
```

获取特定广告商：

```bash
python src/ascendpartner_api.py advertiser 12345
```

### 获取商品信息

获取所有商品：

```bash
python src/ascendpartner_api.py products
```

获取特定广告商的商品：

```bash
python src/ascendpartner_api.py products --advertiser 12345
```

分页获取商品：

```bash
python src/ascendpartner_api.py products --page 2
```

获取特定商品详情：

```bash
python src/ascendpartner_api.py product 12345
```

搜索商品：

```bash
python src/ascendpartner_api.py search "关键词"
```

### 获取交易信息

获取交易记录：

```bash
python src/ascendpartner_api.py transactions
```

按日期过滤交易：

```bash
python src/ascendpartner_api.py transactions --start 2023-01-01 --end 2023-12-31
```

获取交易详情：

```bash
python src/ascendpartner_api.py transaction 12345
```

获取交易项目：

```bash
python src/ascendpartner_api.py transaction-items 12345
```

### 获取默认条款

```bash
python src/ascendpartner_api.py term-defaults
```

### 获取发布者产品创意素材（适用于出版商）

这个资源（`publisher/creative/product`）允许出版商获取其合作广告商的产品创意素材，是获取畅销产品的理想选择。

**基本格式：**

```bash
python src/ascendpartner_api.py --no-ssl-verify publisher-products [参数选项]
```

**注意：** `--no-ssl-verify` 是全局选项，必须放在子命令前面。

**参数选项：**

| 参数 | 描述 | 示例 | 必填 |
|------|------|------|------|
| --program-ids | 逗号分隔的广告商ID列表 | "123,456,789" | 否 |
| --categories | 逗号分隔的类别ID列表 | "123,456,789" | 否 |
| --keywords | 空格分隔的关键词列表 | "关键词1 关键词2" | 否 |
| --refurl | 关联流量和转化的URL | "https://yoursite.com" | 否 |
| --page | 分页参数 | 2 | 否 |
| --limit | 返回的最大结果数量 | 50 | 否 |

**使用示例：**

```bash
# 基本用法-获取特定广告商的产品
python src/ascendpartner_api.py --no-ssl-verify publisher-products --program-ids "6200"

# 使用关键词搜索
python src/ascendpartner_api.py --no-ssl-verify publisher-products --keywords "热销商品"

# 限制返回结果数量为50条
python src/ascendpartner_api.py --no-ssl-verify publisher-products --program-ids "6200" --limit 50

# 组合参数使用
python src/ascendpartner_api.py --no-ssl-verify publisher-products --program-ids "6200" --keywords "热销商品" --refurl "https://yoursite.com" --limit 50

# 获取第2页结果并限制数量
python src/ascendpartner_api.py --no-ssl-verify publisher-products --program-ids "6200" --page 2 --limit 50
```

**关于limit参数的说明：**

Pepperjam API本身每页最多返回2500条结果。`--limit`参数是在客户端实现的，它会先获取API返回的全部结果（最多2500条），然后截取前N条返回。这对于只需要少量结果而不想处理大量数据的场景非常有用。

**响应字段：**

响应中包含丰富的产品信息，主要字段包括：

- name - 商品名称
- description_short/long - 商品描述
- price - 销售价格
- price_sale - 折扣价格
- image_url - 标准图片URL
- image_thumb_url - 缩略图URL
- buy_url - 购买链接
- manufacturer - 制造商或品牌
- category_program - 商品类别
- in_stock - 是否有库存
- keywords - 相关关键词

## 返回数据格式示例

JSON格式的响应示例：

```json
{
  "meta": {
    "status": {     
      "code": 200,
      "message": "OK"
    },
    "pagination": {     
      "total_results": 1000,
      "total_pages": 2,
      "next": {
        "rel": "next",
        "href": "https://api.pepperjamnetwork.com/20120402/product?apiKey=YOUR_KEY&format=json&page=2",
        "description": "Next Page"
      }
    },
    "requests": {     
      "current": 150,
      "maximum": 5000
    }
  },
  "data": [
    {
      "id": "12345",
      "name": "商品名称",
      "description": "商品描述",
      "price": "99.99",
      "currency": "USD",
      "image_url": "https://example.com/image.jpg",
      "product_url": "https://example.com/product",
      "advertiser_id": "6789",
      "advertiser_name": "广告商名称",
      "category": "电子产品",
      "brand": "品牌名称",
      "sku": "SKU123456",
      "availability": "in_stock",
      "condition": "new",
      "created_at": "2023-01-01T00:00:00Z",
      "updated_at": "2023-06-01T00:00:00Z"
    }
  ]
}
```

## 错误处理

API请求可能会遇到以下错误：

| 状态码 | 描述                  | 说明                                                  |
|--------|----------------------|-------------------------------------------------------|
| 200    | 成功                  | 响应体可以立即使用                                     |
| 201    | 已创建                | 对象已成功创建                                         |
| 204    | 已删除                | 对象已成功删除                                         |
| 400    | 无效参数              | 客户端不应使用相同的参数再次尝试                        |
| 401    | 认证错误              | 客户端必须进行身份验证才能使用服务                      |
| 403    | 禁止访问              | 客户端无权访问服务的此部分                             |
| 404    | 未找到                | 客户端尝试访问不存在的资源                             |
| 429    | 请求过多              | 客户端发送的请求过多或超出并发连接限制                  |
| 500    | 内部服务器错误        | 服务器发生意外错误；客户端可在问题解决后重试           |

### 常见错误及解决方法

#### 1. SSL错误问题

如果遇到SSL相关错误：
```
SSL错误: [SSL: UNEXPECTED_EOF_WHILE_READING] EOF occurred in violation of protocol
```

**解决方法：**
- 使用`--no-ssl-verify`全局参数禁用SSL验证
- 确保正确的命令格式：`python src/ascendpartner_api.py --no-ssl-verify [子命令] [参数]`
- 如果问题持续存在，可能是API服务器端的问题，请联系Pepperjam技术支持

#### 2. 参数错误

如果提示"unrecognized arguments"错误，请检查：
- 确保全局参数（如`--no-ssl-verify`）放在子命令之前
- 确保子命令支持您提供的参数
- 参数格式是否正确

#### 3. API密钥问题

如果API返回401错误：
- 检查`.env`文件中的API密钥是否正确
- 可能需要重新生成API密钥
- 确认您的账户权限

## API 限制

Pepperjam API 有以下使用限制：

1. 每个API响应最多返回2500条结果
2. 请求频率和每日总请求次数有限制（具体限制显示在每个API响应的meta.requests字段中）
3. 所有时间都使用美国东部时间（考虑夏令时）

请合理使用API，避免超出限制而被封禁。

### 获取产品类别信息

要获取产品类别信息，使用以下命令：

```bash
python src/pepperjam_publisher_api.py --no-ssl-verify categories
```

或者使用等效的创意分类命令：

```bash
python src/pepperjam_publisher_api.py --no-ssl-verify creative-categories
```

这两个命令访问同一个资源：`publisher/creative/category`，可以用来获取所有可用的产品类别。

**注意：** API资源路径为`publisher/creative/category`而不是`publisher/category`。使用正确的路径是成功获取类别信息的关键。

获取类别信息后，您可以使用类别ID来筛选产品查询：

```bash
python src/pepperjam_publisher_api.py --no-ssl-verify publisher-products --categories "123,456" --limit 50
``` 