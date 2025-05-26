import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';

// 导入路由
import productRoutes from './routes/products';
import brandRoutes from './routes/brands';
import importRoutes from './routes/import';
import shopifyRoutes from './routes/shopify';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';

// 导入中间件
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库和Redis
export const prisma = new PrismaClient();
export const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// 中间件
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API 路由
app.use('/api/products', productRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/import', importRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

// 错误处理中间件
app.use(errorHandler);

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

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