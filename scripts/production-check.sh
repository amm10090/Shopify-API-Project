#!/bin/bash

# 生产环境检查脚本
echo "🔍 检查生产环境准备情况..."

# 检查构建文件
echo ""
echo "📁 检查构建文件..."

if [ ! -f "dist/server/server/index.js" ]; then
    echo "❌ 服务端构建文件不存在: dist/server/server/index.js"
    echo "   请运行: pnpm run build 或 ./scripts/deploy.sh"
    exit 1
else
    echo "✅ 服务端构建文件存在"
fi

if [ ! -f "dist/client/index.html" ]; then
    echo "❌ 前端构建文件不存在: dist/client/index.html"
    echo "   请运行: pnpm run build 或 ./scripts/deploy.sh"
    exit 1
else
    echo "✅ 前端构建文件存在"
fi

# 检查环境变量
echo ""
echo "🔧 检查环境变量..."

required_vars=(
    "DATABASE_URL"
    "SHOPIFY_API_KEY"
    "SHOPIFY_API_SECRET"
)

optional_vars=(
    "CJ_API_TOKEN"
    "BRAND_CID"
    "ASCEND_API_KEY"
    "REDIS_URL"
)

missing_required=0

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ 缺少必需环境变量: $var"
        missing_required=1
    else
        echo "✅ $var 已配置"
    fi
done

echo ""
echo "📋 可选环境变量状态:"
for var in "${optional_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "⚠️  $var 未配置（可选）"
    else
        echo "✅ $var 已配置"
    fi
done

# 检查端口
echo ""
echo "🌐 检查端口配置..."
PORT=${PORT:-3000}
echo "应用将在端口 $PORT 启动"

# 检查Node.js版本
echo ""
echo "📋 检查运行环境..."
node_version=$(node -v)
echo "Node.js 版本: $node_version"

# 检查数据库连接（如果可能）
echo ""
echo "🗄️ 数据库检查..."
if [ -n "$DATABASE_URL" ]; then
    echo "数据库URL已配置，建议运行数据库迁移："
    echo "  npx prisma migrate deploy"
else
    echo "❌ 数据库URL未配置"
fi

echo ""
if [ $missing_required -eq 0 ]; then
    echo "🎉 生产环境检查通过！"
    echo ""
    echo "🚀 启动应用："
    echo "  NODE_ENV=production node dist/server/index.js"
    echo ""
    echo "或使用PM2："
    echo "  pm2 start dist/server/index.js --name shopify-app"
    exit 0
else
    echo "❌ 生产环境检查失败，请修复上述问题后重试"
    exit 1
fi 