import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { ShopifyService } from '../services/ShopifyService';
import { verifyShopifySession } from './auth';
import { logger } from '../utils/logger';
import { ApiResponse } from '../../shared/types/index';

const router = Router();
const shopifyService = new ShopifyService();

// 应用会话验证中间件到所有路由
router.use(verifyShopifySession);

/**
 * 导入产品到Shopify
 */
router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds)) {
            res.status(400).json({
                success: false,
                error: 'Product IDs array is required'
            });
            return;
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as any[]
        };

        for (const productId of productIds) {
            try {
                // 获取产品信息
                const product = await prisma.product.findUnique({
                    where: { id: productId },
                    include: { brand: true }
                });

                if (!product) {
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Product not found'
                    });
                    continue;
                }

                if (product.importStatus === 'IMPORTED') {
                    logger.info(`Product ${productId} already imported, skipping`);
                    results.success++;
                    continue;
                }

                // 转换为UnifiedProduct格式
                const unifiedProduct = {
                    id: product.id,
                    sourceApi: product.sourceApi.toLowerCase() as 'cj' | 'pepperjam',
                    sourceProductId: product.sourceProductId,
                    brandName: product.brand.name,
                    title: product.title,
                    description: product.description,
                    price: product.price,
                    salePrice: product.salePrice || undefined,
                    currency: product.currency,
                    imageUrl: product.imageUrl,
                    affiliateUrl: product.affiliateUrl,
                    categories: product.categories,
                    availability: product.availability,
                    shopifyProductId: product.shopifyProductId || undefined,
                    importStatus: product.importStatus.toLowerCase() as 'pending' | 'imported' | 'failed',
                    lastUpdated: product.lastUpdated,
                    keywordsMatched: product.keywordsMatched,
                    sku: product.sku || undefined
                };

                // 获取当前会话
                const session = (req as any).shopifySession;

                // 检查是否已存在于Shopify
                let shopifyProduct;
                if (product.shopifyProductId) {
                    // 更新现有产品
                    shopifyProduct = await shopifyService.updateProduct(
                        session,
                        product.shopifyProductId,
                        unifiedProduct
                    );
                } else {
                    // 检查SKU是否已存在
                    const existingProduct = await shopifyService.getProductBySku(session, product.sku!);
                    if (existingProduct) {
                        shopifyProduct = await shopifyService.updateProduct(
                            session,
                            existingProduct.id,
                            unifiedProduct
                        );
                    } else {
                        // 创建新产品
                        shopifyProduct = await shopifyService.createProduct(
                            session,
                            unifiedProduct,
                            'draft'
                        );
                    }
                }

                if (shopifyProduct) {
                    // 创建或获取品牌集合
                    const collectionTitle = `${product.brand.name} - API Products - Draft`;
                    const collection = await shopifyService.getOrCreateCollection(
                        session,
                        collectionTitle,
                        undefined,
                        false,
                        `Automatically synced products for ${product.brand.name} from ${product.sourceApi.toUpperCase()} API.`
                    );

                    // 添加产品到集合
                    if (collection) {
                        await shopifyService.addProductToCollection(
                            session,
                            shopifyProduct.id,
                            collection.id
                        );
                    }

                    // 设置联盟链接元字段
                    await shopifyService.setProductMetafield(
                        session,
                        shopifyProduct.id,
                        'custom',
                        'affiliate_link',
                        product.affiliateUrl,
                        'url'
                    );

                    // 更新数据库中的产品状态
                    await prisma.product.update({
                        where: { id: productId },
                        data: {
                            shopifyProductId: shopifyProduct.id,
                            importStatus: 'IMPORTED',
                            lastUpdated: new Date()
                        }
                    });

                    results.success++;
                    logger.info(`Successfully imported product ${productId} to Shopify (${shopifyProduct.id})`);
                } else {
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Failed to create/update Shopify product'
                    });
                }

            } catch (error) {
                results.failed++;
                results.errors.push({
                    productId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                logger.error(`Error importing product ${productId}:`, error);

                // 标记产品为失败状态
                try {
                    await prisma.product.update({
                        where: { id: productId },
                        data: {
                            importStatus: 'FAILED',
                            lastUpdated: new Date()
                        }
                    });
                } catch (updateError) {
                    logger.error(`Error updating product status for ${productId}:`, updateError);
                }
            }
        }

        res.json({
            success: true,
            data: results,
            message: `Import completed: ${results.success} successful, ${results.failed} failed`
        });

    } catch (error) {
        next(error);
    }
});

