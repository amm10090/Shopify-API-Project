#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, description) {
    log(`🔨 ${description}...`, 'blue');
    try {
        execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
        log(`✅ ${description} 完成`, 'green');
        return true;
    } catch (error) {
        log(`❌ ${description} 失败`, 'red');
        return false;
    }
}

async function main() {
    log('🏗️  Shopify Product Importer - 生产环境构建', 'bright');
    log('='.repeat(50), 'cyan');

    const startTime = Date.now();

    // 1. 清理旧的构建文件
    if (!execCommand('npm run clean', '清理旧的构建文件')) {
        process.exit(1);
    }

    // 2. 生成 Prisma 客户端
    if (!execCommand('npx prisma generate', '生成 Prisma 客户端')) {
        process.exit(1);
    }

    // 3. 类型检查
    log('🔍 执行类型检查...', 'blue');
    if (!execCommand('npm run type-check:server', '服务器端类型检查')) {
        log('⚠️  服务器端类型检查失败，但继续构建...', 'yellow');
    }
    if (!execCommand('npm run type-check:client', '客户端类型检查')) {
        log('⚠️  客户端类型检查失败，但继续构建...', 'yellow');
    }

    // 4. 构建所有 TypeScript 项目（使用项目引用）
    if (!execCommand('npx tsc --build', '构建所有 TypeScript 项目')) {
        process.exit(1);
    }

    // 5. 构建客户端
    if (!execCommand('npm run build:client', '构建客户端')) {
        process.exit(1);
    }

    // 6. 复制必要的文件
    log('📋 复制必要的文件...', 'blue');
    try {
        // 复制 package.json
        const packageJson = require('../package.json');
        const prodPackageJson = {
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            main: 'server/index.js',
            scripts: {
                start: 'node server/index.js'
            },
            dependencies: packageJson.dependencies,
            engines: packageJson.engines,
            _moduleAliases: packageJson._moduleAliases
        };

        fs.writeFileSync(
            path.join(__dirname, '../dist/package.json'),
            JSON.stringify(prodPackageJson, null, 2)
        );

        // 复制 Prisma schema
        if (fs.existsSync(path.join(__dirname, '../prisma'))) {
            execSync('cp -r prisma dist/', { cwd: path.join(__dirname, '..') });
        }

        log('✅ 文件复制完成', 'green');
    } catch (error) {
        log('❌ 文件复制失败', 'red');
        process.exit(1);
    }

    // 7. 显示构建结果
    const endTime = Date.now();
    const buildTime = ((endTime - startTime) / 1000).toFixed(2);

    log('\n' + '='.repeat(50), 'cyan');
    log('🎉 构建完成!', 'bright');
    log(`⏱️  构建时间: ${buildTime}s`, 'yellow');
    log('\n📁 构建输出:', 'bright');
    log('   dist/client/     - 前端静态文件', 'blue');
    log('   dist/server/     - 服务器端代码', 'green');
    log('   dist/shared/     - 共享类型和工具', 'cyan');
    log('\n🚀 启动生产服务器:', 'bright');
    log('   cd dist && npm install --production', 'yellow');
    log('   npm start', 'yellow');
    log('='.repeat(50), 'cyan');
}

main().catch(error => {
    log(`❌ 构建失败: ${error.message}`, 'red');
    process.exit(1);
}); 