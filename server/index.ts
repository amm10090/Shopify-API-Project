// Module alias setup for production
// 确保环境变量最先加载
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

if (process.env.NODE_ENV === 'production') {
    try {
        require('module-alias/register');
    } catch (error: any) {
        console.warn('Module-alias not available, continuing without aliases:', error?.message || error);
    }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

// Import routes
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import brandRoutes from './routes/brands';
import importRoutes from './routes/import';
import shopifyRoutes from './routes/shopify';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import webhookRoutes from './routes/webhooks';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Environment variables already loaded at the top

const app = express();
// 强制使用3000端口，忽略Shopify CLI的随机端口分配
const PORT = 3000;

// Initialize database
export const prisma = new PrismaClient();

// 全局变量存储 Vite 开发服务器
let viteDevServer: any = null;

// 异步初始化 Vite 开发服务器
async function initializeVite() {
    if (process.env.NODE_ENV !== 'production') {
        try {
            const { createServer } = await import('vite');
            viteDevServer = await createServer({
                server: {
                    middlewareMode: true,
                    hmr: {
                        port: 24678, // 使用不同的端口避免冲突
                    }
                },
                appType: 'custom',
                root: path.join(__dirname, '..'),
                configFile: path.join(__dirname, '../vite.config.ts'),
                optimizeDeps: {
                    exclude: ['@shopify/app-bridge-react']
                },
                // 覆盖配置文件中的某些设置
                define: {
                    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
                    global: 'globalThis',
                }
            });

            logger.info('Vite development server initialized');
        } catch (error) {
            logger.warn('Failed to initialize Vite dev server:', error);
        }
    }
}

// Middleware - 更宽松的安全策略以支持 Shopify App Bridge
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'", "https:", "wss:", "ws:"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.shopify.com", "https://*.shopifycloud.com", "https:"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://cdn.shopify.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https:", "wss:", "ws:", "https://*.shopifycloud.com", "https://*.shopify.com"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "https:"],
            frameSrc: ["'self'", "https://*.myshopify.com", "https://admin.shopify.com", "https:"],
            frameAncestors: ["https://*.myshopify.com", "https://admin.shopify.com", "'self'"],
            upgradeInsecureRequests: null,
        },
    },
    hsts: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
    // 允许在 iframe 中嵌入 - 完全禁用 frameguard
    frameguard: false,
}));

// 添加动态CSP中间件以支持Shopify iframe嵌入
app.use((req, res, next) => {
    const shop = req.query.shop as string;
    const host = req.query.host as string;

    // 使用自定义域名
    const applicationUrl = process.env.SHOPIFY_APP_URL ||
        process.env.APPLICATION_URL ||
        'https://shopify.amoze.cc';
    const tunnelDomain = new URL(applicationUrl).hostname;

    if (shop) {
        // 验证shop格式
        const sanitizedShop = shop.replace(/[^a-zA-Z0-9\-\.]/g, '');
        const shopDomain = sanitizedShop.includes('.myshopify.com') ? sanitizedShop : `${sanitizedShop}.myshopify.com`;

        // 设置允许特定shop的frame-ancestors
        res.setHeader(
            'Content-Security-Policy',
            `frame-ancestors https://${shopDomain} https://admin.shopify.com https://*.shopify.com https://${tunnelDomain};`
        );

        // 完全移除X-Frame-Options，让CSP frame-ancestors控制
        res.removeHeader('X-Frame-Options');

        logger.info(`Set CSP frame-ancestors for shop: ${shopDomain}, tunnel: ${tunnelDomain}`);
    } else {
        // 如果没有shop参数，设置宽松的策略用于开发
        res.setHeader(
            'Content-Security-Policy',
            `frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com https://${tunnelDomain} 'self';`
        );
        res.removeHeader('X-Frame-Options');
    }

    next();
});

