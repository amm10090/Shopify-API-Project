import { Router, Request, Response, NextFunction } from 'express';
import { verifyShopifySession } from '@server/routes/auth';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';
import { ProductRetriever } from '@server/services/ProductRetriever';
import { ApiResponse, PaginatedResponse, UnifiedProduct, ProductFilters } from '@shared/types/index';

const router = Router();
const productRetriever = new ProductRetriever();

// 应用会话验证中间件到所有路由
router.use(verifyShopifySession);

/**
 * 获取产品列表
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            page = 1,
            limit = 20,
            brandId,
            sourceApi,
            availability,
            importStatus,
            search,
            minPrice,
            maxPrice
        } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const offset = (pageNum - 1) * limitNum;

        // 构建查询条件
        const where: any = {};

        if (brandId) {
            where.brandId = brandId as string;
        }

        if (sourceApi) {
            where.sourceApi = (sourceApi as string).toUpperCase();
        }

        if (availability !== undefined) {
            where.availability = availability === 'true';
        }

        if (importStatus) {
            where.importStatus = (importStatus as string).toUpperCase();
        }

        if (search) {
            where.OR = [
                { title: { contains: search as string, mode: 'insensitive' } },
                { description: { contains: search as string, mode: 'insensitive' } },
                { sku: { contains: search as string, mode: 'insensitive' } }
            ];
        }

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice as string);
            if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
        }

        // 获取产品总数
        const total = await prisma.product.count({ where });

        // 获取产品列表
        const products = await prisma.product.findMany({
            where,
            include: {
                brand: true
            },
            orderBy: { lastUpdated: 'desc' },
            skip: offset,
            take: limitNum
        });

        // 转换为前端需要的格式
        const transformedProducts = products.map(product => ({
            id: product.id,
            sourceApi: product.sourceApi.toLowerCase(),
            sourceProductId: product.sourceProductId,
            brandName: product.brand.name,
            title: product.title,
            description: product.description,
            price: product.price,
            salePrice: product.salePrice,
            currency: product.currency,
            imageUrl: product.imageUrl,
            affiliateUrl: product.affiliateUrl,
            categories: product.categories,
            availability: product.availability,
            shopifyProductId: product.shopifyProductId,
            importStatus: product.importStatus.toLowerCase(),
            lastUpdated: product.lastUpdated,
            keywordsMatched: product.keywordsMatched,
            sku: product.sku
        }));

        const totalPages = Math.ceil(total / limitNum);

        res.json({
            success: true,
            data: transformedProducts,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages,
                hasNextPage: pageNum < totalPages,
                hasPreviousPage: pageNum > 1
            }
        });

    } catch (error) {
        logger.error('Error fetching products:', error);
        next(error);
    }
});

/**
 * 获取单个产品详情
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const product = await prisma.product.findUnique({
            where: { id },
            include: { brand: true }
        });

        if (!product) {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
            return;
        }

        // 转换为前端需要的格式
        const transformedProduct = {
            id: product.id,
            sourceApi: product.sourceApi.toLowerCase(),
            sourceProductId: product.sourceProductId,
            brandName: product.brand.name,
            title: product.title,
            description: product.description,
            price: product.price,
            salePrice: product.salePrice,
            currency: product.currency,
            imageUrl: product.imageUrl,
            affiliateUrl: product.affiliateUrl,
            categories: product.categories,
            availability: product.availability,
            shopifyProductId: product.shopifyProductId,
            importStatus: product.importStatus.toLowerCase(),
            lastUpdated: product.lastUpdated,
            keywordsMatched: product.keywordsMatched,
            sku: product.sku
        };

        res.json({
            success: true,
            data: transformedProduct
        });

    } catch (error) {
        logger.error('Error fetching product:', error);
        next(error);
    }
});

/**
 * 获取产品的原始API数据
 */
