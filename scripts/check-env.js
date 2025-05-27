#!/usr/bin/env node

/**
 * 环境变量检查脚本
 * 运行: node scripts/check-env.js
 */

const fs = require('fs');
const path = require('path');

// 彩色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function header(message) {
    log('\n' + '='.repeat(60), 'cyan');
    log(message, 'cyan');
    log('='.repeat(60), 'cyan');
}

function checkEnvFile() {
    const envPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(envPath)) {
        log('❌ .env 文件不存在！', 'red');
        log('请创建 .env 文件并配置必要的环境变量', 'yellow');
        return false;
    }

    log('✅ .env 文件存在', 'green');
    return true;
}

function loadEnvFile() {
    try {
        require('dotenv').config();
        log('✅ 环境变量加载成功', 'green');
    } catch (error) {
        log('❌ 无法加载环境变量: ' + error.message, 'red');
        process.exit(1);
    }
}

function checkRequired(envVars) {
    log('\n检查必需的环境变量:', 'bright');

    const results = {};
    let allRequired = true;

    envVars.forEach(({ name, description, required = true }) => {
        const value = process.env[name];
        const exists = !!value;
        const isEmpty = !value || value.trim() === '';

        results[name] = { exists, isEmpty, value, required };

        if (required) {
            if (!exists || isEmpty) {
                log(`  ❌ ${name} - ${description}`, 'red');
                allRequired = false;
            } else {
                const displayValue = name.includes('SECRET') || name.includes('TOKEN') || name.includes('KEY')
                    ? '*'.repeat(Math.min(value.length, 20))
                    : value;
                log(`  ✅ ${name} - ${displayValue}`, 'green');
            }
        } else {
            if (exists && !isEmpty) {
                const displayValue = name.includes('SECRET') || name.includes('TOKEN') || name.includes('KEY')
                    ? '*'.repeat(Math.min(value.length, 20))
                    : value;
                log(`  ✅ ${name} - ${displayValue} (可选)`, 'green');
            } else {
                log(`  ⚠️  ${name} - 未设置 (可选)`, 'yellow');
            }
        }
    });

    return { allRequired, results };
}

function testApiConnections() {
    log('\n测试 API 连接配置:', 'bright');

    // 检查 Shopify 配置
    const shopifyConfigured = !!(process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET);
    if (shopifyConfigured) {
        log('  ✅ Shopify API - 配置完整', 'green');
    } else {
        log('  ❌ Shopify API - 配置不完整', 'red');
    }

    // 检查 CJ API 配置
    const cjConfigured = !!(process.env.CJ_API_TOKEN && (process.env.CJ_CID || process.env.BRAND_CID));
    if (cjConfigured) {
        log('  ✅ CJ Affiliate API - 配置完整', 'green');
    } else {
        log('  ⚠️  CJ Affiliate API - 配置不完整', 'yellow');
    }

    // 检查 Pepperjam API 配置
    const pepperjamConfigured = !!(process.env.ASCEND_API_KEY || process.env.PEPPERJAM_API_KEY);
    if (pepperjamConfigured) {
        log('  ✅ Pepperjam API - 配置完整', 'green');
    } else {
        log('  ⚠️  Pepperjam API - 配置不完整', 'yellow');
    }

    return { shopifyConfigured, cjConfigured, pepperjamConfigured };
}

function generateSampleEnv() {
    const sampleContent = `# =============================================================================
# 🔑 Shopify 应用配置（必需）
# =============================================================================
SHOPIFY_API_KEY=your_shopify_api_key_here
SHOPIFY_API_SECRET=your_shopify_api_secret_here
SHOPIFY_HOST_NAME=localhost:3000
SHOPIFY_API_VERSION=2024-07

# =============================================================================
# 📊 数据库配置（必需）
# =============================================================================
DATABASE_URL="postgresql://username:password@localhost:5432/shopify_app"

# =============================================================================
# 🔄 Redis 配置（可选）
# =============================================================================
REDIS_URL="redis://localhost:6379"

# =============================================================================
# 🛒 联盟 API 配置
# =============================================================================

# CJ Affiliate API
CJ_API_TOKEN=your_cj_api_token_here
CJ_CID=your_cj_company_id
BRAND_CID=your_brand_company_id
CJ_API_ENDPOINT=https://ads.api.cj.com/query

# Pepperjam API  
ASCEND_API_KEY=your_pepperjam_api_key_here
PEPPERJAM_API_KEY=your_pepperjam_api_key_here
PEPPERJAM_API_BASE_URL=https://api.pepperjamnetwork.com

# =============================================================================
# 🌐 应用设置
# =============================================================================
NODE_ENV=development
PORT=3000
DEFAULT_PRODUCT_LIMIT=50
SKIP_IMAGE_VALIDATION=true
LOG_LEVEL=debug
`;

    fs.writeFileSync(path.join(process.cwd(), '.env.example'), sampleContent);
    log('✅ 已生成 .env.example 文件', 'green');
}

