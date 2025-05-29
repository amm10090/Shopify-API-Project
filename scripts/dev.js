#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 颜色输出
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
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 检查环境变量
function checkEnvironment() {
    const envFile = path.join(__dirname, '../.env');
    if (!fs.existsSync(envFile)) {
        log('⚠️  .env 文件不存在，请创建并配置必要的环境变量', 'yellow');
        log('参考 .env.example 文件', 'yellow');
    }

    const requiredVars = [
        'DATABASE_URL',
        'SHOPIFY_API_KEY',
        'SHOPIFY_API_SECRET'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
        log(`⚠️  缺少环境变量: ${missingVars.join(', ')}`, 'yellow');
    }
}

// 启动进程
function startProcess(name, command, args, color) {
    log(`🚀 启动 ${name}...`, color);

    const child = spawn(command, args, {
        stdio: 'pipe',
        shell: true,
        cwd: path.join(__dirname, '..'),
        env: { ...process.env }  // 传递环境变量
    });

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
            log(`[${name}] ${line}`, color);
        });
    });

    child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
            log(`[${name}] ${line}`, 'red');
        });
    });

    child.on('close', (code) => {
        if (code !== 0) {
            log(`❌ ${name} 进程退出，代码: ${code}`, 'red');
        }
    });

    return child;
}

// 主函数
async function main() {
    log('🔧 Shopify Product Importer - 开发环境启动', 'bright');
    log('='.repeat(50), 'cyan');

    // 检查环境
    checkEnvironment();

    // 启动数据库生成
    log('📦 生成 Prisma 客户端...', 'blue');
    try {
        const { execSync } = require('child_process');
        execSync('npx prisma generate', { stdio: 'inherit' });
        log('✅ Prisma 客户端生成完成', 'green');
    } catch (error) {
        log('❌ Prisma 客户端生成失败', 'red');
        process.exit(1);
    }

    // 启动各个服务
    const processes = [];

    // 启动后端服务器（现在同时处理前端和后端）
    const serverProcess = startProcess(
        'Server',
        'npx',
        ['tsx', 'watch', 'server/index.ts'],
        'green'
    );
    processes.push(serverProcess);

    // 优雅关闭
    process.on('SIGINT', () => {
        log('\n🛑 正在关闭所有服务...', 'yellow');
        processes.forEach(child => {
            if (child && !child.killed) {
                child.kill('SIGTERM');
            }
        });
        process.exit(0);
    });

    // 显示访问信息
    setTimeout(() => {
        const accessHost = process.env.NODE_ENV === 'production'
            ? (process.env.SERVER_HOST || '69.62.86.176')
            : 'localhost';

        log('\n' + '='.repeat(50), 'cyan');
        log('🌐 服务已启动:', 'bright');
        log(`   统一服务器（前端+后端）: http://${accessHost}:3000`, 'green');
        log('\n💡 使用 Ctrl+C 停止所有服务', 'yellow');
        log('\n📖 注意: 使用 Shopify CLI 隧道访问应用', 'cyan');
        log('='.repeat(50), 'cyan');
    }, 3000);
}

main().catch(error => {
    log(`❌ 启动失败: ${error.message}`, 'red');
    process.exit(1);
}); 