# 路径别名配置说明

本项目使用路径别名来简化模块导入，提高代码可读性和维护性。

## 配置的路径别名

| 别名 | 指向目录 | 用途 |
|------|----------|------|
| `@` | `./client` | 客户端代码 |
| `@client/*` | `./client/*` | 客户端代码（显式） |
| `@server/*` | `./server/*` | 服务器端代码 |
| `@shared/*` | `./shared/*` | 共享类型和工具 |

## 配置文件

### 1. TypeScript 配置

#### 根目录 `tsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./client/*"],
      "@server/*": ["./server/*"],
      "@shared/*": ["./shared/*"],
      "@client/*": ["./client/*"]
    }
  }
}
```

#### 服务器端 `server/tsconfig.json`
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"],
      "@server/*": ["./*"]
    }
  }
}
```

### 2. Vite 配置 `vite.config.ts`
```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client'),
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
})
```

### 3. 运行时别名 `package.json`
```json
{
  "_moduleAliases": {
    "@shared": "dist/shared",
    "@server": "dist/server"
  }
}
```

## 使用示例

### 在服务器端代码中
```typescript
// 导入共享类型
import { UnifiedProduct, ApiResponse } from '@shared/types';

// 导入服务器端模块
import { logger } from '@server/utils/logger';
```

### 在客户端代码中
```typescript
// 导入客户端组件
import { ProductCard } from '@/components/ProductCard';

// 导入共享类型
import { UnifiedProduct } from '@shared/types';
```

## 开发环境设置

### 1. 安装依赖
```bash
pnpm install
```

### 2. 验证路径配置
```bash
pnpm run verify-paths
```

### 3. 启动开发服务器
```bash
pnpm run dev
```

## 生产环境构建

### 1. 构建项目
```bash
pnpm run build
```

### 2. 启动生产服务器
```bash
pnpm run start:prod
```

## 故障排除

### 常见问题

1. **模块找不到错误**
   - 检查路径别名配置是否正确
   - 运行 `pnpm run verify-paths` 验证配置

2. **开发环境路径解析失败**
   - 确保安装了 `tsconfig-paths` 依赖
   - 检查 `nodemon.json` 配置

3. **生产环境路径解析失败**
   - 确保安装了 `module-alias` 依赖
   - 检查 `package.json` 中的 `_moduleAliases` 配置
   - 确保构建脚本正确复制了共享文件

### 调试步骤

1. 验证配置：
   ```bash
   pnpm run verify-paths
   ```

2. 检查构建输出：
   ```bash
   ls -la dist/
   ```

3. 检查模块别名注册：
   ```bash
   node -e "require('module-alias/register'); console.log('Module aliases registered');"
   ```

## 文件结构

```
project/
├── client/          # 客户端代码 (@, @client/*)
├── server/          # 服务器端代码 (@server/*)
├── shared/          # 共享代码 (@shared/*)
├── scripts/         # 构建和工具脚本
├── dist/            # 构建输出
│   ├── client/      # 构建后的客户端
│   ├── server/      # 构建后的服务器端
│   └── shared/      # 复制的共享文件
├── tsconfig.json    # 根TypeScript配置
├── vite.config.ts   # Vite配置
└── package.json     # 项目配置
``` 