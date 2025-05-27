import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { ApiResponse } from '../../shared/types/index';

const router = Router();

/**
 * 获取仪表板统计数据
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 并行获取所有统计数据
        const [
            totalProducts,
            importedProducts,
            pendingProducts,
            failedProducts,
            totalBrands,
            activeBrands,
            recentImportJobs,
            productsByBrand,
            recentActivity
        ] = await Promise.all([
            // 产品统计
            prisma.product.count(),
            prisma.product.count({ where: { importStatus: 'IMPORTED' } }),
            prisma.product.count({ where: { importStatus: 'PENDING' } }),
            prisma.product.count({ where: { importStatus: 'FAILED' } }),

            // 品牌统计
            prisma.brand.count(),
            prisma.brand.count({ where: { isActive: true } }),

            // 最近导入任务
            prisma.importJob.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时
                    }
                }
            }),

            // 按品牌分组的产品统计
            prisma.product.groupBy({
                by: ['brandId'],
                _count: {
                    id: true
                },
                orderBy: {
                    _count: {
                        id: 'desc'
                    }
                },
                take: 5
            }),

            // 最近活动 - 导入任务
            prisma.importJob.findMany({
                include: {
                    brand: true
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 10
            })
        ]);

        // 计算导入进度
        const importProgress = totalProducts > 0 ? (importedProducts / totalProducts) * 100 : 0;

        // 格式化最近活动
        const formattedActivity = recentActivity.map(job => {
            let action = '';
            let status = 'info';

            switch (job.status) {
                case 'COMPLETED':
                    action = 'Imported Products';
                    status = 'success';
                    break;
                case 'FAILED':
                    action = 'Import Failed';
                    status = 'error';
                    break;
                case 'RUNNING':
                    action = 'Import Running';
                    status = 'info';
                    break;
                default:
                    action = 'Import Task';
                    status = 'info';
            }

            return {
                id: job.id,
                action,
                brand: job.brand.name,
                count: job.productsImported || job.productsFound || 0,
                status,
                time: getRelativeTime(job.createdAt),
                createdAt: job.createdAt
            };
        });

        // 获取品牌名称用于产品统计
        const brandIds = productsByBrand.map(item => item.brandId);
        const brands = await prisma.brand.findMany({
            where: { id: { in: brandIds } },
            select: { id: true, name: true }
        });

        const brandMap = brands.reduce((acc, brand) => {
            acc[brand.id] = brand.name;
            return acc;
        }, {} as Record<string, string>);

        const topBrands = productsByBrand.map(item => ({
            brandId: item.brandId,
            brandName: brandMap[item.brandId] || 'Unknown',
            productCount: item._count.id
        }));

        res.json({
            success: true,
            data: {
                stats: {
                    totalProducts,
                    importedProducts,
                    pendingProducts,
                    failedProducts,
                    totalBrands,
                    activeBrands,
                    recentImports: recentImportJobs,
                    importProgress: Math.round(importProgress)
                },
                topBrands,
                recentActivity: formattedActivity,
                lastUpdated: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error fetching dashboard stats:', error);
        next(error);
    }
});

/**
 * 获取系统健康状态
 */
router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 检查数据库连接
        const dbHealthy = await checkDatabaseHealth();

        // 检查 API 配置
        const apiHealth = checkApiConfiguration();

        // 检查 Shopify 配置
        const shopifyHealth = checkShopifyConfiguration();

        const overallHealth = dbHealthy && apiHealth.cj && apiHealth.pepperjam && shopifyHealth;

        res.json({
            success: true,
            data: {
                overall: overallHealth ? 'healthy' : 'unhealthy',
                database: dbHealthy ? 'connected' : 'disconnected',
                apis: {
                    cj: apiHealth.cj ? 'configured' : 'not_configured',
                    pepperjam: apiHealth.pepperjam ? 'configured' : 'not_configured'
                },
                shopify: shopifyHealth ? 'configured' : 'not_configured',
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error checking system health:', error);
        next(error);
    }
});

/**
 * 获取实时统计数据（轻量级）
 */
router.get('/quick-stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [totalProducts, runningJobs] = await Promise.all([
            prisma.product.count(),
            prisma.importJob.count({ where: { status: 'RUNNING' } })
        ]);

        res.json({
            success: true,
            data: {
                totalProducts,
                runningJobs,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error fetching quick stats:', error);
        next(error);
    }
});

// 辅助函数
function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
        return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
        const hours = Math.floor(diffInSeconds / 3600);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
        const days = Math.floor(diffInSeconds / 86400);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
}

async function checkDatabaseHealth(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch (error) {
        logger.error('Database health check failed:', error);
        return false;
    }
}

function checkApiConfiguration(): { cj: boolean; pepperjam: boolean } {
    return {
        cj: !!(process.env.CJ_API_TOKEN && process.env.BRAND_CID),
        pepperjam: !!process.env.ASCEND_API_KEY
    };
}

function checkShopifyConfiguration(): boolean {
    return !!(
        process.env.SHOPIFY_ACCESS_TOKEN &&
        process.env.SHOPIFY_STORE_NAME
    );
}

export default router; 