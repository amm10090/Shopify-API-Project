import { Router, Request, Response, NextFunction } from 'express';
import { Session } from '@shopify/shopify-api';
import { prisma } from '@server/index';
import { ShopifyService } from '@server/services/ShopifyService';
import { verifyShopifySession } from '@server/routes/auth';
import { logger } from '@server/utils/logger';
import { ApiResponse } from '@shared/types/index';
import { CustomAppService } from '@server/services/CustomAppService';
import { ProductRetriever } from '@server/services/ProductRetriever';
import { UnifiedProduct } from '@shared/types/index';

const router = Router();
const shopifyService = new ShopifyService();

// 应用会话验证中间件到所有路由
router.use(verifyShopifySession);

/**
 * 导入产品到Shopify
 */
router.post('/import', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productIds, useProductSetSync = false } = req.body;

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

        // 获取当前会话
        const session = (req as any).shopifySession;

        // 验证session
        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found. Please authenticate first.'
            });
            return;
        }

        if (!session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'Session access token is missing. Please re-authenticate.'
            });
            return;
        }

        logger.info(`Starting bulk import for shop: ${session.shop}, products: ${productIds.length}, useProductSetSync: ${useProductSetSync}`);

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

                // 使用productSet同步方法或标准方法导入产品
                let shopifyProduct;
                if (useProductSetSync) {
                    // 使用新的产品模型的productSet同步方法
                    shopifyProduct = await shopifyService.syncProductWithProductSet(
                        session,
                        unifiedProduct,
                        'draft'
                    );
                } else {
                    // 检查是否已存在于Shopify
                    if (product.shopifyProductId) {
                        // 更新现有产品
                        shopifyProduct = await shopifyService.updateProduct(
                            session,
                            product.shopifyProductId,
                            unifiedProduct
                        );
                    } else {
                        // 检查SKU是否已存在 - 智能选择API类型
                        const existingProduct = await shopifyService.getProductBySku(session, product.sku!);
                        if (existingProduct) {
                            shopifyProduct = await shopifyService.updateProduct(
                                session,
                                existingProduct.id,
                                unifiedProduct
                            );
                        } else {
                            // 创建新产品 - 智能选择API类型
                            shopifyProduct = await shopifyService.createProduct(
                                session,
                                unifiedProduct,
                                'draft'
                            );
                        }
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
                            String(shopifyProduct.id),
                            String(collection.id)
                        );
                    }

                    // 设置联盟链接元字段（如果还没有设置）
                    if (!useProductSetSync) {
                        await shopifyService.setProductMetafield(
                            session,
                            String(shopifyProduct.id),
                            'custom',
                            'affiliate_link',
                            product.affiliateUrl,
                            'url'
                        );
                    }

                    // 更新数据库中的产品状态
                    await prisma.product.update({
                        where: { id: productId },
                        data: {
                            shopifyProductId: String(shopifyProduct.id),
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

        // 获取当前会话
        const session = (req as any).shopifySession;

        // 验证session
        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found. Please authenticate first.'
            });
            return;
        }

        if (!session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'Session access token is missing. Please re-authenticate.'
            });
            return;
        }

        logger.info(`Syncing product ${productId} for shop: ${session.shop}`);

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
                String(shopifyProduct.id),
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

/**
 * 更新已导入的商品
 * POST /api/shopify/update
 */
