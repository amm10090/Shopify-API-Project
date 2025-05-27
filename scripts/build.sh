#!/bin/bash

# 构建脚本 - 确保正确处理路径别名

set -e

echo "🧹 清理旧的构建文件..."
rm -rf dist

echo "📦 构建服务器端代码..."
npx tsc -p server/tsconfig.json

echo "📁 复制共享文件到构建目录..."
cp -r shared dist/

echo "🔧 处理构建后的路径别名..."
node scripts/post-build.js

echo "🌐 构建客户端代码..."
npx vite build

echo "✅ 构建完成！"
echo "📂 服务器文件: dist/server/"
echo "📂 客户端文件: dist/client/"
echo "📂 共享文件: dist/shared/" 