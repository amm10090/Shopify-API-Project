#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function setupEnvironment() {
    console.log('🚀 Shopify 应用环境变量配置助手\n');
    console.log('这个脚本将帮助你设置必需的环境变量。\n');

    const config = {};

    // 基础配置
    console.log('📋 基础配置:');
    config.NODE_ENV = (await ask('环境类型 (development/production) [development]: ')) || 'development';
    config.PORT = (await ask('端口号 [3000]: ')) || '3000';
    console.log('');

    // 数据库配置
    console.log('🗄️  数据库配置:');
    config.DATABASE_URL = await ask('PostgreSQL 连接字符串: ') || 'postgresql://postgres:password@localhost:5432/shopify_app_dev';
    config.REDIS_URL = (await ask('Redis 连接字符串 [redis://localhost:6379]: ')) || 'redis://localhost:6379';
    console.log('');

    // Shopify 配置
    console.log('🛍️  Shopify 应用配置 (必需):');
    console.log('请从 https://partners.shopify.com/ 获取以下信息:');
    config.SHOPIFY_API_KEY = await ask('Shopify API Key (必需): ');
    config.SHOPIFY_API_SECRET = await ask('Shopify API Secret (必需): ');
    config.SHOPIFY_HOST_NAME = (await ask('应用主机名 [localhost:3000]: ')) || 'localhost:3000';
    config.SHOPIFY_API_VERSION = (await ask('Shopify API 版本 [2024-07]: ')) || '2024-07';
    console.log('');

    // 第三方 API
    console.log('🔗 第三方 API 配置 (可选):');
    config.CJ_API_TOKEN = await ask('CJ Affiliate API Token (可选): ');
    config.BRAND_CID = await ask('CJ Brand CID (可选): ');
    config.ASCEND_API_KEY = await ask('Pepperjam/Ascend API Key (可选): ');
    console.log('');

    // 应用设置
    console.log('⚙️  应用设置:');
    config.DEFAULT_PRODUCT_LIMIT = (await ask('默认产品限制 [50]: ')) || '50';
    config.SKIP_IMAGE_VALIDATION = (await ask('跳过图片验证? (true/false) [true]: ')) || 'true';
    config.LOG_LEVEL = (await ask('日志级别 (debug/info/warn/error) [debug]: ')) || 'debug';
    console.log('');

    // 开发环境设置
    if (config.NODE_ENV === 'development') {
        console.log('🔧 开发环境设置:');
        config.DEV_STORE_URL = await ask('开发商店 URL (your-store.myshopify.com): ');
        config.CLIENT_URL = (await ask('客户端 URL [http://localhost:5173]: ')) || 'http://localhost:5173';
    }

    rl.close();

    // 验证必需字段
    const requiredFields = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
    const missing = requiredFields.filter(field => !config[field]);

    if (missing.length > 0) {
        console.log('\n❌ 错误: 缺少必需的配置项:');
        missing.forEach(field => console.log(`  - ${field}`));
        console.log('\n请重新运行脚本并填入所有必需项。');
        process.exit(1);
    }

    // 生成 .env 文件内容
    const envContent = Object.entries(config)
        .filter(([key, value]) => value)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const fullEnvContent = `# Shopify 应用配置
# 由 setup-env.js 自动生成于 ${new Date().toISOString()}

${envContent}

# 其他设置 (可根据需要调整)
CJ_API_ENDPOINT=https://ads.api.cj.com/query
PEPPERJAM_API_BASE_URL=https://api.pepperjamnetwork.com
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_here
`;

    // 写入 .env 文件
    const envPath = path.join(process.cwd(), '.env');

    if (fs.existsSync(envPath)) {
        const backup = `${envPath}.backup.${Date.now()}`;
        fs.copyFileSync(envPath, backup);
        console.log(`\n📋 已备份现有 .env 文件到: ${backup}`);
    }

    fs.writeFileSync(envPath, fullEnvContent);
    console.log(`\n✅ 环境变量配置已保存到: ${envPath}`);

    // 显示下一步
    console.log('\n🎉 配置完成！下一步:');
    console.log('1. 检查生成的 .env 文件');
    console.log('2. 运行数据库迁移: npm run db:migrate');
    console.log('3. 启动应用: npm run dev');
    console.log('\n📚 详细说明请查看: ENVIRONMENT_SETUP.md');
}

// 错误处理
process.on('SIGINT', () => {
    console.log('\n\n👋 配置已取消');
    process.exit(0);
});

setupEnvironment().catch(console.error); 