router.post('/update', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Product IDs are required and must be an array'
            });
            return;
        }

        logger.info(`Starting product update for ${productIds.length} products`);

        // 获取当前会话
        const session = (req as any).shopifySession;

        // 验证session
        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found. Please authenticate first.'
            });
            return;
        }

        if (!session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'Session access token is missing. Please re-authenticate.'
            });
            return;
        }

        const results = {
            success: 0,
            failed: 0,
            noChanges: 0,
            errors: [] as Array<{ productId: string; error: string }>
        };

        const productRetriever = new ProductRetriever();

        for (const productId of productIds) {
            try {
                logger.info(`Processing update for product: ${productId}`);

                // 从数据库获取产品信息
                const existingProduct = await prisma.product.findUnique({
                    where: { id: productId },
                    include: { brand: true }
                });

                if (!existingProduct) {
                    logger.warn(`Product ${productId} not found in database`);
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Product not found in database'
                    });
                    continue;
                }

                if (existingProduct.importStatus !== 'IMPORTED') {
                    logger.warn(`Product ${productId} is not imported, skipping update`);
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Product is not imported to Shopify'
                    });
                    continue;
                }

                if (!existingProduct.brand) {
                    logger.warn(`Product ${productId} has no associated brand`);
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'Product has no associated brand'
                    });
                    continue;
                }

                logger.info(`Searching for updated product data using title: "${existingProduct.title}"`);

                // 使用商品标题作为关键词搜索最新的产品信息
                let updatedProducts: UnifiedProduct[] = [];

                if (existingProduct.brand.apiType === 'CJ') {
                    updatedProducts = await productRetriever.fetchCJProducts({
                        advertiserId: existingProduct.brand.apiId,
                        keywords: [existingProduct.title],
                        limit: 10
                    });
                } else if (existingProduct.brand.apiType === 'PEPPERJAM') {
                    updatedProducts = await productRetriever.fetchPepperjamProducts({
                        programId: existingProduct.brand.apiId,
                        keywords: [existingProduct.title],
                        limit: 10
                    });
                }

                // 找到最匹配的产品（通过源产品ID或标题相似度）
                let matchedProduct = updatedProducts.find(p =>
                    p.sourceProductId === existingProduct.sourceProductId
                );

                if (!matchedProduct) {
                    // 如果没有通过ID匹配，尝试通过标题匹配
                    matchedProduct = updatedProducts.find(p =>
                        p.title.toLowerCase().includes(existingProduct.title.toLowerCase()) ||
                        existingProduct.title.toLowerCase().includes(p.title.toLowerCase())
                    );
                }

                if (!matchedProduct) {
                    logger.warn(`No updated product found for: ${existingProduct.title}`);
                    results.failed++;
                    results.errors.push({
                        productId,
                        error: 'No updated product data found'
                    });
                    continue;
                }

                // 比较产品数据，检查是否有变化
                const hasChanges = (
                    existingProduct.title !== matchedProduct.title ||
                    existingProduct.description !== matchedProduct.description ||
                    existingProduct.price !== matchedProduct.price ||
                    existingProduct.salePrice !== matchedProduct.salePrice ||
                    existingProduct.imageUrl !== matchedProduct.imageUrl ||
                    existingProduct.availability !== matchedProduct.availability
                );

                if (!hasChanges) {
                    logger.info(`No changes detected for product: ${existingProduct.title}`);
                    results.noChanges++;
                    continue;
                }

                logger.info(`Changes detected for product: ${existingProduct.title}, updating...`);

                // 更新数据库中的产品信息
                await prisma.product.update({
                    where: { id: productId },
                    data: {
                        title: matchedProduct.title,
                        description: matchedProduct.description,
                        price: matchedProduct.price,
                        salePrice: matchedProduct.salePrice,
                        imageUrl: matchedProduct.imageUrl,
                        availability: matchedProduct.availability,
                        categories: matchedProduct.categories,
                        lastUpdated: new Date()
                    }
                });

                // 如果有Shopify产品ID，更新Shopify中的产品
                if (existingProduct.shopifyProductId) {
                    try {
                        // 转换为UnifiedProduct格式
                        const unifiedProduct = {
                            id: existingProduct.id,
                            sourceApi: existingProduct.sourceApi.toLowerCase() as 'cj' | 'pepperjam',
                            sourceProductId: existingProduct.sourceProductId,
                            brandName: existingProduct.brand.name,
                            title: matchedProduct.title,
                            description: matchedProduct.description,
                            price: matchedProduct.price,
                            salePrice: matchedProduct.salePrice || undefined,
                            currency: existingProduct.currency,
                            imageUrl: matchedProduct.imageUrl,
                            affiliateUrl: existingProduct.affiliateUrl,
                            categories: matchedProduct.categories,
                            availability: matchedProduct.availability,
                            shopifyProductId: existingProduct.shopifyProductId || undefined,
                            importStatus: 'imported' as const,
                            lastUpdated: new Date(),
                            keywordsMatched: existingProduct.keywordsMatched,
                            sku: existingProduct.sku || undefined
                        };

                        await shopifyService.updateProduct(session, existingProduct.shopifyProductId, unifiedProduct);
                        logger.info(`Successfully updated Shopify product: ${existingProduct.shopifyProductId}`);
                    } catch (shopifyError: any) {
                        // 检查是否是产品不存在的错误
                        if (shopifyError.code === 'PRODUCT_NOT_FOUND') {
                            logger.warn(`Shopify product ${existingProduct.shopifyProductId} not found, clearing from database and recreating...`);

                            try {
                                // 清除数据库中的 shopifyProductId
                                await prisma.product.update({
                                    where: { id: productId },
                                    data: { shopifyProductId: null }
                                });

                                // 重新创建产品
                                const unifiedProductForCreation = {
                                    id: existingProduct.id,
                                    sourceApi: existingProduct.sourceApi.toLowerCase() as 'cj' | 'pepperjam',
                                    sourceProductId: existingProduct.sourceProductId,
                                    brandName: existingProduct.brand.name,
                                    title: matchedProduct.title,
                                    description: matchedProduct.description,
                                    price: matchedProduct.price,
                                    salePrice: matchedProduct.salePrice || undefined,
                                    currency: existingProduct.currency,
                                    imageUrl: matchedProduct.imageUrl,
                                    affiliateUrl: existingProduct.affiliateUrl,
                                    categories: matchedProduct.categories,
                                    availability: matchedProduct.availability,
                                    importStatus: 'pending' as const,
                                    lastUpdated: new Date(),
                                    keywordsMatched: existingProduct.keywordsMatched,
                                    sku: existingProduct.sku || undefined
                                };

                                const newShopifyProduct = await shopifyService.createProduct(session, unifiedProductForCreation, 'draft');

                                // 更新数据库中的新 shopifyProductId
                                await prisma.product.update({
                                    where: { id: productId },
                                    data: {
                                        shopifyProductId: newShopifyProduct.id.toString(),
                                        importStatus: 'IMPORTED'
                                    }
                                });

                                logger.info(`Successfully recreated Shopify product with new ID: ${newShopifyProduct.id}`);
                            } catch (recreateError) {
                                logger.error(`Error recreating Shopify product:`, recreateError);
                                results.failed++;
                                results.errors.push({
                                    productId,
                                    error: `Failed to recreate product: ${recreateError instanceof Error ? recreateError.message : 'Unknown error'}`
                                });
                                continue;
                            }
                        } else {
                            logger.error(`Error updating Shopify product ${existingProduct.shopifyProductId}:`, shopifyError);
                            // 继续处理，不因Shopify更新失败而中断
                        }
                    }
                }

                results.success++;
                logger.info(`Successfully updated product: ${existingProduct.title}`);

            } catch (error) {
                logger.error(`Error updating product ${productId}:`, error);
                results.failed++;
                results.errors.push({
                    productId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        logger.info(`Product update completed - Success: ${results.success}, Failed: ${results.failed}, No Changes: ${results.noChanges}`);

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        logger.error('Error in product update:', error);
        next(error);
    }
});