function main() {
    header('🔍 环境变量配置检查');

    // 检查 .env 文件是否存在
    const envExists = checkEnvFile();

    if (!envExists) {
        log('\n正在生成示例 .env 文件...', 'yellow');
        generateSampleEnv();
        log('请复制 .env.example 到 .env 并填入您的配置信息', 'yellow');
        return;
    }

    // 加载环境变量
    loadEnvFile();

    // 定义要检查的环境变量
    const envVars = [
        // Shopify 必需配置
        { name: 'SHOPIFY_API_KEY', description: 'Shopify API Key', required: true },
        { name: 'SHOPIFY_API_SECRET', description: 'Shopify API Secret', required: true },
        { name: 'SHOPIFY_HOST_NAME', description: 'Shopify Host Name', required: true },

        // 数据库必需配置
        { name: 'DATABASE_URL', description: 'PostgreSQL 数据库连接URL', required: true },

        // Redis 可选配置
        { name: 'REDIS_URL', description: 'Redis 连接URL', required: false },

        // CJ API 配置
        { name: 'CJ_API_TOKEN', description: 'CJ Affiliate API Token', required: false },
        { name: 'BRAND_CID', description: 'CJ Brand Company ID', required: false },
        { name: 'CJ_CID', description: 'CJ Company ID', required: false },

        // Pepperjam API 配置
        { name: 'ASCEND_API_KEY', description: 'Pepperjam API Key', required: false },
        { name: 'PEPPERJAM_API_KEY', description: 'Pepperjam API Key (备用)', required: false },

        // 应用设置
        { name: 'NODE_ENV', description: '运行环境', required: false },
        { name: 'PORT', description: '服务器端口', required: false },
    ];

    // 检查环境变量
    const { allRequired, results } = checkRequired(envVars);

    // 测试 API 配置
    const apiStatus = testApiConnections();

    // 总结
    header('📊 配置状态总结');

    if (allRequired) {
        log('✅ 所有必需的环境变量都已正确配置', 'green');
    } else {
        log('❌ 缺少一些必需的环境变量', 'red');
        log('请参考 ENVIRONMENT_SETUP.md 获取详细配置指南', 'yellow');
    }

    // App Bridge 特定检查
    header('🌉 App Bridge 配置检查');

    const shopifyApiKey = process.env.SHOPIFY_API_KEY;
    const hasValidApiKey = shopifyApiKey &&
        shopifyApiKey !== 'your_shopify_api_key_here' &&
        shopifyApiKey !== 'dev-api-key' &&
        shopifyApiKey !== '%SHOPIFY_API_KEY%';

    if (hasValidApiKey) {
        log('✅ Shopify API Key 配置正确', 'green');
    } else {
        log('❌ Shopify API Key 无效或缺失', 'red');
        log('请确保在 Shopify Partners 控制台获取正确的 API Key', 'yellow');
    }

    const hostName = process.env.SHOPIFY_HOST_NAME;
    if (hostName && hostName !== 'localhost:3000') {
        log('✅ 生产环境 Host Name 已配置', 'green');
    } else {
        log('⚠️  使用开发环境 Host Name', 'yellow');
    }

    // 建议
    header('💡 配置建议');

    if (!apiStatus.cjConfigured && !apiStatus.pepperjamConfigured) {
        log('⚠️  建议至少配置一个联盟 API (CJ 或 Pepperjam)', 'yellow');
    }

    if (process.env.NODE_ENV === 'production' && process.env.SKIP_IMAGE_VALIDATION === 'true') {
        log('⚠️  生产环境建议设置 SKIP_IMAGE_VALIDATION=false', 'yellow');
    }

    if (process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL === 'debug') {
        log('⚠️  生产环境建议设置 LOG_LEVEL=info', 'yellow');
    }

    // 下一步
    header('🚀 下一步操作');

    if (allRequired && hasValidApiKey) {
        log('🎉 配置完成！您可以启动应用:', 'green');
        log('   npm run dev  # 开发环境', 'cyan');
        log('   npm start    # 生产环境', 'cyan');
    } else {
        log('📋 请完成以下步骤:', 'yellow');
        log('1. 配置缺失的必需环境变量', 'yellow');
        log('2. 从 Shopify Partners 获取正确的 API 凭据', 'yellow');
        log('3. 重新运行此检查脚本验证配置', 'yellow');
        log('4. 参考 ENVIRONMENT_SETUP.md 获取详细指导', 'yellow');
    }

    log('\n');
}

// 运行检查
if (require.main === module) {
    main();
} 