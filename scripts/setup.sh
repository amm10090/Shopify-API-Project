#!/bin/bash

echo "🚀 Setting up Shopify Product Importer..."

# 检查 Node.js 版本
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 18.0.0"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="18.0.0"

if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please upgrade to >= $REQUIRED_VERSION"
    exit 1
fi

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# 安装依赖
echo "📦 Installing dependencies..."
pnpm install

# 检查环境文件
if [ ! -f .env ]; then
    echo "⚙️ Creating .env file from template..."
    cp .env.example .env
    echo "📝 Please edit .env file with your API credentials"
fi

# 生成 Prisma 客户端
echo "🗄️ Generating Prisma client..."
pnpm prisma generate

# 检查数据库连接
echo "🔍 Checking database connection..."
if pnpm prisma db push --accept-data-loss 2>/dev/null; then
    echo "✅ Database connected successfully"
else
    echo "⚠️ Database connection failed. Please check your DATABASE_URL in .env"
    echo "   Make sure PostgreSQL is running and the database exists"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API credentials"
echo "2. Make sure PostgreSQL and Redis are running"
echo "3. Run 'pnpm dev' to start the development server"
echo ""
echo "📚 For more information, see README.md" 