/**
 * 检查和同步产品状态
 * POST /api/shopify/sync-status
 */
router.post('/sync-status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productIds } = req.body;

        // 获取当前会话
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found. Please authenticate first.'
            });
            return;
        }

        if (!session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'Session access token is missing. Please re-authenticate.'
            });
            return;
        }

        // 如果没有指定产品ID，检查所有已导入的产品
        const whereCondition = productIds && Array.isArray(productIds) && productIds.length > 0
            ? { id: { in: productIds }, importStatus: 'IMPORTED' as const }
            : { importStatus: 'IMPORTED' as const, shopifyProductId: { not: null } };

        const importedProducts = await prisma.product.findMany({
            where: whereCondition,
            include: { brand: true }
        });

        logger.info(`Checking sync status for ${importedProducts.length} products`);

        const results = {
            checked: 0,
            stillExists: 0,
            deleted: 0,
            updated: 0,
            errors: [] as Array<{ productId: string; error: string }>
        };

        for (const product of importedProducts) {
            try {
                if (!product.shopifyProductId) {
                    continue;
                }

                logger.info(`Checking Shopify product: ${product.shopifyProductId}`);

                // 使用ShopifyService的公有方法检查产品是否存在
                try {
                    const checkResult = await shopifyService.checkProductExists(session, product.shopifyProductId);

                    if (checkResult.exists) {
                        // 产品仍然存在
                        results.stillExists++;
                        logger.info(`Product ${product.shopifyProductId} still exists in Shopify`);
                    } else {
                        // 产品不存在，更新数据库状态
                        logger.info(`Product ${product.shopifyProductId} no longer exists in Shopify, updating status`);

                        await prisma.product.update({
                            where: { id: product.id },
                            data: {
                                shopifyProductId: null,
                                importStatus: 'PENDING',
                                lastUpdated: new Date()
                            }
                        });

                        results.deleted++;
                        results.updated++;
                    }
                } catch (shopifyError: any) {
                    // 其他错误
                    logger.error(`Error checking product ${product.shopifyProductId}:`, shopifyError);
                    results.errors.push({
                        productId: product.id,
                        error: shopifyError.message || 'Unknown error'
                    });
                }

                results.checked++;

            } catch (error) {
                logger.error(`Error processing product ${product.id}:`, error);
                results.errors.push({
                    productId: product.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        logger.info(`Status sync completed: ${results.checked} checked, ${results.stillExists} still exist, ${results.deleted} deleted, ${results.updated} updated`);

        res.json({
            success: true,
            data: results,
            message: `Status sync completed: ${results.deleted} products were marked as deleted`
        });

    } catch (error) {
        logger.error('Error in status sync:', error);
        next(error);
    }
});

/**
 * 同步产品库存状态
 * POST /api/shopify/sync-inventory
 */
router.post('/sync-inventory', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productIds } = req.body;

        // 获取当前会话
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found. Please authenticate first.'
            });
            return;
        }

        if (!session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'Session access token is missing. Please re-authenticate.'
            });
            return;
        }

        // 如果没有指定产品ID，同步所有已导入的产品
        const whereCondition = productIds && Array.isArray(productIds) && productIds.length > 0
            ? { id: { in: productIds }, importStatus: 'IMPORTED' as const }
            : { importStatus: 'IMPORTED' as const, shopifyProductId: { not: null } };

        const importedProducts = await prisma.product.findMany({
            where: whereCondition,
            include: { brand: true }
        });

        logger.info(`Syncing inventory for ${importedProducts.length} products`);

        const results = {
            checked: 0,
            synced: 0,
            errors: [] as Array<{ productId: string; error: string }>
        };

        for (const product of importedProducts) {
            try {
                if (!product.shopifyProductId) {
                    continue;
                }

                logger.info(`Syncing inventory for product: ${product.shopifyProductId}, availability: ${product.availability}`);

                // 检查产品是否存在
                const checkResult = await shopifyService.checkProductExists(session, product.shopifyProductId);

                if (!checkResult.exists) {
                    // 产品不存在，更新数据库状态
                    await prisma.product.update({
                        where: { id: product.id },
                        data: {
                            shopifyProductId: null,
                            importStatus: 'PENDING',
                            lastUpdated: new Date()
                        }
                    });

                    logger.info(`Product ${product.shopifyProductId} no longer exists in Shopify, marked as pending`);
                    results.errors.push({
                        productId: product.id,
                        error: 'Product no longer exists in Shopify'
                    });
                    continue;
                }

                const shopifyProduct = checkResult.product;

                // 同步库存状态
                const syncResult = await shopifyService.syncInventoryForProduct(
                    session,
                    shopifyProduct,
                    product.availability
                );

                if (syncResult.synced) {
                    results.synced++;
                    logger.info(`Successfully synced inventory for product ${product.shopifyProductId}`);
                } else if (syncResult.error) {
                    results.errors.push({
                        productId: product.id,
                        error: syncResult.error
                    });
                }

                results.checked++;

            } catch (error) {
                logger.error(`Error syncing inventory for product ${product.id}:`, error);
                results.errors.push({
                    productId: product.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        logger.info(`Inventory sync completed: ${results.checked} checked, ${results.synced} synced, ${results.errors.length} errors`);

        res.json({
            success: true,
            data: results,
            message: `Inventory sync completed: ${results.synced} products synced`
        });

    } catch (error) {
        logger.error('Error in inventory sync:', error);
        next(error);
    }
});

/**
 * 图片代理端点 - 用于解决某些CDN图片无法被Shopify直接访问的问题（支持格式修复）
 */
router.get('/image-proxy', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { url, format, fix } = req.query;

        if (!url || typeof url !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Image URL is required'
            });
            return;
        }

        const requestedFormat = (format as string) || 'jpg'; // 默认使用JPG以确保Shopify兼容性
        const shouldFix = fix === 'true';

        logger.info(`Proxying image request for: ${url} (format: ${requestedFormat}, fix: ${shouldFix})`);

        // 构建优化的URL变体列表
        const urlsToTry = buildImageUrlVariants(url, requestedFormat, shouldFix);

        // 使用多种User-Agent和请求方法尝试获取图片
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (compatible; Shopify/1.0; +https://shopify.com/)',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        ];

        let fetchResponse: globalThis.Response | null = null;
        let successfulUrl: string = '';
        let actualContentType: string = '';
        let imageBuffer: Buffer | null = null;

        // 尝试所有URL变体
        for (const tryUrl of urlsToTry) {
            for (const userAgent of userAgents) {
                try {
                    const response = await fetch(tryUrl, {
                        method: 'GET',
                        headers: {
                            'User-Agent': userAgent,
                            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache',
                            'Sec-Fetch-Dest': 'image',
                            'Sec-Fetch-Mode': 'no-cors',
                            'Sec-Fetch-Site': 'cross-site'
                        },
                        signal: AbortSignal.timeout(15000)
                    });

                    if (response.ok) {
                        const contentType = response.headers.get('content-type')?.toLowerCase() || '';
                        const contentLength = parseInt(response.headers.get('content-length') || '0');

                        // 更严格的图片验证
                        const isValidImage = (
                            contentType.startsWith('image/') ||
                            contentType.includes('octet-stream') ||
                            contentType === ''
                        ) && contentLength > 100; // 确保不是空文件或错误页面

                        if (isValidImage) {
                            // 获取图片数据
                            imageBuffer = Buffer.from(await response.arrayBuffer());

                            // 验证图片数据的实际格式
                            const detectedFormat = detectImageFormatFromBuffer(imageBuffer);

                            fetchResponse = response;
                            successfulUrl = tryUrl;
                            actualContentType = contentType;

                            logger.info(`Successfully fetched image: ${tryUrl.substring(0, 100)}... with User-Agent: ${userAgent.substring(0, 50)}... (${contentType}, ${contentLength} bytes, detected: ${detectedFormat})`);
                            break;
                        } else {
                            logger.debug(`Invalid image response from ${tryUrl}: contentType=${contentType}, size=${contentLength}`);
                        }
                    } else {
                        logger.debug(`HTTP error for ${tryUrl}: ${response.status} ${response.statusText}`);
                    }
                } catch (error) {
                    logger.debug(`Failed to fetch ${tryUrl.substring(0, 100)}...:`, error instanceof Error ? error.message : error);
                    continue;
                }
            }

            if (fetchResponse && imageBuffer) break; // 成功获取，退出URL尝试循环
        }

        if (!fetchResponse || !imageBuffer) {
            logger.warn(`All attempts failed for image proxy: ${url}`);
            res.status(404).json({
                success: false,
                error: 'Unable to fetch image from source',
                attempted_urls: urlsToTry.length,
                message: 'Image could not be fetched from any URL variant'
            });
            return;
        }

        // 检测实际图片格式
        const detectedFormat = detectImageFormatFromBuffer(imageBuffer);
        logger.info(`Detected image format from buffer: ${detectedFormat} for original URL: ${url}`);

        // 根据检测结果和请求格式决定是否需要转换
        let finalBuffer = imageBuffer;
        let responseContentType = determineResponseContentType(actualContentType, requestedFormat);

        // 如果请求的是JPG但检测到的不是JPG，或者格式不匹配需要修复
        if (shouldFix && requestedFormat === 'jpg' && detectedFormat !== 'jpeg') {
            logger.info(`Converting image from ${detectedFormat} to JPG for Shopify compatibility`);

            try {
                // 使用sharp或其他图片处理库来转换格式（如果可用）
                finalBuffer = await convertImageToJpeg(imageBuffer);
                responseContentType = 'image/jpeg';
                logger.info(`Successfully converted image to JPEG format`);
            } catch (convertError) {
                logger.warn(`Image format conversion failed, using original:`, convertError);
                // 转换失败，使用原始数据但设置正确的Content-Type
                responseContentType = 'image/jpeg'; // 强制设置为JPEG
            }
        }

        // 设置响应头，确保格式与请求的格式一致
        const contentLength = finalBuffer.length;

        // 设置Shopify友好的响应头
        res.setHeader('Content-Type', responseContentType);
        res.setHeader('Content-Length', contentLength.toString());
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=3600'); // 24小时缓存
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
        res.setHeader('X-Proxy-Source', successfulUrl);
        res.setHeader('X-Original-Content-Type', actualContentType || 'unknown');
        res.setHeader('X-Detected-Format', detectedFormat || 'unknown');
        res.setHeader('X-Requested-Format', requestedFormat);
        res.setHeader('X-Format-Converted', shouldFix && detectedFormat !== 'jpeg' ? 'true' : 'false');

        // 直接发送图片数据
        res.end(finalBuffer);
        logger.info(`Successfully proxied image: original URL length=${url.length}, final URL length=${successfulUrl.length}, format=${responseContentType}, size=${contentLength}`);

    } catch (error) {
        logger.error('Error in image proxy:', error);
        next(error);
    }
});

