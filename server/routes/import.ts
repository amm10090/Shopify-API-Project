import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@server/index';
import { ProductRetriever } from '@server/services/ProductRetriever';
import { logger } from '@server/utils/logger';
import { ImportJob, ApiResponse } from '@shared/types/index';

const router = Router();
const productRetriever = new ProductRetriever();

/**
 * 开始导入任务 - 从API获取产品
 */
router.post('/start', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { brandId, keywords, limit = 50 } = req.body;

        if (!brandId) {
            res.status(400).json({
                success: false,
                error: 'Brand ID is required'
            });
            return;
        }

        // 获取品牌信息
        const brand = await prisma.brand.findUnique({
            where: { id: brandId }
        });

        if (!brand) {
            res.status(404).json({
                success: false,
                error: 'Brand not found'
            });
            return;
        }

        if (!brand.isActive) {
            res.status(400).json({
                success: false,
                error: 'Brand is not active'
            });
            return;
        }

        // 创建导入任务记录
        const importJob = await prisma.importJob.create({
            data: {
                brandId,
                status: 'RUNNING',
                filters: {
                    keywords: keywords ? keywords.split(',').map((k: string) => k.trim()) : [],
                    limit
                }
            }
        });

        // 异步执行产品获取
        setImmediate(async () => {
            try {
                let products: any[] = [];
                const keywordsList = keywords ? keywords.split(',').map((k: string) => k.trim()) : [];

                logger.info(`Starting product fetch for brand: ${brand.name} (${brand.apiType}), API ID: ${brand.apiId}, Keywords: [${keywordsList.join(', ')}], Limit: ${limit}`);

                if (brand.apiType === 'CJ') {
                    // 检查CJ API配置
                    if (!process.env.CJ_API_TOKEN) {
                        throw new Error('CJ_API_TOKEN not configured');
                    }
                    if (!process.env.CJ_CID && !process.env.BRAND_CID) {
                        throw new Error('CJ_CID or BRAND_CID not configured');
                    }

                    products = await productRetriever.fetchCJProducts({
                        advertiserId: brand.apiId,
                        keywords: keywordsList,
                        limit
                    });
                } else if (brand.apiType === 'PEPPERJAM') {
                    // 检查Pepperjam API配置
                    if (!process.env.ASCEND_API_KEY && !process.env.PEPPERJAM_API_KEY) {
                        throw new Error('ASCEND_API_KEY or PEPPERJAM_API_KEY not configured');
                    }

                    products = await productRetriever.fetchPepperjamProducts({
                        programId: brand.apiId,
                        keywords: keywordsList,
                        limit
                    });
                } else {
                    throw new Error(`Unsupported API type: ${brand.apiType}`);
                }

                logger.info(`Product fetch completed for brand: ${brand.name}, found ${products.length} products`);

                // 获取原始API数据以保存到数据库
                let rawProductsData: any[] = [];
                try {
                    if (brand.apiType === 'CJ') {
                        rawProductsData = await productRetriever.fetchCJProductsRaw({
                            advertiserId: brand.apiId,
                            keywords: keywordsList,
                            limit: Math.min(products.length * 2, 200) // 获取更多原始数据以确保匹配
                        });
                    } else if (brand.apiType === 'PEPPERJAM') {
                        rawProductsData = await productRetriever.fetchPepperjamProductsRaw({
                            programId: brand.apiId,
                            keywords: keywordsList,
                            limit: Math.min(products.length * 2, 200)
                        });
                    }
                    logger.info(`Fetched ${rawProductsData.length} raw API products for rawApiData storage`);
                } catch (error) {
                    logger.warn(`Failed to fetch raw API data during import:`, error);
                    rawProductsData = [];
                }

                // 保存产品到数据库
                const savedProducts: any[] = [];
                for (const productData of products) {
                    try {
                        // 查找对应的原始API数据
                        let matchedRawData = null;
                        if (rawProductsData.length > 0) {
                            matchedRawData = rawProductsData.find((rawProduct: any) => {
                                // 通过源产品ID匹配
                                const rawProductId = brand.apiType === 'CJ' ? 
                                    String(rawProduct.id) : 
                                    String(rawProduct.id || rawProduct.product_id || rawProduct.sku);
                                
                                if (rawProductId === productData.sourceProductId) {
                                    return true;
                                }

                                // 通过标题匹配
                                const rawTitle = brand.apiType === 'CJ' ? 
                                    (rawProduct.title || '') : 
                                    (rawProduct.name || rawProduct.title || '');
                                
                                const productTitle = productData.title.toLowerCase();
                                const rawTitleLower = rawTitle.toLowerCase();

                                return rawTitleLower.includes(productTitle) || 
                                       productTitle.includes(rawTitleLower) ||
                                       rawTitleLower.replace(/[®™©\s-]/g, '').includes(productTitle.replace(/[®™©\s-]/g, ''));
                            });
                        }

                        // 检查产品是否已存在
                        const existingProduct = await prisma.product.findFirst({
                            where: {
                                sourceApi: productData.sourceApi.toUpperCase(),
                                sourceProductId: productData.sourceProductId
                            }
                        });

                        if (existingProduct) {
                            // 更新现有产品，包括原始API数据
                            const updatedProduct = await prisma.product.update({
                                where: { id: existingProduct.id },
                                data: {
                                    title: productData.title,
                                    description: productData.description,
                                    price: productData.price,
                                    salePrice: productData.salePrice,
                                    currency: productData.currency,
                                    imageUrl: productData.imageUrl,
                                    affiliateUrl: productData.affiliateUrl,
                                    categories: productData.categories,
                                    availability: productData.availability,
                                    keywordsMatched: productData.keywordsMatched || [],
                                    sku: productData.sku,
                                    rawApiData: matchedRawData, // 保存原始API数据
                                    lastUpdated: new Date()
                                }
                            });
                            savedProducts.push(updatedProduct);
                        } else {
                            // 创建新产品，包括原始API数据
                            const newProduct = await prisma.product.create({
                                data: {
                                    sourceApi: productData.sourceApi.toUpperCase(),
                                    sourceProductId: productData.sourceProductId,
                                    brandId,
                                    title: productData.title,
                                    description: productData.description,
                                    price: productData.price,
                                    salePrice: productData.salePrice,
                                    currency: productData.currency,
                                    imageUrl: productData.imageUrl,
                                    affiliateUrl: productData.affiliateUrl,
                                    categories: productData.categories,
                                    availability: productData.availability,
                                    keywordsMatched: productData.keywordsMatched || [],
                                    sku: productData.sku,
                                    rawApiData: matchedRawData, // 保存原始API数据
                                    importStatus: 'PENDING'
                                }
                            });
                            savedProducts.push(newProduct);
                        }
                    } catch (error) {
                        logger.error(`Error saving product ${productData.title}:`, error);
                    }
                }

                // 更新导入任务状态
                await prisma.importJob.update({
                    where: { id: importJob.id },
                    data: {
                        status: 'COMPLETED',
                        productsFound: products.length,
                        productsImported: savedProducts.length,
                        completedAt: new Date()
                    }
                });

                // 更新品牌同步时间
                await prisma.brand.update({
                    where: { id: brandId },
                    data: { lastSync: new Date() }
                });

                logger.info(`Import job ${importJob.id} completed: ${savedProducts.length}/${products.length} products saved`);

            } catch (error) {
                logger.error(`Import job ${importJob.id} failed:`, error);

                await prisma.importJob.update({
                    where: { id: importJob.id },
                    data: {
                        status: 'FAILED',
                        completedAt: new Date(),
                        errorMessage: error instanceof Error ? error.message : 'Unknown error'
                    }
                });
            }
        });

        res.json({
            success: true,
            data: {
                id: importJob.id,
                brandId: importJob.brandId,
                status: importJob.status.toLowerCase(),
                productsFound: importJob.productsFound,
                productsImported: importJob.productsImported,
                createdAt: importJob.createdAt
            },
            message: 'Import job started successfully'
        });

    } catch (error) {
        next(error);
    }
});

