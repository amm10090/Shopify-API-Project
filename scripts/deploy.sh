#!/bin/bash

# Shopify应用自动部署脚本
# 使用方法: ./scripts/deploy.sh [platform] [environment]
# 平台选项: railway, heroku, vps
# 环境选项: staging, production

set -e

PLATFORM=${1:-railway}
ENVIRONMENT=${2:-production}

echo "🚀 开始部署 Shopify 产品导入应用"
echo "平台: $PLATFORM"
echo "环境: $ENVIRONMENT"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必需的工具
check_requirements() {
    log_info "检查部署要求..."
    
    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    # 检查pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warn "pnpm 未安装，正在安装..."
        npm install -g pnpm
    fi
    
    # 检查Git
    if ! command -v git &> /dev/null; then
        log_error "Git 未安装"
        exit 1
    fi
    
    log_info "✅ 所有要求已满足"
}

# 构建应用
build_app() {
    log_info "构建应用..."
    
    # 安装依赖
    log_info "安装依赖..."
    pnpm install
    
    # 生成Prisma客户端
    log_info "生成Prisma客户端..."
    npx prisma generate
    
    # 构建前端
    log_info "构建前端..."
    pnpm run build:client
    
    # 构建后端
    log_info "构建后端..."
    pnpm run build:server
    
    log_info "✅ 应用构建完成"
}

# 检查环境变量
check_env_vars() {
    log_info "检查环境变量..."
    
    required_vars=(
        "SHOPIFY_API_KEY"
        "SHOPIFY_API_SECRET"
        "DATABASE_URL"
    )
    
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "缺少必需的环境变量:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        log_error "请在 .env 文件中设置这些变量"
        exit 1
    fi
    
    log_info "✅ 环境变量检查通过"
}

# Railway部署
deploy_railway() {
    log_info "部署到 Railway..."
    
    # 检查Railway CLI
    if ! command -v railway &> /dev/null; then
        log_warn "Railway CLI 未安装，正在安装..."
        npm install -g @railway/cli
    fi
    
    # 检查是否已登录
    if ! railway whoami &> /dev/null; then
        log_warn "请先登录 Railway:"
        railway login
    fi
    
    # 部署
    log_info "开始部署..."
    railway up
    
    # 运行数据库迁移
    log_info "运行数据库迁移..."
    railway run npx prisma migrate deploy
    
    # 获取部署URL
    DEPLOY_URL=$(railway domain 2>/dev/null || echo "请手动设置域名")
    log_info "✅ 部署完成! URL: $DEPLOY_URL"
}

# Heroku部署
deploy_heroku() {
    log_info "部署到 Heroku..."
    
    # 检查Heroku CLI
    if ! command -v heroku &> /dev/null; then
        log_error "请先安装 Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli"
        exit 1
    fi
    
    # 检查是否已登录
    if ! heroku whoami &> /dev/null; then
        log_warn "请先登录 Heroku:"
        heroku login
    fi
    
    # 创建Procfile
    log_info "创建 Procfile..."
    cat > Procfile << EOF
web: node dist/server/server/index.js
release: npx prisma migrate deploy
EOF
    
    # 设置环境变量
    log_info "设置环境变量..."
    if [[ -f .env ]]; then
        while IFS= read -r line; do
            if [[ $line =~ ^[A-Z_]+=.* ]]; then
                heroku config:set "$line"
            fi
        done < .env
    fi
    
    # 部署
    log_info "开始部署..."
    git add .
    git commit -m "Deploy to Heroku - $(date)"
    git push heroku main
    
    log_info "✅ Heroku 部署完成!"
}

# VPS部署
deploy_vps() {
    log_info "部署到 VPS..."
    
    # 检查SSH配置
    if [[ -z "$VPS_HOST" ]] || [[ -z "$VPS_USER" ]]; then
        log_error "请设置 VPS_HOST 和 VPS_USER 环境变量"
        exit 1
    fi
    
    # 创建部署包
    log_info "创建部署包..."
    tar -czf deploy.tar.gz \
        dist/ \
        node_modules/ \
        prisma/ \
        package.json \
        .env
    
    # 上传到服务器
    log_info "上传到服务器..."
    scp deploy.tar.gz $VPS_USER@$VPS_HOST:/tmp/
    
    # 在服务器上部署
    log_info "在服务器上部署..."
    ssh $VPS_USER@$VPS_HOST << 'EOF'
        cd /var/www/shopify-app
        
        # 备份当前版本
        if [[ -d current ]]; then
            mv current backup-$(date +%Y%m%d-%H%M%S)
        fi
        
        # 解压新版本
        mkdir current
        cd current
        tar -xzf /tmp/deploy.tar.gz
        
        # 运行数据库迁移
        npx prisma migrate deploy
        
        # 重启应用
        pm2 restart shopify-app || pm2 start dist/server/server/index.js --name shopify-app
        
        # 清理
        rm /tmp/deploy.tar.gz
EOF
    
    # 清理本地文件
    rm deploy.tar.gz
    
    log_info "✅ VPS 部署完成!"
}

# 部署后检查
post_deploy_check() {
    log_info "执行部署后检查..."
    
    # 等待应用启动
    sleep 10
    
    # 健康检查
    if [[ -n "$DEPLOY_URL" ]]; then
        if curl -f "$DEPLOY_URL/health" &> /dev/null; then
            log_info "✅ 应用健康检查通过"
        else
            log_warn "⚠️ 应用健康检查失败，请检查日志"
        fi
    fi
}

# 主函数
main() {
    echo "=========================================="
    echo "  Shopify 产品导入应用部署脚本"
    echo "=========================================="
    
    check_requirements
    
    # 加载环境变量
    if [[ -f .env ]]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    check_env_vars
    build_app
    
    case $PLATFORM in
        railway)
            deploy_railway
            ;;
        heroku)
            deploy_heroku
            ;;
        vps)
            deploy_vps
            ;;
        *)
            log_error "不支持的平台: $PLATFORM"
            echo "支持的平台: railway, heroku, vps"
            exit 1
            ;;
    esac
    
    post_deploy_check
    
    echo "=========================================="
    log_info "🎉 部署完成!"
    echo "=========================================="
    
    # 显示后续步骤
    echo ""
    echo "后续步骤:"
    echo "1. 在 Shopify Partners Dashboard 中更新应用URL"
    echo "2. 测试 OAuth 认证流程"
    echo "3. 创建开发商店进行功能测试"
    echo "4. 配置监控和日志"
    echo ""
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi 