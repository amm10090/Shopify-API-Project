// Module alias setup for production
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
import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database and Redis
export const prisma = new PrismaClient();
export const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.shopify.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https:"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'"],
            frameAncestors: ["https://*.myshopify.com", "https://admin.shopify.com"],
            upgradeInsecureRequests: null,
        },
    },
    hsts: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
}));

app.use(cors({
    origin: function (origin, callback) {
        // 允许Shopify域名和本地开发
        const allowedOrigins = [
            /\.myshopify\.com$/,
            /^https:\/\/admin\.shopify\.com$/,
            /^http:\/\/localhost:/,
            /^https:\/\/localhost:/
        ];

        if (!origin || allowedOrigins.some(pattern =>
            typeof pattern === 'string' ? origin === pattern : pattern.test(origin)
        )) {
            callback(null, true);
        } else {
            callback(null, true); // 临时允许所有来源
        }
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

// 在生产环境中提供静态文件
if (process.env.NODE_ENV === 'production') {
    // Serve built frontend static files
    app.use(express.static(path.join(__dirname, '../dist/client')));

    // For all non-API routes, return index.html (support frontend routing)
    app.get('*', (req, res) => {
        // 跳过API路由
        if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
            res.status(404).json({
                success: false,
                error: 'Route not found'
            });
            return;
        }

        // Read and process index.html template
        const htmlPath = path.join(__dirname, '../dist/client/index.html');

        try {
            const fs = require('fs');
            let html = fs.readFileSync(htmlPath, 'utf8');

            // 从查询参数获取Shopify必需的参数
            let shop = req.query.shop as string || '';
            const host = req.query.host as string || '';
            const embedded = req.query.embedded !== '0'; // 默认为嵌入式

            // 验证和修正shop参数格式
            if (shop && !shop.includes('.myshopify.com')) {
                const correctedShop = shop.includes('.') ? shop : `${shop}.myshopify.com`;
                logger.info(`Correcting shop parameter from '${shop}' to '${correctedShop}'`);
                shop = correctedShop; // 使用修正后的值
            }

            // 验证host参数（Shopify的host必须是base64编码的）
            let validHost = host;
            if (host) {
                // 检查是否已经是base64编码
                if (!host.match(/^[A-Za-z0-9+/]+=*$/)) {
                    logger.warn(`Host parameter '${host}' doesn't appear to be base64 encoded`);
                    // 不要自动编码，而是记录警告
                    // Shopify应该提供正确编码的host参数
                } else {
                    // 验证base64可以正确解码
                    try {
                        const decoded = Buffer.from(host, 'base64').toString('utf8');
                        logger.debug(`Host parameter decoded: ${decoded}`);
                    } catch (error) {
                        logger.warn(`Host parameter cannot be decoded as base64: ${host}`);
                    }
                }
            } else {
                logger.warn('No host parameter provided - this may cause App Bridge issues');
            }

            // 检查是否有必需的环境变量
            const apiKey = process.env.SHOPIFY_API_KEY || '';
            if (!apiKey) {
                logger.error('SHOPIFY_API_KEY environment variable is not set');
            }

            // 替换模板变量
            html = html.replace('%SHOPIFY_API_KEY%', apiKey);
            html = html.replace('%SHOP%', shop);
            html = html.replace('%HOST%', validHost);
            html = html.replace('%EMBEDDED%', embedded.toString());

            // 注入配置脚本
            const configScript = `
                <script>
                    window.shopifyConfig = {
                        apiKey: '${apiKey}',
                        shop: '${shop}',
                        host: '${validHost}',
                        embedded: ${embedded}
                    };
                    
                    // 调试信息
                    console.log('Server injected config:', window.shopifyConfig);
                    console.log('Request URL:', '${req.url}');
                    console.log('Query params:', ${JSON.stringify(req.query)});
                </script>
            `;

            // 在head标签结束前插入配置脚本
            html = html.replace('</head>', `${configScript}</head>`);

            logger.info(`Serving app with config: shop=${shop}, host=${validHost ? '***' : 'missing'}, embedded=${embedded}, apiKey=${apiKey ? '***' : 'missing'}`);

            res.setHeader('Content-Type', 'text/html');
            res.setHeader('X-Frame-Options', 'ALLOWALL');
            res.send(html);
        } catch (error) {
            logger.error('Error serving index.html:', error);
            res.status(500).send('Internal Server Error');
        }
    });
} else {
    // 开发环境的404处理
    app.get('*', (req, res) => {
        // 跳过API路由
        if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
            res.status(404).json({
                success: false,
                error: 'Route not found'
            });
            return;
        }

        // 在开发环境中，Vite会处理这个路由
        res.status(404).json({
            success: false,
            error: 'Route not found - use Vite dev server for frontend'
        });
    });
}

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
async function startServer() {
    try {
        // 尝试连接Redis（可选）
        try {
            await redis.connect();
            logger.info('Connected to Redis');
        } catch (redisError) {
            logger.warn('Redis connection failed, continuing without Redis:', redisError);
        }

        // 测试数据库连接
        await prisma.$connect();
        logger.info('Connected to database');

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);

            if (process.env.NODE_ENV === 'production') {
                logger.info('Serving static files from dist/client');
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
    await prisma.$disconnect();
    try {
        await redis.disconnect();
    } catch (error) {
        logger.warn('Redis disconnect failed:', error);
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');
    await prisma.$disconnect();
    try {
        await redis.disconnect();
    } catch (error) {
        logger.warn('Redis disconnect failed:', error);
    }
    process.exit(0);
});

startServer(); 