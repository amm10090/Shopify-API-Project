import path from 'path';

// 获取项目根目录
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

// 定义路径别名映射
export const PATH_ALIASES = {
    '@shared': path.join(PROJECT_ROOT, 'shared'),
    '@server': path.join(PROJECT_ROOT, 'server'),
    '@client': path.join(PROJECT_ROOT, 'client'),
    '@': path.join(PROJECT_ROOT, 'client'),
};

/**
 * 解析路径别名
 * @param importPath 导入路径
 * @returns 解析后的绝对路径
 */
export function resolveAlias(importPath: string): string {
    for (const [alias, realPath] of Object.entries(PATH_ALIASES)) {
        if (importPath.startsWith(alias)) {
            return importPath.replace(alias, realPath);
        }
    }
    return importPath;
}

/**
 * 检查路径是否使用了别名
 * @param importPath 导入路径
 * @returns 是否使用了别名
 */
export function isAliasPath(importPath: string): boolean {
    return Object.keys(PATH_ALIASES).some(alias => importPath.startsWith(alias));
} 