router.get('/:id/raw-data', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        logger.info(`Getting raw API data for product: ${id}`);

        const product = await prisma.product.findUnique({
            where: { id },
            include: { brand: true }
        });

        if (!product) {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
            return;
        }

        // 如果数据库中已经有原始API数据，直接返回
        if (product.rawApiData) {
            logger.info(`Returning cached raw API data for product: ${id}`);
            res.json({
                success: true,
                data: product.rawApiData,
                cached: true
            });
            return;
        }

        // 从API获取原始数据
        logger.info(`Fetching fresh data for product: ${product.title}`);

        try {
            let rawProducts = [];

            // 根据API类型获取原始数据
            if (product.sourceApi === 'CJ') {
                rawProducts = await productRetriever.fetchCJProductsRaw({
                    advertiserId: product.brand.apiId,
                    keywords: [product.title],
                    limit: 10
                });
            } else if (product.sourceApi === 'PEPPERJAM') {
                rawProducts = await productRetriever.fetchPepperjamProductsRaw({
                    programId: product.brand.apiId,
                    keywords: [product.title],
                    limit: 10
                });
            }

            // 查找匹配的产品
            let matchedRawProduct = null;
            if (rawProducts && rawProducts.length > 0) {
                // 首先尝试通过源产品ID匹配
                matchedRawProduct = rawProducts.find((p: any) => {
                    const productId = product.sourceApi === 'CJ' ?
                        p.sku :
                        p.id || p.product_id;
                    return productId === product.sourceProductId;
                });

                // 如果通过ID没找到，尝试通过标题匹配
                if (!matchedRawProduct) {
                    matchedRawProduct = rawProducts.find((p: any) => {
                        const apiTitle = p.name || p.title || p.product_name || '';
                        return apiTitle.toLowerCase().includes(product.title.toLowerCase()) ||
                            product.title.toLowerCase().includes(apiTitle.toLowerCase());
                    });
                }
            }

            if (matchedRawProduct) {
                // 将原始数据保存到数据库以便下次使用
                await prisma.product.update({
                    where: { id },
                    data: { rawApiData: matchedRawProduct }
                });

                logger.info(`Fetched and cached raw API data for product: ${id}`);

                res.json({
                    success: true,
                    data: matchedRawProduct,
                    cached: false
                });
            } else {
                logger.warn(`No matching raw data found for product: ${product.title}`);
                res.json({
                    success: false,
                    error: 'No raw API data found for this product',
                    message: 'The original API data could not be retrieved. This may happen if the product is no longer available in the source API.'
                });
            }

        } catch (apiError) {
            logger.error(`Error fetching raw API data for product ${id}:`, apiError);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch raw API data',
                details: apiError instanceof Error ? apiError.message : 'Unknown error'
            });
        }

    } catch (error) {
        logger.error('Error in raw data endpoint:', error);
        next(error);
    }
});

/**
 * 从源API更新产品信息
 */
router.post('/:id/update-from-source', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        logger.info(`Updating product from source: ${id}`);

        const product = await prisma.product.findUnique({
            where: { id },
            include: { brand: true }
        });

        if (!product) {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
            return;
        }

        if (!product.brand) {
            res.status(400).json({
                success: false,
                error: 'Product has no associated brand'
            });
            return;
        }

        // 从API获取最新产品信息
        let updatedProducts: UnifiedProduct[] = [];

        if (product.sourceApi === 'CJ') {
            updatedProducts = await productRetriever.fetchCJProducts({
                advertiserId: product.brand.apiId,
                keywords: [product.title],
                limit: 10
            });
        } else if (product.sourceApi === 'PEPPERJAM') {
            updatedProducts = await productRetriever.fetchPepperjamProducts({
                programId: product.brand.apiId,
                keywords: [product.title],
                limit: 10
            });
        }

        // 找到匹配的产品
        const matchedProduct = updatedProducts.find(p =>
            p.sourceProductId === product.sourceProductId ||
            p.title.toLowerCase().includes(product.title.toLowerCase()) ||
            product.title.toLowerCase().includes(p.title.toLowerCase())
        );

        if (!matchedProduct) {
            res.status(404).json({
                success: false,
                error: 'Updated product data not found'
            });
            return;
        }

        // 更新产品信息
        const updatedProduct = await prisma.product.update({
            where: { id },
            data: {
                title: matchedProduct.title,
                description: matchedProduct.description,
                price: matchedProduct.price,
                salePrice: matchedProduct.salePrice,
                imageUrl: matchedProduct.imageUrl,
                availability: matchedProduct.availability,
                categories: matchedProduct.categories,
                lastUpdated: new Date()
            },
            include: { brand: true }
        });

        // 转换为前端格式
        const transformedProduct = {
            id: updatedProduct.id,
            sourceApi: updatedProduct.sourceApi.toLowerCase(),
            sourceProductId: updatedProduct.sourceProductId,
            brandName: updatedProduct.brand.name,
            title: updatedProduct.title,
            description: updatedProduct.description,
            price: updatedProduct.price,
            salePrice: updatedProduct.salePrice,
            currency: updatedProduct.currency,
            imageUrl: updatedProduct.imageUrl,
            affiliateUrl: updatedProduct.affiliateUrl,
            categories: updatedProduct.categories,
            availability: updatedProduct.availability,
            shopifyProductId: updatedProduct.shopifyProductId,
            importStatus: updatedProduct.importStatus.toLowerCase(),
            lastUpdated: updatedProduct.lastUpdated,
            keywordsMatched: updatedProduct.keywordsMatched,
            sku: updatedProduct.sku
        };

        res.json({
            success: true,
            data: transformedProduct
        });

    } catch (error) {
        logger.error('Error updating product from source:', error);
        next(error);
    }
});