/**
 * 构建图片URL变体列表
 */
function buildImageUrlVariants(originalUrl: string, requestedFormat: string, shouldFix: boolean): string[] {
    const urlsToTry: string[] = [];

    try {
        const urlObj = new URL(originalUrl);

        // 1. 针对Demandware/Salesforce Commerce Cloud的特殊优化
        if (originalUrl.includes('demandware.static')) {
            const demandwareOptimized = new URL(originalUrl);
            demandwareOptimized.searchParams.set('fmt', requestedFormat === 'png' ? 'png' : 'jpg');
            demandwareOptimized.searchParams.set('qlt', '90'); // 高质量
            demandwareOptimized.searchParams.set('wid', '1200'); // 更大尺寸
            demandwareOptimized.searchParams.set('hei', '1200');
            demandwareOptimized.searchParams.set('fit', 'constrain');
            urlsToTry.push(demandwareOptimized.toString());

            // 添加另一个变体
            const demandwareAlt = new URL(originalUrl);
            demandwareAlt.searchParams.set('fmt', 'jpg');
            demandwareAlt.searchParams.set('qlt', '85');
            demandwareAlt.searchParams.set('wid', '800');
            urlsToTry.push(demandwareAlt.toString());
        }

        // 2. 通用格式参数优化
        if (shouldFix) {
            const formatOptimized = new URL(originalUrl);
            formatOptimized.searchParams.set('format', requestedFormat);
            formatOptimized.searchParams.set('fmt', requestedFormat);
            formatOptimized.searchParams.set('f', requestedFormat);
            if (requestedFormat === 'jpg' || requestedFormat === 'jpeg') {
                formatOptimized.searchParams.set('quality', '85');
                formatOptimized.searchParams.set('q', '85');
            }
            urlsToTry.push(formatOptimized.toString());
        }

        // 3. 原始URL
        urlsToTry.push(originalUrl);

        // 4. 清理版本（移除可能有问题的参数）
        const cleanUrl = new URL(originalUrl);
        ['cache', 'timestamp', 'v', 'version', '_', 't'].forEach(param => {
            cleanUrl.searchParams.delete(param);
        });
        if (cleanUrl.toString() !== originalUrl) {
            urlsToTry.push(cleanUrl.toString());
        }

        // 5. 强制HTTPS
        if (urlObj.protocol === 'http:') {
            const httpsUrl = originalUrl.replace('http://', 'https://');
            urlsToTry.push(httpsUrl);
        }

    } catch (urlError) {
        logger.debug(`URL parsing failed for optimization: ${originalUrl}`, urlError);
        urlsToTry.push(originalUrl); // 至少包含原始URL
    }

    // 去重
    return [...new Set(urlsToTry)];
}

