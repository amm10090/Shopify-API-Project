import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [
        react(),
        // 自定义插件处理HTML模板替换
        {
            name: 'shopify-template',
            transformIndexHtml(html, context) {
                // 在开发环境中，从URL参数获取这些值
                const url = new URL(context.originalUrl || '/', 'http://localhost:5173')
                const shop = url.searchParams.get('shop') || 'dev-shop.myshopify.com'
                const host = url.searchParams.get('host') || 'localhost:5173'
                const embedded = url.searchParams.get('embedded') !== '0'

                return html
                    .replace('%SHOPIFY_API_KEY%', process.env.SHOPIFY_API_KEY || 'dev-api-key')
                    .replace('%SHOP%', shop)
                    .replace('%HOST%', host)
                    .replace('%EMBEDDED%', embedded.toString())
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
    },
    define: {
        // 确保环境变量在客户端可用
        'process.env.SHOPIFY_API_KEY': JSON.stringify(process.env.SHOPIFY_API_KEY),
    },
}) 