/**
 * 更新产品信息
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: {
                ...updateData,
                lastUpdated: new Date()
            },
            include: { brand: true }
        });

        // 转换为前端格式
        const transformedProduct = {
            id: updatedProduct.id,
            sourceApi: updatedProduct.sourceApi.toLowerCase(),
            sourceProductId: updatedProduct.sourceProductId,
            brandName: updatedProduct.brand.name,
            title: updatedProduct.title,
            description: updatedProduct.description,
            price: updatedProduct.price,
            salePrice: updatedProduct.salePrice,
            currency: updatedProduct.currency,
            imageUrl: updatedProduct.imageUrl,
            affiliateUrl: updatedProduct.affiliateUrl,
            categories: updatedProduct.categories,
            availability: updatedProduct.availability,
            shopifyProductId: updatedProduct.shopifyProductId,
            importStatus: updatedProduct.importStatus.toLowerCase(),
            lastUpdated: updatedProduct.lastUpdated,
            keywordsMatched: updatedProduct.keywordsMatched,
            sku: updatedProduct.sku
        };

        res.json({
            success: true,
            data: transformedProduct
        });

    } catch (error) {
        logger.error('Error updating product:', error);
        next(error);
    }
});

/**
 * 删除产品
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        await prisma.product.delete({
            where: { id }
        });

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting product:', error);
        next(error);
    }
});

/**
 * 批量操作
 */
router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, productIds } = req.body;

        if (!productIds || !Array.isArray(productIds)) {
            res.status(400).json({
                success: false,
                error: 'Product IDs array is required'
            });
            return;
        }

        let result;

        switch (action) {
            case 'delete':
                result = await prisma.product.deleteMany({
                    where: { id: { in: productIds } }
                });
                res.json({
                    success: true,
                    data: { count: result.count },
                    message: `Deleted ${result.count} products`
                });
                break;

            case 'update_from_source':
                // 批量从源API更新产品信息
                const results = {
                    success: 0,
                    failed: 0,
                    noChanges: 0,
                    errors: [] as any[]
                };

                for (const productId of productIds) {
                    try {
                        const product = await prisma.product.findUnique({
                            where: { id: productId },
                            include: { brand: true }
                        });

                        if (!product || !product.brand) {
                            results.failed++;
                            results.errors.push({
                                productId,
                                error: 'Product or brand not found'
                            });
                            continue;
                        }

                        // 从API获取最新信息
                        let updatedProducts: UnifiedProduct[] = [];

                        if (product.sourceApi === 'CJ') {
                            updatedProducts = await productRetriever.fetchCJProducts({
                                advertiserId: product.brand.apiId,
                                keywords: [product.title],
                                limit: 10
                            });
                        } else if (product.sourceApi === 'PEPPERJAM') {
                            updatedProducts = await productRetriever.fetchPepperjamProducts({
                                programId: product.brand.apiId,
                                keywords: [product.title],
                                limit: 10
                            });
                        }

                        const matchedProduct = updatedProducts.find(p =>
                            p.sourceProductId === product.sourceProductId ||
                            p.title.toLowerCase().includes(product.title.toLowerCase())
                        );

                        if (!matchedProduct) {
                            results.failed++;
                            results.errors.push({
                                productId,
                                error: 'Updated product data not found'
                            });
                            continue;
                        }

                        // 检查是否有变化
                        const hasChanges = (
                            product.title !== matchedProduct.title ||
                            product.description !== matchedProduct.description ||
                            product.price !== matchedProduct.price ||
                            product.salePrice !== matchedProduct.salePrice ||
                            product.imageUrl !== matchedProduct.imageUrl ||
                            product.availability !== matchedProduct.availability
                        );

                        if (!hasChanges) {
                            results.noChanges++;
                            continue;
                        }

                        // 更新产品
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

                        results.success++;

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
                    data: results
                });
                break;

            default:
                res.status(400).json({
                    success: false,
                    error: 'Invalid action'
                });
        }

    } catch (error) {
        logger.error('Error in bulk operation:', error);
        next(error);
    }
});

export default router; 