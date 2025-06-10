import { Router, Request, Response, NextFunction } from 'express';
import { verifyShopifySession } from '@server/routes/auth';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';
import { ProductRetriever } from '@server/services/ProductRetriever';
import { ApiResponse, PaginatedResponse, UnifiedProduct, ProductFilters } from '@shared/types/index';

const router = Router();
const skipImageValidation = process.env.SKIP_IMAGE_VALIDATION === 'true';
const strictImageValidation = process.env.STRICT_IMAGE_VALIDATION !== 'false'; // 默认为true
const productRetriever = new ProductRetriever(skipImageValidation, strictImageValidation);

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

/**
 * 诊断产品图片问题
 */
router.post('/:id/diagnose-image', verifyShopifySession, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        logger.info(`Diagnosing image issues for product: ${id}`);

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

        const diagnostics = {
            productId: product.id,
            productTitle: product.title,
            imageUrl: product.imageUrl,
            shopifyProductId: product.shopifyProductId,
            importStatus: product.importStatus,
            checks: [] as Array<{ check: string; status: 'pass' | 'fail' | 'warning'; message: string; details?: any }>
        };

        // 检查1: 是否有图片URL
        if (!product.imageUrl) {
            diagnostics.checks.push({
                check: 'Image URL Exists',
                status: 'fail',
                message: 'Product has no image URL'
            });
        } else {
            diagnostics.checks.push({
                check: 'Image URL Exists',
                status: 'pass',
                message: `Image URL: ${product.imageUrl}`
            });

            // 检查2: URL格式验证
            const urlPattern = /^https?:\/\/.+/i;
            if (!urlPattern.test(product.imageUrl)) {
                diagnostics.checks.push({
                    check: 'URL Format',
                    status: 'fail',
                    message: 'Invalid URL format'
                });
            } else {
                diagnostics.checks.push({
                    check: 'URL Format',
                    status: 'pass',
                    message: 'URL format is valid'
                });

                // 检查3: 图片可访问性和格式检测
                try {
                    const startTime = Date.now();

                    // 首先进行HEAD请求检查基本可访问性
                    const response = await fetch(product.imageUrl, {
                        method: 'HEAD',
                        signal: AbortSignal.timeout(10000),
                        headers: {
                            'User-Agent': 'Shopify-Product-Importer/1.0'
                        }
                    });
                    const responseTime = Date.now() - startTime;

                    if (response.ok) {
                        const contentType = response.headers.get('content-type');
                        const contentLength = response.headers.get('content-length');

                        // 检查图片格式匹配性
                        const urlExtension = product.imageUrl.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/)?.[1];
                        const actualFormat = contentType?.toLowerCase().includes('jpeg') ? 'jpg' :
                            contentType?.toLowerCase().includes('png') ? 'png' :
                                contentType?.toLowerCase().includes('gif') ? 'gif' :
                                    contentType?.toLowerCase().includes('webp') ? 'webp' : null;

                        let formatStatus: 'pass' | 'warning' | 'fail' = 'pass';
                        let formatMessage = `Image is accessible (${response.status})`;

                        if (urlExtension && actualFormat) {
                            const normalizeExt = (ext: string) => ext.toLowerCase().replace('jpeg', 'jpg');
                            const isFormatMatch = normalizeExt(urlExtension) === normalizeExt(actualFormat);

                            if (!isFormatMatch) {
                                formatStatus = 'warning';
                                formatMessage = `Format mismatch: URL extension=${urlExtension}, actual format=${actualFormat}`;
                            } else {
                                formatMessage = `Format validation passed: ${actualFormat}`;
                            }
                        } else if (!contentType || !contentType.startsWith('image/')) {
                            formatStatus = 'warning';
                            formatMessage = `Invalid or missing image content type: ${contentType || 'None'}`;
                        }

                        diagnostics.checks.push({
                            check: 'Image Accessibility & Format',
                            status: formatStatus,
                            message: formatMessage,
                            details: {
                                responseTime: `${responseTime}ms`,
                                contentType,
                                contentLength: contentLength ? `${contentLength} bytes` : 'Unknown',
                                urlExtension,
                                actualFormat,
                                formatMatch: urlExtension && actualFormat ?
                                    (urlExtension.toLowerCase().replace('jpeg', 'jpg') === actualFormat.toLowerCase().replace('jpeg', 'jpg')) : null
                            }
                        });

                        // 检查4: 内容类型详细分析
                        if (contentType && contentType.startsWith('image/')) {
                            diagnostics.checks.push({
                                check: 'Content Type Validation',
                                status: 'pass',
                                message: `Valid image content type: ${contentType}`,
                                details: { contentType }
                            });
                        } else {
                            diagnostics.checks.push({
                                check: 'Content Type Validation',
                                status: 'warning',
                                message: `Non-standard content type: ${contentType || 'None'}`,
                                details: { contentType }
                            });
                        }

                        // 检查5: 文件大小验证
                        if (contentLength) {
                            const sizeBytes = parseInt(contentLength);
                            if (sizeBytes < 1000) {
                                diagnostics.checks.push({
                                    check: 'File Size',
                                    status: 'warning',
                                    message: `Very small file size: ${sizeBytes} bytes - may indicate placeholder or error page`,
                                    details: { sizeBytes, sizeMB: (sizeBytes / 1024 / 1024).toFixed(3) }
                                });
                            } else if (sizeBytes > 10 * 1024 * 1024) {
                                diagnostics.checks.push({
                                    check: 'File Size',
                                    status: 'warning',
                                    message: `Large file size: ${Math.round(sizeBytes / 1024 / 1024)}MB - may affect loading performance`,
                                    details: { sizeBytes, sizeMB: (sizeBytes / 1024 / 1024).toFixed(3) }
                                });
                            } else {
                                diagnostics.checks.push({
                                    check: 'File Size',
                                    status: 'pass',
                                    message: `Reasonable file size: ${Math.round(sizeBytes / 1024)}KB`,
                                    details: { sizeBytes, sizeKB: Math.round(sizeBytes / 1024) }
                                });
                            }
                        }

                    } else {
                        diagnostics.checks.push({
                            check: 'Image Accessibility & Format',
                            status: 'fail',
                            message: `Image not accessible (${response.status})`,
                            details: {
                                httpStatus: response.status,
                                statusText: response.statusText
                            }
                        });

                        // 如果直接访问失败，测试代理访问和格式修复
                        try {
                            const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
                            const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(product.imageUrl)}&format=jpg&fix=true`;

                            const proxyResponse = await fetch(proxyUrl, {
                                method: 'HEAD',
                                signal: AbortSignal.timeout(10000)
                            });

                            if (proxyResponse.ok) {
                                diagnostics.checks.push({
                                    check: 'Proxy & Format Fix',
                                    status: 'pass',
                                    message: `Image accessible via proxy with format fix (${proxyResponse.status})`,
                                    details: {
                                        proxyUrl: proxyUrl,
                                        contentType: proxyResponse.headers.get('content-type') || 'Unknown',
                                        recommendation: 'Use proxy service or fix image format'
                                    }
                                });
                            } else {
                                diagnostics.checks.push({
                                    check: 'Proxy & Format Fix',
                                    status: 'fail',
                                    message: `Proxy access also failed (${proxyResponse.status})`,
                                    details: { proxyStatus: proxyResponse.status }
                                });
                            }
                        } catch (proxyError) {
                            diagnostics.checks.push({
                                check: 'Proxy & Format Fix',
                                status: 'warning',
                                message: `Proxy test failed: ${proxyError instanceof Error ? proxyError.message : 'Unknown error'}`,
                                details: {
                                    error: proxyError instanceof Error ? proxyError.message : 'Unknown error',
                                    recommendation: 'Manual image URL correction may be needed'
                                }
                            });
                        }
                    }
                } catch (error) {
                    diagnostics.checks.push({
                        check: 'Image Accessibility & Format',
                        status: 'fail',
                        message: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        details: {
                            networkError: error instanceof Error ? error.message : 'Unknown error',
                            recommendation: 'Check network connectivity or image URL validity'
                        }
                    });
                }
            }
        }

        // 检查6: Shopify产品状态
        if (product.shopifyProductId) {
            diagnostics.checks.push({
                check: 'Shopify Product',
                status: 'pass',
                message: `Product exists in Shopify (ID: ${product.shopifyProductId})`
            });

            // 检查Shopify中的图片状态
            const session = (req as any).shopifySession;
            try {
                const { ShopifyService } = await import('../services/ShopifyService');
                const service = new ShopifyService();
                const result = await service.checkProductExists(session, product.shopifyProductId);

                if (result.exists && result.product) {
                    const shopifyImages = result.product.images || [];
                    if (shopifyImages.length > 0) {
                        diagnostics.checks.push({
                            check: 'Shopify Product Images',
                            status: 'pass',
                            message: `${shopifyImages.length} image(s) in Shopify`,
                            details: {
                                images: shopifyImages.map((img: any) => ({
                                    id: img.id,
                                    src: img.src,
                                    alt: img.alt
                                }))
                            }
                        });
                    } else {
                        diagnostics.checks.push({
                            check: 'Shopify Product Images',
                            status: 'fail',
                            message: 'No images found in Shopify product'
                        });
                    }
                } else {
                    diagnostics.checks.push({
                        check: 'Shopify Product Images',
                        status: 'fail',
                        message: 'Shopify product not found'
                    });
                }
            } catch (error) {
                diagnostics.checks.push({
                    check: 'Shopify Product Images',
                    status: 'warning',
                    message: `Error checking Shopify product: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        } else {
            diagnostics.checks.push({
                check: 'Shopify Product',
                status: 'warning',
                message: 'Product not imported to Shopify yet'
            });
        }

        res.json({
            success: true,
            data: diagnostics
        });

    } catch (error) {
        logger.error('Error diagnosing product image:', error);
        next(error);
    }
});