/**
 * 获取导入任务状态
 */
router.get('/:jobId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const importJob = await prisma.importJob.findUnique({
            where: { id: req.params.jobId },
            include: { brand: true }
        });

        if (!importJob) {
            res.status(404).json({
                success: false,
                error: 'Import job not found'
            });
            return;
        }

        res.json({
            success: true,
            data: {
                id: importJob.id,
                brandId: importJob.brandId,
                brandName: importJob.brand.name,
                status: importJob.status.toLowerCase(),
                productsFound: importJob.productsFound,
                productsImported: importJob.productsImported,
                filters: importJob.filters,
                createdAt: importJob.createdAt,
                completedAt: importJob.completedAt,
                errorMessage: importJob.errorMessage
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * 获取导入历史
 */
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (req.query.brandId) {
            where.brandId = req.query.brandId;
        }

        const [jobs, total] = await Promise.all([
            prisma.importJob.findMany({
                where,
                skip,
                take: limit,
                include: { brand: true },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.importJob.count({ where })
        ]);

        res.json({
            data: jobs.map(job => ({
                id: job.id,
                brandId: job.brandId,
                brandName: job.brand.name,
                status: job.status.toLowerCase(),
                productsFound: job.productsFound,
                productsImported: job.productsImported,
                filters: job.filters,
                createdAt: job.createdAt,
                completedAt: job.completedAt,
                errorMessage: job.errorMessage
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        next(error);
    }
});

/**
 * 取消导入任务
 */
router.post('/:jobId/cancel', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const importJob = await prisma.importJob.findUnique({
            where: { id: req.params.jobId }
        });

        if (!importJob) {
            res.status(404).json({
                success: false,
                error: 'Import job not found'
            });
            return;
        }

        if (importJob.status !== 'RUNNING') {
            res.status(400).json({
                success: false,
                error: 'Can only cancel running jobs'
            });
            return;
        }

        await prisma.importJob.update({
            where: { id: req.params.jobId },
            data: {
                status: 'FAILED',
                completedAt: new Date(),
                errorMessage: 'Cancelled by user'
            }
        });

        res.json({
            success: true,
            message: 'Import job cancelled'
        });

    } catch (error) {
        next(error);
    }
});

export default router; 