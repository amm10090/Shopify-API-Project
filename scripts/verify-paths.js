#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 验证路径别名配置
 */
function verifyPathAliases() {
    console.log('🔍 验证路径别名配置...\n');

    const projectRoot = path.resolve(__dirname, '..');
    const errors = [];
    const warnings = [];

    // 检查目录结构
    const requiredDirs = [
        'client',
        'server',
        'shared',
        'scripts'
    ];

    console.log('📁 检查目录结构:');
    requiredDirs.forEach(dir => {
        const dirPath = path.join(projectRoot, dir);
        if (fs.existsSync(dirPath)) {
            console.log(`  ✅ ${dir}/`);
        } else {
            console.log(`  ❌ ${dir}/ (缺失)`);
            errors.push(`目录 ${dir}/ 不存在`);
        }
    });

    // 检查TypeScript配置文件
    console.log('\n📄 检查TypeScript配置:');

    // 根目录tsconfig.json
    const rootTsConfig = path.join(projectRoot, 'tsconfig.json');
    if (fs.existsSync(rootTsConfig)) {
        console.log('  ✅ tsconfig.json');
        try {
            const config = JSON.parse(fs.readFileSync(rootTsConfig, 'utf8'));
            const paths = config.compilerOptions?.paths;
            if (paths) {
                console.log('    路径别名:');
                Object.entries(paths).forEach(([alias, targets]) => {
                    console.log(`      ${alias} -> ${targets.join(', ')}`);
                });
            }
        } catch (e) {
            errors.push('根目录 tsconfig.json 格式错误');
        }
    } else {
        errors.push('根目录 tsconfig.json 不存在');
    }

    // 服务器tsconfig.json
    const serverTsConfig = path.join(projectRoot, 'server/tsconfig.json');
    if (fs.existsSync(serverTsConfig)) {
        console.log('  ✅ server/tsconfig.json');
        try {
            const config = JSON.parse(fs.readFileSync(serverTsConfig, 'utf8'));
            const paths = config.compilerOptions?.paths;
            if (paths) {
                console.log('    路径别名:');
                Object.entries(paths).forEach(([alias, targets]) => {
                    console.log(`      ${alias} -> ${targets.join(', ')}`);
                });
            }
        } catch (e) {
            errors.push('server/tsconfig.json 格式错误');
        }
    } else {
        errors.push('server/tsconfig.json 不存在');
    }

    // 检查Vite配置
    console.log('\n⚡ 检查Vite配置:');
    const viteConfig = path.join(projectRoot, 'vite.config.ts');
    if (fs.existsSync(viteConfig)) {
        console.log('  ✅ vite.config.ts');
        const content = fs.readFileSync(viteConfig, 'utf8');
        if (content.includes('@shared')) {
            console.log('    ✅ 包含 @shared 别名');
        } else {
            warnings.push('vite.config.ts 中缺少 @shared 别名');
        }
    } else {
        errors.push('vite.config.ts 不存在');
    }

    // 检查package.json配置
    console.log('\n📦 检查package.json配置:');
    const packageJson = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJson)) {
        console.log('  ✅ package.json');
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));

            // 检查module-alias配置
            if (pkg._moduleAliases) {
                console.log('    ✅ _moduleAliases 配置存在');
                Object.entries(pkg._moduleAliases).forEach(([alias, target]) => {
                    console.log(`      ${alias} -> ${target}`);
                });
            } else {
                warnings.push('package.json 中缺少 _moduleAliases 配置');
            }

            // 检查依赖
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const requiredDeps = ['module-alias', 'tsconfig-paths'];
            requiredDeps.forEach(dep => {
                if (deps[dep]) {
                    console.log(`    ✅ ${dep} 依赖存在`);
                } else {
                    warnings.push(`缺少 ${dep} 依赖`);
                }
            });

        } catch (e) {
            errors.push('package.json 格式错误');
        }
    } else {
        errors.push('package.json 不存在');
    }

    // 输出结果
    console.log('\n📊 验证结果:');
    if (errors.length === 0 && warnings.length === 0) {
        console.log('  🎉 所有路径别名配置正确！');
        return true;
    } else {
        if (errors.length > 0) {
            console.log('\n❌ 错误:');
            errors.forEach(error => console.log(`  - ${error}`));
        }
        if (warnings.length > 0) {
            console.log('\n⚠️  警告:');
            warnings.forEach(warning => console.log(`  - ${warning}`));
        }
        return false;
    }
}

// 运行验证
if (require.main === module) {
    const success = verifyPathAliases();
    process.exit(success ? 0 : 1);
}

module.exports = { verifyPathAliases }; 