import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '../../shared/types/index';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * 获取当前系统设置
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 返回当前环境变量配置状态（不包含敏感信息）
        const settings = {
            cj: {
                configured: !!(process.env.CJ_API_TOKEN && process.env.BRAND_CID),
                companyId: process.env.BRAND_CID ? '***' + process.env.BRAND_CID.slice(-4) : null,
                apiEndpoint: process.env.CJ_API_ENDPOINT || 'https://ads.api.cj.com/query'
            },
            pepperjam: {
                configured: !!process.env.ASCEND_API_KEY,
                apiEndpoint: process.env.PEPPERJAM_API_BASE_URL || 'https://api.pepperjamnetwork.com'
            },
            shopify: {
                configured: !!(process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_STORE_NAME),
                storeName: process.env.SHOPIFY_STORE_NAME || null,
                apiVersion: process.env.SHOPIFY_API_VERSION || '2024-07'
            },
            system: {
                defaultProductLimit: parseInt(process.env.DEFAULT_PRODUCT_LIMIT || '50'),
                skipImageValidation: process.env.SKIP_IMAGE_VALIDATION === 'true',
                logLevel: process.env.LOG_LEVEL || 'info',
                nodeEnv: process.env.NODE_ENV || 'development'
            }
        };

        res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        logger.error('Error fetching settings:', error);
        next(error);
    }
});

/**
 * 保存系统设置
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            cjApiToken,
            cjCompanyId,
            pepperjamApiKey,
            shopifyStoreUrl,
            shopifyAccessToken,
            defaultProductLimit,
            skipImageValidation,
            autoImportEnabled,
            importSchedule,
            emailNotifications,
            notificationEmail
        } = req.body;

        logger.info('Saving system settings', {
            hasCjToken: !!cjApiToken,
            hasCjCompanyId: !!cjCompanyId,
            hasPepperjamKey: !!pepperjamApiKey,
            hasShopifyUrl: !!shopifyStoreUrl,
            hasShopifyToken: !!shopifyAccessToken,
            defaultProductLimit,
            skipImageValidation
        });

        // 读取现有的 .env 文件
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';

        try {
            envContent = fs.readFileSync(envPath, 'utf8');
        } catch (error) {
            logger.warn('No existing .env file found, creating new one');
        }

        // 解析现有的环境变量
        const envVars: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    envVars[key.trim()] = valueParts.join('=').trim();
                }
            }
        });

        // 更新环境变量
        if (cjApiToken) {
            envVars['CJ_API_TOKEN'] = cjApiToken;
            process.env.CJ_API_TOKEN = cjApiToken;
        }
        if (cjCompanyId) {
            envVars['BRAND_CID'] = cjCompanyId;
            process.env.BRAND_CID = cjCompanyId;
        }
        if (pepperjamApiKey) {
            envVars['ASCEND_API_KEY'] = pepperjamApiKey;
            process.env.ASCEND_API_KEY = pepperjamApiKey;
        }
        if (shopifyStoreUrl) {
            envVars['SHOPIFY_STORE_NAME'] = shopifyStoreUrl;
            process.env.SHOPIFY_STORE_NAME = shopifyStoreUrl;
        }
        if (shopifyAccessToken) {
            envVars['SHOPIFY_ACCESS_TOKEN'] = shopifyAccessToken;
            process.env.SHOPIFY_ACCESS_TOKEN = shopifyAccessToken;
        }
        if (defaultProductLimit !== undefined) {
            envVars['DEFAULT_PRODUCT_LIMIT'] = defaultProductLimit.toString();
            process.env.DEFAULT_PRODUCT_LIMIT = defaultProductLimit.toString();
        }
        if (skipImageValidation !== undefined) {
            envVars['SKIP_IMAGE_VALIDATION'] = skipImageValidation.toString();
            process.env.SKIP_IMAGE_VALIDATION = skipImageValidation.toString();
        }

        // 重新构建 .env 文件内容
        const newEnvContent = Object.entries(envVars)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // 写入 .env 文件
        fs.writeFileSync(envPath, newEnvContent);

        logger.info('Settings saved successfully to .env file');

        res.json({
            success: true,
            message: 'Settings saved successfully'
        });

    } catch (error) {
        logger.error('Error saving settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save settings',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * 测试 CJ API 连接
 */
