#!/bin/bash

# 开发环境启动脚本

echo "🚀 启动开发环境..."

# 检查必要的环境变量
if [ ! -f .env ]; then
    echo "⚠️  警告: .env 文件不存在，请复制 .env.example 并配置"
fi

# 检查依赖是否安装
if [ ! -d node_modules ]; then
    echo "📦 安装依赖..."
    pnpm install
fi

# 生成Prisma客户端
echo "🔧 生成Prisma客户端..."
npx prisma generate

# 启动开发服务器
echo "🌟 启动开发服务器..."
pnpm run dev 