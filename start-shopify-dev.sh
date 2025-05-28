#!/bin/bash

# Shopify 应用开发环境启动脚本

# 确保在正确的目录执行
cd "$(dirname "$0")"

echo "🚀 启动 Shopify Product Importer 开发环境..."
echo "📁 当前工作目录: $(pwd)"

# 设置环境变量
export NODE_ENV=development

# 检查环境变量
if [ ! -f .env ]; then
    echo "❌ .env 文件不存在，请先创建配置文件"
    exit 1
fi

# 检查 shopify.app.toml 文件
if [ ! -f shopify.app.toml ]; then
    echo "❌ shopify.app.toml 文件不存在"
    exit 1
fi

# 生成 Prisma 客户端
echo "📦 生成 Prisma 客户端..."
npx prisma generate

# 使用 Shopify CLI 启动开发环境
echo "🔧 启动 Shopify 开发环境..."
shopify app dev

echo "✅ 开发环境启动完成!"