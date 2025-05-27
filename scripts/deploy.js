#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 开始部署 Shopify 产品导入应用...\n');

// 检查必需的环境变量
const requiredEnvVars = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'DATABASE_URL',
    'CJ_API_TOKEN',
    'BRAND_CID'
];

console.log('✅ 检查环境变量...');
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ 缺少必需的环境变量:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n请在 .env 文件中设置这些变量，或者在部署平台的环境变量设置中配置。');
    process.exit(1);
}

console.log('✅ 环境变量检查通过\n');

try {
    // 1. 安装依赖
    console.log('📦 安装依赖...');
    execSync('npm ci', { stdio: 'inherit' });

    // 2. 数据库迁移
    console.log('\n🗄️  运行数据库迁移...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    // 3. 生成 Prisma 客户端
    console.log('\n🔄 生成 Prisma 客户端...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // 4. 构建项目
    console.log('\n🔨 构建项目...');
    execSync('npm run build', { stdio: 'inherit' });

    // 5. 检查构建文件
    console.log('\n🔍 检查构建文件...');
    const distDir = path.join(process.cwd(), 'dist');
    const clientDir = path.join(distDir, 'client');
    const serverDir = path.join(distDir, 'server');

    if (!fs.existsSync(clientDir)) {
        throw new Error('客户端构建失败：dist/client 目录不存在');
    }

    if (!fs.existsSync(serverDir)) {
        throw new Error('服务端构建失败：dist/server 目录不存在');
    }

    if (!fs.existsSync(path.join(serverDir, 'index.js'))) {
        throw new Error('服务端构建失败：dist/server/index.js 文件不存在');
    }

    console.log('✅ 构建文件检查通过');

    // 6. 创建必要的目录
    console.log('\n📁 创建必要的目录...');
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
        console.log('✅ 创建 logs 目录');
    }

    // 7. 启动应用（如果是 PM2 环境）
    if (process.env.USE_PM2 === 'true') {
        console.log('\n🔄 使用 PM2 重启应用...');
        try {
            execSync('pm2 reload ecosystem.config.js', { stdio: 'inherit' });
        } catch (error) {
            console.log('PM2 重载失败，尝试启动新实例...');
            execSync('pm2 start ecosystem.config.js', { stdio: 'inherit' });
        }
    }

    console.log('\n🎉 部署完成！');
    console.log('\n📝 部署信息:');
    console.log(`   - 应用名称: Shopify Product Importer`);
    console.log(`   - 环境: ${process.env.NODE_ENV || 'production'}`);
    console.log(`   - 端口: ${process.env.PORT || 3000}`);
    console.log(`   - 构建时间: ${new Date().toISOString()}`);

    if (process.env.APPLICATION_URL) {
        console.log(`   - 应用URL: ${process.env.APPLICATION_URL}`);
    }

    console.log('\n🔗 重要链接:');
    console.log('   - Shopify Partners: https://partners.shopify.com/');
    console.log('   - 应用管理: https://partners.shopify.com/organizations');

    console.log('\n⚠️  部署后检查清单:');
    console.log('   1. 确认应用能正常访问');
    console.log('   2. 测试 Shopify OAuth 流程');
    console.log('   3. 验证 API 端点正常工作');
    console.log('   4. 检查日志文件输出');
    console.log('   5. 测试产品导入功能');

} catch (error) {
    console.error('\n❌ 部署失败:', error.message);
    console.error('\n🔍 故障排除建议:');
    console.error('   1. 检查所有环境变量是否正确设置');
    console.error('   2. 确认数据库连接正常');
    console.error('   3. 检查网络连接和防火墙设置');
    console.error('   4. 查看完整的错误日志');
    console.error('   5. 确认 Node.js 版本兼容性');

    process.exit(1);
} 