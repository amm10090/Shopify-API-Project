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

        logger.info(`Starting bulk import for shop: ${session.shop}, products: ${productIds.length}`);

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
                            String(shopifyProduct.id),
                            String(collection.id)
                        );
                    }

                    // 设置联盟链接元字段
                    await shopifyService.setProductMetafield(
                        session,
                        String(shopifyProduct.id),
                        'custom',
                        'affiliate_link',
                        product.affiliateUrl,
                        'url'
                    );

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

                                const newShopifyProduct = await shopifyService.createProduct(session, unifiedProductForCreation, 'active');

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

export default router; 