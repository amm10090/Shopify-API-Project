#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 递归处理目录中的所有JS文件
 * @param {string} dir 目录路径
 */
function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            processDirectory(filePath);
        } else if (file.endsWith('.js')) {
            processFile(filePath);
        }
    });
}

/**
 * 处理单个JS文件，替换路径别名
 * @param {string} filePath 文件路径
 */
function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // 替换 @shared 路径
    const sharedRegex = /require\(['"]@shared\/([^'"]+)['"]\)/g;
    if (sharedRegex.test(content)) {
        content = content.replace(sharedRegex, (match, relativePath) => {
            const newPath = path.relative(path.dirname(filePath), path.join(__dirname, '../dist/shared', relativePath));
            return `require('${newPath.replace(/\\/g, '/')}')`;
        });
        modified = true;
    }

    // 替换 import 语句中的 @shared
    const importRegex = /from ['"]@shared\/([^'"]+)['"]/g;
    if (importRegex.test(content)) {
        content = content.replace(importRegex, (match, relativePath) => {
            const newPath = path.relative(path.dirname(filePath), path.join(__dirname, '../dist/shared', relativePath));
            return `from '${newPath.replace(/\\/g, '/')}'`;
        });
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated paths in: ${filePath}`);
    }
}

// 主执行逻辑
const distServerDir = path.join(__dirname, '../dist/server');

if (fs.existsSync(distServerDir)) {
    console.log('Processing compiled server files...');
    processDirectory(distServerDir);
    console.log('Path processing completed.');
} else {
    console.error('dist/server directory not found. Please run build first.');
    process.exit(1);
} 