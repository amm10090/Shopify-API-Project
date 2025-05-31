import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 检测是否在Cloudflare隧道环境中
const isCloudflareEnv = process.env.SHOPIFY_APP_URL?.includes('.trycloudflare.com') ||
    process.env.APPLICATION_URL?.includes('.trycloudflare.com') ||
    process.env.SHOPIFY_APP_URL?.includes('.amoze.cc') ||
    process.env.APPLICATION_URL?.includes('.amoze.cc')

// 获取当前应用的域名
const getAppDomain = () => {
    const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL
    if (appUrl) {
        try {
            return new URL(appUrl).hostname
        } catch (error) {
            console.warn('Invalid APP_URL format:', appUrl)
        }
    }
    return 'localhost'
}

// HMR配置
const getHMRConfig = () => {
    if (isCloudflareEnv) {
        console.log(`🌐 Cloudflare tunnel detected, disabling HMR for stability`)
        // 在Cloudflare隧道环境下完全禁用HMR
        // WebSocket连接在隧道环境下不稳定，会导致连接错误
        return false
    } else {
        console.log('🏠 Local development, using localhost HMR')
        return {
            port: 24678,
            host: 'localhost',
            clientPort: 24678
        }
    }
}

export default defineConfig(({ mode }) => ({
    plugins: [
        react(),
        // 自定义插件处理HTML模板替换
        {
            name: 'shopify-template',
            transformIndexHtml(html, context) {
                // 在所有环境中都保留占位符，让服务器端处理
                return html
            }
        }
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './client'),
            '@shared': path.resolve(__dirname, './shared'),
            '@server': path.resolve(__dirname, './server'),
            '@client': path.resolve(__dirname, './client'),
        },
    },
    server: {
        port: parseInt(process.env.CLIENT_PORT || '5173'),
        host: isCloudflareEnv ? '0.0.0.0' : 'localhost',
        hmr: getHMRConfig(),
        // 在Cloudflare环境下禁用严格端口检查
        strictPort: !isCloudflareEnv,
        allowedHosts: ['shopify.amoze.cc', 'shopifydev.amoze.cc'], // 添加允许的主机
        // 修复MIME类型问题
        middlewareMode: false,
        // 在Cloudflare环境下完全禁用WebSocket
        ws: isCloudflareEnv ? false : undefined,
        proxy: {
            '/api': {
                target: `http://localhost:${process.env.PORT || '3000'}`,
                changeOrigin: true,
                secure: false,
            },
            '/auth': {
                target: `http://localhost:${process.env.PORT || '3000'}`,
                changeOrigin: true,
                secure: false,
            },
        },
    },
    build: {
        outDir: 'dist/client',
        emptyOutDir: true,
        sourcemap: process.env.NODE_ENV !== 'production',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html')
            },
            output: {
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    shopify: ['@shopify/polaris', '@shopify/app-bridge-react']
                }
            }
        }
    },
    define: {
        // 确保环境变量在客户端可用
        'process.env.SHOPIFY_API_KEY': JSON.stringify(process.env.SHOPIFY_API_KEY),
        'process.env.NODE_ENV': JSON.stringify(mode),
        // 确保global可用
        global: 'globalThis',
        // 传递环境信息到客户端
        'process.env.IS_CLOUDFLARE_ENV': JSON.stringify(isCloudflareEnv),
        'process.env.APP_DOMAIN': JSON.stringify(getAppDomain()),
    },
    esbuild: {
        // 在开发模式下使用jsxDev，生产模式下使用jsx
        jsx: mode === 'development' ? 'automatic' : 'automatic',
        jsxDev: mode === 'development',
    },
    optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: ['@shopify/app-bridge-react']
    },
    // CSS配置
    css: {
        modules: {
            localsConvention: 'camelCase'
        }
    },
    // 预览配置（用于生产构建预览）
    preview: {
        port: parseInt(process.env.PREVIEW_PORT || '4173'),
        host: isCloudflareEnv ? '0.0.0.0' : 'localhost'
    }
})) 