/**
 * 修复产品图片问题
 */
router.post('/:id/fix-image', verifyShopifySession, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { forceUpdate = false } = req.body;

        logger.info(`Attempting to fix image for product: ${id}`);

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

        if (!product.imageUrl) {
            res.status(400).json({
                success: false,
                error: 'Product has no image URL to fix'
            });
            return;
        }

        const session = (req as any).shopifySession;
        const results = {
            productId: product.id,
            imageUrl: product.imageUrl,
            shopifyProductId: product.shopifyProductId,
            actions: [] as Array<{ action: string; status: 'success' | 'failed'; message: string }>
        };

        // 如果产品已导入到Shopify，尝试修复Shopify中的图片
        if (product.shopifyProductId) {
            try {
                const { ShopifyService } = await import('../services/ShopifyService');
                const shopifyService = new ShopifyService();

                // 检查产品是否存在
                const productCheck = await shopifyService.checkProductExists(session, product.shopifyProductId);

                if (productCheck.exists) {
                    const shopifyProduct = productCheck.product;
                    const hasImages = shopifyProduct.images && shopifyProduct.images.length > 0;

                    if (!hasImages || forceUpdate) {
                        // 尝试添加原始图片
                        let imageAdded = await (shopifyService as any).addImageToProduct(
                            session,
                            product.shopifyProductId,
                            product.imageUrl,
                            product.title
                        );

                        if (imageAdded) {
                            results.actions.push({
                                action: 'Add Image to Shopify Product',
                                status: 'success',
                                message: 'Image successfully added to Shopify product'
                            });
                        } else {
                            // 如果原始图片失败，尝试使用代理URL
                            try {
                                const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
                                const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(product.imageUrl)}`;

                                logger.info(`Attempting to add image via proxy: ${proxyUrl}`);

                                imageAdded = await (shopifyService as any).addImageToProduct(
                                    session,
                                    product.shopifyProductId,
                                    proxyUrl,
                                    product.title
                                );

                                if (imageAdded) {
                                    results.actions.push({
                                        action: 'Add Image via Proxy',
                                        status: 'success',
                                        message: 'Image successfully added using proxy service'
                                    });
                                } else {
                                    results.actions.push({
                                        action: 'Add Image to Shopify Product',
                                        status: 'failed',
                                        message: 'Failed to add image even with proxy service'
                                    });
                                }
                            } catch (proxyError) {
                                results.actions.push({
                                    action: 'Add Image to Shopify Product',
                                    status: 'failed',
                                    message: 'Failed to add image to Shopify product (original and proxy failed)'
                                });
                            }
                        }
                    } else {
                        results.actions.push({
                            action: 'Check Shopify Images',
                            status: 'success',
                            message: `Product already has ${shopifyProduct.images.length} image(s) in Shopify`
                        });
                    }
                } else {
                    results.actions.push({
                        action: 'Check Shopify Product',
                        status: 'failed',
                        message: 'Shopify product not found'
                    });
                }
            } catch (error) {
                results.actions.push({
                    action: 'Fix Shopify Image',
                    status: 'failed',
                    message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        } else {
            results.actions.push({
                action: 'Check Import Status',
                status: 'failed',
                message: 'Product not imported to Shopify yet. Import the product first.'
            });
        }

        const hasSuccess = results.actions.some(action => action.status === 'success');

        res.json({
            success: hasSuccess,
            data: results,
            message: hasSuccess ? 'Image fix operations completed' : 'All fix operations failed'
        });

    } catch (error) {
        logger.error('Error fixing product image:', error);
        next(error);
    }
});

export default router; 