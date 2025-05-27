# 关键词显示功能

## 功能概述

在Product Management页面中，现在会显示通过关键词搜索导入的商品对应的关键词信息。这个功能帮助用户了解每个产品是通过哪些关键词被找到和导入的。

## 实现细节

### 1. 数据库层面
- `Product`模型中的`keywordsMatched`字段（`String[]`类型）存储匹配的关键词
- 在产品导入时，系统会记录哪些关键词与该产品匹配

### 2. 后端API层面
- `ProductRetriever`服务在获取产品时会进行关键词匹配
- CJ API：使用OR逻辑匹配标题和描述中的关键词
- Pepperjam API：每个关键词单独进行API调用
- 匹配的关键词会保存在`UnifiedProduct.keywordsMatched`字段中

### 3. 前端显示层面

#### Product Management页面
- 在产品表格中添加了新的"Keywords"列
- 显示最多2个关键词标签，超过2个时显示"+X more"
- 使用蓝色的`Badge`组件显示关键词

#### Product Card组件
- 在产品卡片中显示匹配的关键词
- 显示最多3个关键词标签，超过3个时显示"+X more"
- 使用相同的蓝色`Badge`组件保持一致性

## 代码修改

### 前端修改
1. **ProductsPage.tsx**
   - 添加了`renderKeywords`函数来渲染关键词标签
   - 在表格中添加了"Keywords"列
   - 更新了列内容类型配置

2. **ProductCard.tsx**
   - 优化了关键词显示，使用Badge组件替代纯文本
   - 改进了布局和样式

### 后端修改
- 所有相关的后端代码已经支持`keywordsMatched`字段
- 数据库schema已包含该字段
- API路由正确返回该字段

## 使用场景

1. **关键词搜索导入**：当用户使用特定关键词搜索并导入产品时
2. **产品管理**：在Product Management页面查看哪些产品是通过哪些关键词找到的
3. **数据分析**：了解哪些关键词最有效地找到了相关产品

## 显示规则

- 如果产品没有匹配的关键词，显示"-"
- 如果有1-2个关键词，全部显示
- 如果有3个或更多关键词，显示前2个（表格）或前3个（卡片）+ "+X more"
- 关键词使用蓝色的小尺寸Badge显示

## 技术栈

- **前端**：React + TypeScript + Polaris UI
- **后端**：Node.js + Express + TypeScript
- **数据库**：PostgreSQL + Prisma ORM
- **API集成**：CJ API + Pepperjam API 