import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

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
        },
    },
    server: {
        port: 5173,
        host: '0.0.0.0',
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/auth': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist/client',
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html')
            }
        }
    },
    define: {
        // 确保环境变量在客户端可用
        'process.env.SHOPIFY_API_KEY': JSON.stringify(process.env.SHOPIFY_API_KEY),
        'process.env.NODE_ENV': JSON.stringify(mode),
        // 确保global可用
        global: 'globalThis',
    },
    esbuild: {
        // 在开发模式下使用jsxDev，生产模式下使用jsx
        jsx: mode === 'development' ? 'automatic' : 'automatic',
        jsxDev: mode === 'development',
    },
})) 