router.post('/test/cj', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { apiToken, companyId } = req.body;

        if (!apiToken || !companyId) {
            res.status(400).json({
                success: false,
                error: 'API Token and Company ID are required'
            });
            return;
        }

        // 测试 CJ API 连接
        const testQuery = `
            {
                products(companyId: "${companyId}", limit: 1) {
                    totalCount
                    count
                }
            }
        `;

        const response = await axios.post(
            process.env.CJ_API_ENDPOINT || 'https://ads.api.cj.com/query',
            { query: testQuery },
            {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.data && !response.data.errors) {
            res.json({
                success: true,
                message: 'CJ API connection successful',
                data: {
                    totalProducts: response.data.data?.products?.totalCount || 0
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'CJ API connection failed',
                details: response.data.errors
            });
        }

    } catch (error) {
        logger.error('CJ API test failed:', error);
        res.status(500).json({
            success: false,
            error: 'CJ API connection test failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * 测试 Pepperjam API 连接
 */
router.post('/test/pepperjam', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { apiKey } = req.body;

        if (!apiKey) {
            res.status(400).json({
                success: false,
                error: 'API Key is required'
            });
            return;
        }

        // 测试 Pepperjam API 连接
        const response = await axios.get(
            `${process.env.PEPPERJAM_API_BASE_URL || 'https://api.pepperjamnetwork.com'}/20120402/publisher/creative/product`,
            {
                params: {
                    apiKey: apiKey,
                    format: 'json',
                    page: 1,
                    limit: 1
                },
                timeout: 10000
            }
        );

        if (response.data && response.data.meta?.status?.code === 200) {
            res.json({
                success: true,
                message: 'Pepperjam API connection successful',
                data: {
                    totalResults: response.data.meta?.pagination?.total_results || 0
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Pepperjam API connection failed',
                details: response.data.meta?.status?.message || 'Unknown error'
            });
        }

    } catch (error) {
        logger.error('Pepperjam API test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Pepperjam API connection test failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * 测试 Shopify 连接
 */
router.post('/test/shopify', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { accessToken, storeName } = req.body;

        if (!accessToken || !storeName) {
            res.status(400).json({
                success: false,
                error: 'Access Token and Store Name are required'
            });
            return;
        }

        // 清理 store name
        const cleanStoreName = storeName.replace(/\.myshopify\.com$/, '');
        const shopUrl = `https://${cleanStoreName}.myshopify.com`;

        // 测试 Shopify API 连接
        const response = await axios.get(
            `${shopUrl}/admin/api/2024-07/shop.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (response.data && response.data.shop) {
            res.json({
                success: true,
                message: 'Shopify connection successful',
                data: {
                    shopName: response.data.shop.name,
                    shopId: response.data.shop.id,
                    domain: response.data.shop.domain
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Shopify connection failed'
            });
        }

    } catch (error) {
        logger.error('Shopify API test failed:', error);

        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            const message = error.response?.data?.errors || error.message;

            res.status(status || 500).json({
                success: false,
                error: 'Shopify connection test failed',
                details: message
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Shopify connection test failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
});

/**
 * 获取系统状态
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 检查各个系统组件的状态
        const status = {
            database: 'unknown',
            cj: 'unknown',
            pepperjam: 'unknown',
            shopify: 'unknown',
            lastCheck: new Date().toISOString()
        };

        // 检查数据库连接
        try {
            const { prisma } = require('../index');
            await prisma.$queryRaw`SELECT 1`;
            status.database = 'connected';
        } catch (error) {
            status.database = 'disconnected';
        }

        // 检查 API 配置
        status.cj = (process.env.CJ_API_TOKEN && process.env.BRAND_CID) ? 'configured' : 'not_configured';
        status.pepperjam = process.env.ASCEND_API_KEY ? 'configured' : 'not_configured';
        status.shopify = (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_STORE_NAME) ? 'configured' : 'not_configured';

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        logger.error('Error checking system status:', error);
        next(error);
    }
});

/**
 * 获取系统信息
 */
router.get('/info', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const info = {
            version: process.env.npm_package_version || '1.0.0',
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            platform: process.platform,
            arch: process.arch
        };

        res.json({
            success: true,
            data: info
        });

    } catch (error) {
        logger.error('Error fetching system info:', error);
        next(error);
    }
});

export default router; 