// CORS configuration
app.use(cors({
    origin: (origin, callback) => {
        // 开发环境允许所有来源
        if (process.env.NODE_ENV === 'development') {
            callback(null, true);
            return;
        }

        // 获取应用URL中的域名
        const applicationUrl = process.env.SHOPIFY_APP_URL ||
            process.env.APPLICATION_URL ||
            'https://dock-malawi-fu-cocktail.trycloudflare.com'; // 更新为当前URL
        const tunnelDomain = new URL(applicationUrl).hostname;

        // 允许的域名模式
        const allowedOrigins = [
            /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/,
            /^https:\/\/admin\.shopify\.com$/,
            /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.ngrok\.io$/,
            /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.trycloudflare\.com$/,
            /^https:\/\/localhost:\d+$/,
            /^http:\/\/localhost:\d+$/,
            new RegExp(`^https://${tunnelDomain.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`),
        ];

        if (!origin || allowedOrigins.some(pattern => pattern.test(origin))) {
            callback(null, true);
        } else {
            logger.warn(`CORS rejected origin: ${origin}`);
            // 在生产环境中更严格一些，但仍然允许Shopify相关域名
            callback(null, true); // 可以根据需要改为 callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
    // 添加预检请求支持
    optionsSuccessStatus: 200,
    // 允许的headers
    allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-Shopify-Topic',
        'X-Shopify-Hmac-Sha256',
        'X-Shopify-Shop-Domain',
        'X-Frame-Options'
    ]
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 添加请求超时处理，防止Cloudflare 524错误
app.use((req, res, next) => {
    // 设置服务器响应超时为90秒（Cloudflare默认100秒）
    req.setTimeout(90000, () => {
        logger.warn(`Request timeout for ${req.method} ${req.path}`);
        if (!res.headersSent) {
            res.status(408).json({
                success: false,
                error: 'Request timeout'
            });
        }
    });

    res.setTimeout(90000, () => {
        logger.warn(`Response timeout for ${req.method} ${req.path}`);
        if (!res.headersSent) {
            res.status(408).end();
        }
    });

    next();
});

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API 路由
app.use('/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/import', importRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhookRoutes);

// 注意：静态文件服务现在在 startServer 函数中设置

// 注意：通配符路由也移到了 startServer 函数中，在静态文件服务设置之后

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
async function startServer() {
    try {
        // 首先初始化 Vite（如果在开发模式）
        await initializeVite();

        // 设置静态文件服务（在 Vite 初始化后，但在服务器启动前）
        if (viteDevServer) {
            // 使用 Vite 中间件处理所有静态资源请求
            app.use(viteDevServer.middlewares);
            logger.info('Using Vite development server for static files');
        } else {
            // 生产模式或 Vite 不可用时的静态文件服务
            const distPath = path.join(__dirname, '../dist/client');
            if (fs.existsSync(distPath)) {
                app.use(express.static(distPath, { index: false }));
                logger.info('Serving static files from dist/client');
            } else {
                app.use(express.static(path.join(__dirname, '../'), { index: false }));
                logger.info('Serving static files from project root');
            }
        }

        // 设置通配符路由（在静态文件服务之后）
        app.get('*', async (req, res) => {
            // 检查嵌入应用重定向逻辑
            const shop = req.query.shop as string;
            const host = req.query.host as string;
            const embedded = req.query.embedded !== '0';

            // 如果这是一个嵌入应用请求但没有embedded参数，需要重定向
            if (shop && embedded && !req.query.embedded) {
                const applicationUrl = process.env.SHOPIFY_APP_URL ||
                    process.env.APPLICATION_URL ||
                    'https://dock-malawi-fu-cocktail.trycloudflare.com'; // 更新为当前URL
                const embeddedUrl = `https://admin.shopify.com/store/${shop.replace('.myshopify.com', '')}/apps/${process.env.SHOPIFY_API_KEY || '22c17ecd1ecf677dc1c78552e650bd34'}`;

                logger.info(`Redirecting to embedded app URL: ${embeddedUrl}`);
                return res.redirect(embeddedUrl);
            }

            // 跳过API路由和所有静态资源
            if (req.path.startsWith('/api') ||
                req.path.startsWith('/auth') ||
                req.path.startsWith('/webhooks') ||
                req.path.startsWith('/@') ||  // Vite特殊路径 (@vite/client, @react-refresh等)
                req.path.startsWith('/node_modules') ||
                req.path.startsWith('/client/') ||  // 源文件路径
                req.path.startsWith('/src/') ||    // 源代码目录
                req.path.endsWith('.js') ||        // 改为endsWith以更精确匹配
                req.path.endsWith('.ts') ||
                req.path.endsWith('.tsx') ||
                req.path.endsWith('.jsx') ||
                req.path.endsWith('.css') ||
                req.path.endsWith('.scss') ||
                req.path.endsWith('.less') ||
                req.path.endsWith('.svg') ||
                req.path.endsWith('.png') ||
                req.path.endsWith('.jpg') ||
                req.path.endsWith('.jpeg') ||
                req.path.endsWith('.gif') ||
                req.path.endsWith('.ico') ||
                req.path.endsWith('.woff') ||
                req.path.endsWith('.woff2') ||
                req.path.endsWith('.ttf') ||
                req.path.endsWith('.eot') ||
                req.path.endsWith('.map')) {        // Source maps

                // 如果这是一个静态资源但我们到了这里，说明资源不存在
                logger.warn(`Static resource not found: ${req.path}`);
                res.status(404).json({
                    success: false,
                    error: 'Resource not found'
                });
                return;
            }

            try {
                let html: string;

                // 在开发模式下使用 Vite 处理 HTML
                if (viteDevServer) {
                    const template = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
                    html = await viteDevServer.transformIndexHtml(req.originalUrl, template);
                } else {
                    // 生产模式下直接读取文件
                    const distPath = path.join(__dirname, '../dist/client');
                    const indexPath = fs.existsSync(path.join(distPath, 'index.html')) ?
                        path.join(distPath, 'index.html') :
                        path.join(__dirname, '../index.html');
                    html = fs.readFileSync(indexPath, 'utf8');
                }

                // 从查询参数获取Shopify必需的参数
                let shop = req.query.shop as string || '';
                const shopifyHost = req.query.host as string || '';
                const embedded = req.query.embedded !== '0'; // 默认为嵌入式

                // 检查是否有必需的环境变量
                const apiKey = process.env.SHOPIFY_API_KEY || '';
                let appType = process.env.SHOPIFY_APP_TYPE || 'custom';

                // 对于自定义应用，如果没有shop参数，使用环境变量中的默认值
                if (!shop && appType === 'custom') {
                    shop = process.env.SHOPIFY_STORE_NAME || 'amm10090.myshopify.com';
                    logger.info(`Using default shop for custom app: ${shop}`);
                }

                // 如果是直接访问localhost且没有shop参数，强制设为自定义应用模式
                if (req.hostname === 'localhost' && !shop && !req.query.shop) {
                    appType = 'custom';
                    shop = process.env.SHOPIFY_STORE_NAME || 'amm10090.myshopify.com';
                    logger.info(`Localhost access detected - forcing custom app mode with shop: ${shop}`);
                }

                // 验证和修正shop参数格式
                if (shop && !shop.includes('.myshopify.com')) {
                    const correctedShop = shop.includes('.') ? shop : `${shop}.myshopify.com`;
                    logger.info(`Correcting shop parameter from '${shop}' to '${correctedShop}'`);
                    shop = correctedShop; // 使用修正后的值
                }

                // 验证host参数（Shopify的host必须是base64编码的）
                let validHost = shopifyHost;

                // 为自定义应用生成有效的 host 参数
                if (appType === 'custom' && shop && !validHost) {
                    validHost = Buffer.from(`${shop}/admin`).toString('base64');
                    logger.info(`Generated host parameter for custom app: ${validHost}`);
                }
                if (shopifyHost) {
                    // 检查是否已经是base64编码
                    if (!shopifyHost.match(/^[A-Za-z0-9+/]+=*$/)) {
                        logger.warn(`Host parameter '${shopifyHost}' doesn't appear to be base64 encoded`);
                        // 不要自动编码，而是记录警告
                        // Shopify应该提供正确编码的host参数
                    } else {
                        // 验证base64可以正确解码
                        try {
                            const decoded = Buffer.from(shopifyHost, 'base64').toString('utf8');
                            logger.debug(`Host parameter decoded: ${decoded}`);
                        } catch (error) {
                            logger.warn(`Host parameter cannot be decoded as base64: ${shopifyHost}`);
                        }
                    }
                } else {
                    logger.warn('No host parameter provided - this may cause App Bridge issues');
                }

                // 对于自定义应用，不需要严格的 API Key 验证
                if (appType !== 'custom' && !apiKey) {
                    logger.error('SHOPIFY_API_KEY environment variable is not set');
                }

                // 替换模板变量 - 使用全局替换
                html = html.replace(/%SHOPIFY_API_KEY%/g, apiKey);
                html = html.replace(/%SHOP%/g, shop);
                html = html.replace(/%HOST%/g, validHost);
                html = html.replace(/%EMBEDDED%/g, embedded.toString());

                // 注入配置脚本
                const configScript = `
                    <script>
                        window.shopifyConfig = {
                            apiKey: '${apiKey}',
                            shop: '${shop}',
                            host: '${validHost}',
                            embedded: ${embedded},
                            appType: '${appType}',
                            isCustomApp: ${appType === 'custom'},
                            skipAppBridge: ${appType === 'custom'}
                        };
                        
                        // 调试信息
                        console.log('Server injected config:', window.shopifyConfig);
                        console.log('Request URL:', '${req.url}');
                        console.log('Query params:', ${JSON.stringify(req.query)});
                        console.log('App type detected:', '${appType}');
                        console.log('Is custom app:', ${appType === 'custom'});
                    </script>
                `;

                // 在head标签结束前插入配置脚本
                html = html.replace('</head>', `${configScript}</head>`);

                logger.info(`Serving app with config: shop=${shop}, host=${validHost ? '***' : 'missing'}, embedded=${embedded}, apiKey=${apiKey ? '***' : 'missing'}`);

                res.setHeader('Content-Type', 'text/html');
                res.send(html);
            } catch (error) {
                logger.error('Error serving index.html:', error);
                res.status(500).send('Internal Server Error');
            }
        });

        // 测试数据库连接
        await prisma.$connect();
        logger.info('Connected to database');

        app.listen(PORT, '0.0.0.0', () => {
            const host = process.env.NODE_ENV === 'production'
                ? process.env.SERVER_HOST || '69.62.86.176'
                : 'localhost';

            logger.info(`Server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`Access URL: http://${host}:${PORT}`);

            if (process.env.NODE_ENV === 'production') {
                logger.info('Serving static files from dist/client');
            } else if (viteDevServer) {
                logger.info('Using Vite development server for static files');
            } else {
                logger.info('Serving static files from project root');
            }
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    if (viteDevServer) {
        await viteDevServer.close();
    }
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');
    if (viteDevServer) {
        await viteDevServer.close();
    }
    await prisma.$disconnect();
    process.exit(0);
});

startServer(); 