/**
 * 确定响应的Content-Type
 */
function determineResponseContentType(actualContentType: string, requestedFormat: string): string {
    // 如果实际Content-Type是有效的图片类型，优先使用
    if (actualContentType && actualContentType.startsWith('image/')) {
        // 但如果请求的是JPG且实际是其他格式，考虑转换
        if ((requestedFormat === 'jpg' || requestedFormat === 'jpeg') &&
            !actualContentType.includes('jpeg') && !actualContentType.includes('jpg')) {
            return 'image/jpeg'; // 强制返回JPEG以确保Shopify兼容性
        }
        return actualContentType;
    }

    // 回退到请求的格式
    switch (requestedFormat.toLowerCase()) {
        case 'png':
            return 'image/png';
        case 'gif':
            return 'image/gif';
        case 'webp':
            return 'image/webp';
        case 'svg':
            return 'image/svg+xml';
        default:
            return 'image/jpeg'; // 默认JPEG
    }
}

/**
 * 从图片Buffer检测格式
 */
function detectImageFormatFromBuffer(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 8) return null;

    // 检查文件头签名
    const header = buffer.subarray(0, 8);

    // JPEG: FF D8 FF
    if (header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF) {
        return 'jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47 &&
        header[4] === 0x0D && header[5] === 0x0A && header[6] === 0x1A && header[7] === 0x0A) {
        return 'png';
    }

    // GIF: 47 49 46 38 (GIF8)
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x38) {
        return 'gif';
    }

    // WebP: 52 49 46 46 (RIFF) + WebP signature
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
        // 需要检查更多字节来确认是WebP
        if (buffer.length >= 12) {
            const webpSig = buffer.subarray(8, 12);
            if (webpSig.toString('ascii') === 'WEBP') {
                return 'webp';
            }
        }
    }

    // BMP: 42 4D (BM)
    if (header[0] === 0x42 && header[1] === 0x4D) {
        return 'bmp';
    }

    return null;
}

/**
 * 将图片转换为JPEG格式
 */
async function convertImageToJpeg(inputBuffer: Buffer): Promise<Buffer> {
    // 如果有sharp库可用，使用sharp进行转换
    try {
        const sharp = require('sharp');
        return await sharp(inputBuffer)
            .jpeg({
                quality: 85,
                progressive: false,
                mozjpeg: false
            })
            .toBuffer();
    } catch (error) {
        logger.debug('Sharp not available for image conversion:', error);
    }

    // 如果没有sharp，尝试其他方法或返回原始buffer
    // 这里可以添加其他图片处理库的支持

    // 作为最后的尝试，如果原始格式就是JPEG相关，直接返回
    const detectedFormat = detectImageFormatFromBuffer(inputBuffer);
    if (detectedFormat === 'jpeg') {
        return inputBuffer;
    }

    // 如果无法转换，抛出错误
    throw new Error(`Unable to convert image format from ${detectedFormat} to JPEG - no image processing library available`);
}

export default router; 