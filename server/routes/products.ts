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
 * 计算两个文本的相似度 (基于Jaccard相似度)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
}

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

            // 根据API类型获取原始数据，使用更灵活的搜索策略
            if (product.sourceApi === 'CJ') {
                // 尝试多种搜索策略来增加匹配概率
                const searchStrategies = [
                    // 1. 使用产品标题中的关键词
                    product.title.split(' ').filter(word => word.length > 3).slice(0, 3),
                    // 2. 使用品牌名称
                    [product.brand.name],
                    // 3. 使用已匹配的关键词
                    product.keywordsMatched && product.keywordsMatched.length > 0 ? product.keywordsMatched : [],
                    // 4. 不使用关键词过滤，获取更多数据
                    []
                ];

                for (const keywords of searchStrategies) {
                    if (rawProducts.length > 0) break;

                    try {
                        rawProducts = await productRetriever.fetchCJProductsRaw({
                            advertiserId: product.brand.apiId,
                            keywords: keywords.length > 0 ? keywords : undefined,
                            limit: keywords.length === 0 ? 50 : 20 // 无关键词时获取更多数据
                        });

                        logger.info(`CJ search strategy '${keywords.join(', ') || 'no keywords'}' returned ${rawProducts.length} products`);
                    } catch (error) {
                        logger.warn(`CJ search strategy failed:`, error);
                    }
                }
            } else if (product.sourceApi === 'PEPPERJAM') {
                // 同样的策略用于Pepperjam
                const searchStrategies = [
                    product.title.split(' ').filter(word => word.length > 3).slice(0, 3),
                    [product.brand.name],
                    product.keywordsMatched && product.keywordsMatched.length > 0 ? product.keywordsMatched : [],
                    []
                ];

                for (const keywords of searchStrategies) {
                    if (rawProducts.length > 0) break;

                    try {
                        rawProducts = await productRetriever.fetchPepperjamProductsRaw({
                            programId: product.brand.apiId,
                            keywords: keywords.length > 0 ? keywords : undefined,
                            limit: keywords.length === 0 ? 50 : 20
                        });

                        logger.info(`Pepperjam search strategy '${keywords.join(', ') || 'no keywords'}' returned ${rawProducts.length} products`);
                    } catch (error) {
                        logger.warn(`Pepperjam search strategy failed:`, error);
                    }
                }
            }

            // 查找匹配的产品，使用多种匹配策略
            let matchedRawProduct = null;
            if (rawProducts && rawProducts.length > 0) {
                logger.info(`Attempting to match product "${product.title}" against ${rawProducts.length} raw products`);

                // 策略1: 通过源产品ID精确匹配
                matchedRawProduct = rawProducts.find((p: any) => {
                    const productId = product.sourceApi === 'CJ' ?
                        String(p.id) :  // CJ API 使用 id 字段
                        String(p.id || p.product_id || p.sku);
                    return productId === product.sourceProductId;
                });

                if (matchedRawProduct) {
                    logger.info(`Found product through ID matching: ${product.sourceProductId}`);
                } else {
                    // 策略2: 通过标题匹配（多种模式）
                    const productTitleLower = product.title.toLowerCase();
                    const productTitleCleaned = productTitleLower.replace(/[®™©\s\-.,()]/g, '');

                    matchedRawProduct = rawProducts.find((p: any) => {
                        const apiTitle = product.sourceApi === 'CJ' ?
                            (p.title || '') :  // CJ API 使用 title 字段
                            (p.name || p.title || p.product_name || '');

                        const rawTitleLower = apiTitle.toLowerCase();
                        const rawTitleCleaned = apiTitle.replace(/[®™©\s\-.,()]/g, '').toLowerCase();

                        // 多种匹配模式
                        return (
                            // 完全包含匹配
                            rawTitleLower.includes(productTitleLower) ||
                            productTitleLower.includes(rawTitleLower) ||
                            // 清理后的字符串匹配
                            rawTitleCleaned.includes(productTitleCleaned) ||
                            productTitleCleaned.includes(rawTitleCleaned) ||
                            // 关键词匹配 (至少50%的词汇匹配)
                            calculateTextSimilarity(productTitleLower, rawTitleLower) > 0.5
                        );
                    });

                    if (matchedRawProduct) {
                        const matchedTitle = product.sourceApi === 'CJ' ?
                            matchedRawProduct.title :
                            (matchedRawProduct.name || matchedRawProduct.title);
                        logger.info(`Found product through title matching: "${matchedTitle}"`);
                    }
                }

                // 策略3: 通过品牌名称和部分标题匹配
                if (!matchedRawProduct && rawProducts.length > 0) {
                    logger.info(`Attempting brand and partial title matching for product: ${product.title}`);

                    const productWords = product.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);

                    matchedRawProduct = rawProducts.find((p: any) => {
                        const brandMatch = product.sourceApi === 'CJ' ?
                            (p.advertiserName || '').toLowerCase().includes(product.brand.name.toLowerCase()) :
                            (p.program_name || '').toLowerCase().includes(product.brand.name.toLowerCase());

                        if (!brandMatch) return false;

                        const apiTitle = product.sourceApi === 'CJ' ? (p.title || '') : (p.name || p.title || '');
                        const apiWords = apiTitle.toLowerCase().split(/\s+/);

                        // 至少30%的词汇匹配
                        const matchingWords = productWords.filter(word =>
                            apiWords.some((apiWord: string) => apiWord.includes(word) || word.includes(apiWord))
                        );

                        return (matchingWords.length / productWords.length) >= 0.3;
                    });

                    if (matchedRawProduct) {
                        const matchedTitle = product.sourceApi === 'CJ' ?
                            matchedRawProduct.title :
                            (matchedRawProduct.name || matchedRawProduct.title);
                        logger.info(`Found product through brand and partial title matching: "${matchedTitle}"`);
                    }
                }

                // 策略4: 最宽松匹配 - 同品牌下的相似度最高的产品
                if (!matchedRawProduct && rawProducts.length > 0) {
                    logger.info(`Attempting fuzzy matching for product: ${product.title}`);

                    let bestMatch = null;
                    let bestScore = 0;

                    for (const p of rawProducts) {
                        const brandMatch = product.sourceApi === 'CJ' ?
                            (p.advertiserName || '').toLowerCase().includes(product.brand.name.toLowerCase()) :
                            (p.program_name || '').toLowerCase().includes(product.brand.name.toLowerCase());

                        if (brandMatch) {
                            const apiTitle = product.sourceApi === 'CJ' ? (p.title || '') : (p.name || p.title || '');
                            const similarity = calculateTextSimilarity(product.title.toLowerCase(), apiTitle.toLowerCase());

                            if (similarity > bestScore && similarity > 0.2) { // 最低20%相似度
                                bestScore = similarity;
                                bestMatch = p;
                            }
                        }
                    }

                    if (bestMatch) {
                        matchedRawProduct = bestMatch;
                        const matchedTitle = product.sourceApi === 'CJ' ?
                            bestMatch.title :
                            (bestMatch.name || bestMatch.title);
                        logger.info(`Found product through fuzzy matching (${Math.round(bestScore * 100)}% similarity): "${matchedTitle}"`);
                    }
                }

                // 调试信息
                if (!matchedRawProduct) {
                    logger.warn(`No matching raw data found for product: ${product.title}`);
                    logger.debug(`Debug info for product matching:`, {
                        productTitle: product.title,
                        sourceProductId: product.sourceProductId,
                        sourceApi: product.sourceApi,
                        brandName: product.brand.name,
                        rawProductsCount: rawProducts.length,
                        sampleRawProducts: rawProducts.slice(0, 3).map((p: any) => ({
                            id: p.id,
                            title: p.title || p.name,
                            advertiserName: p.advertiserName || p.program_name
                        }))
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
        const matchedProduct = updatedProducts.find(p => {
            // 首先通过源产品ID匹配
            if (p.sourceProductId === product.sourceProductId) {
                return true;
            }

            // 然后通过标题匹配
            const productTitle = product.title.toLowerCase();
            const updatedTitle = p.title.toLowerCase();

            // 更灵活的标题匹配
            return updatedTitle.includes(productTitle) ||
                productTitle.includes(updatedTitle) ||
                // 移除特殊字符后匹配
                updatedTitle.replace(/[®™©\s-]/g, '').includes(productTitle.replace(/[®™©\s-]/g, '')) ||
                productTitle.replace(/[®™©\s-]/g, '').includes(updatedTitle.replace(/[®™©\s-]/g, ''));
        });

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

                        const matchedProduct = updatedProducts.find(p => {
                            // 首先通过源产品ID匹配
                            if (p.sourceProductId === product.sourceProductId) {
                                return true;
                            }

                            // 然后通过标题匹配
                            const productTitle = product.title.toLowerCase();
                            const updatedTitle = p.title.toLowerCase();

                            // 更灵活的标题匹配
                            return updatedTitle.includes(productTitle) ||
                                productTitle.includes(updatedTitle) ||
                                // 移除特殊字符后匹配
                                updatedTitle.replace(/[®™©\s-]/g, '').includes(productTitle.replace(/[®™©\s-]/g, '')) ||
                                productTitle.replace(/[®™©\s-]/g, '').includes(updatedTitle.replace(/[®™©\s-]/g, ''));
                        });

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