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