/**
 * 同步单个产品状态
 */
router.post('/sync/:productId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params;

        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { brand: true }
        });

        if (!product) {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
            return;
        }

        if (!product.shopifyProductId) {
            res.status(400).json({
                success: false,
                error: 'Product not imported to Shopify yet'
            });
            return;
        }

        // 转换为UnifiedProduct格式
        const unifiedProduct = {
            id: product.id,
            sourceApi: product.sourceApi.toLowerCase() as 'cj' | 'pepperjam',
            sourceProductId: product.sourceProductId,
            brandName: product.brand.name,
            title: product.title,
            description: product.description,
            price: product.price,
            salePrice: product.salePrice || undefined,
            currency: product.currency,
            imageUrl: product.imageUrl,
            affiliateUrl: product.affiliateUrl,
            categories: product.categories,
            availability: product.availability,
            shopifyProductId: product.shopifyProductId,
            importStatus: product.importStatus.toLowerCase() as 'pending' | 'imported' | 'failed',
            lastUpdated: product.lastUpdated,
            keywordsMatched: product.keywordsMatched,
            sku: product.sku || undefined
        };

        // 获取当前会话
        const session = (req as any).shopifySession;

        // 更新Shopify产品
        const shopifyProduct = await shopifyService.updateProduct(
            session,
            product.shopifyProductId,
            unifiedProduct
        );

        if (shopifyProduct) {
            // 更新联盟链接元字段
            await shopifyService.setProductMetafield(
                session,
                product.shopifyProductId,
                'custom',
                'affiliate_link',
                product.affiliateUrl,
                'url'
            );

            // 更新数据库中的最后更新时间
            await prisma.product.update({
                where: { id: productId },
                data: { lastUpdated: new Date() }
            });

            res.json({
                success: true,
                message: 'Product synced successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to sync product'
            });
        }

    } catch (error) {
        next(error);
    }
});

/**
 * 获取Shopify连接状态
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 获取当前会话
        const session = (req as any).shopifySession;
        const isConnected = !!(session && session.accessToken);

        const stats = await prisma.product.groupBy({
            by: ['importStatus'],
            _count: {
                importStatus: true
            }
        });

        const statusCounts = {
            pending: 0,
            imported: 0,
            failed: 0
        };

        stats.forEach(stat => {
            const status = stat.importStatus.toLowerCase() as keyof typeof statusCounts;
            statusCounts[status] = stat._count.importStatus;
        });

        res.json({
            success: true,
            data: {
                connected: isConnected,
                storeName: session?.shop || null,
                productStats: statusCounts,
                lastCheck: new Date().toISOString()
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * 批量设置产品状态（发布/草稿）
 */
router.post('/bulk-status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productIds, status } = req.body;

        if (!productIds || !Array.isArray(productIds)) {
            res.status(400).json({
                success: false,
                error: 'Product IDs array is required'
            });
            return;
        }

        if (!['active', 'draft'].includes(status)) {
            res.status(400).json({
                success: false,
                error: 'Status must be either "active" or "draft"'
            });
            return;
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as any[]
        };

        for (const productId of productIds) {
            try {
                const product = await prisma.product.findUnique({
                    where: { id: productId }
                });

                if (!product || !product.shopifyProductId) {
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Product not found or not imported to Shopify'
                    });
                    continue;
                }

                // 获取当前会话
                const session = (req as any).shopifySession;

                const success = await shopifyService.setProductStatus(
                    session,
                    product.shopifyProductId,
                    status as 'active' | 'draft'
                );

                if (success) {
                    results.success++;
                } else {
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Failed to update product status'
                    });
                }

            } catch (error) {
                results.failed++;
                results.errors.push({
                    productId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        res.json({
            success: true,
            data: results,
            message: `Status update completed: ${results.success} successful, ${results.failed} failed`
        });

    } catch (error) {
        next(error);
    }
});

export default router; 