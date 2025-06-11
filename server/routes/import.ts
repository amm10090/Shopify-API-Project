import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '@server/index';
import { ProductRetriever } from '@server/services/ProductRetriever';
import { logger } from '@server/utils/logger';
import { ImportJob, ApiResponse } from '@shared/types/index';

const router = Router();
const skipImageValidation = process.env.SKIP_IMAGE_VALIDATION === 'true';
const strictImageValidation = process.env.STRICT_IMAGE_VALIDATION !== 'false'; // 默认为true
const productRetriever = new ProductRetriever(skipImageValidation, strictImageValidation);

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

        // 异步执行产品获取 - 优化版本，支持并发处理
        setImmediate(async () => {
            try {
                let allProducts: any[] = [];
                const keywordsList = keywords ? keywords.split(',').map((k: string) => k.trim()) : [];

                logger.info(`Starting concurrent product fetch for brand: ${brand.name} (${brand.apiType}), API ID: ${brand.apiId}, Keywords: [${keywordsList.join(', ')}], Limit: ${limit}`);

                // 创建并发任务数组
                const concurrentTasks: Promise<any[]>[] = [];

                if (brand.apiType === 'CJ') {
                    // 检查CJ API配置
                    if (!process.env.CJ_API_TOKEN) {
                        throw new Error('CJ_API_TOKEN not configured');
                    }
                    if (!process.env.CJ_CID && !process.env.BRAND_CID) {
                        throw new Error('CJ_CID or BRAND_CID not configured');
                    }

                    if (keywordsList.length > 0) {
                        // 如果有关键词，为每个关键词创建并发任务
                        const perKeywordLimit = Math.ceil(limit / keywordsList.length);
                        
                        logger.info(`CJ: Creating ${keywordsList.length} concurrent tasks, ${perKeywordLimit} products per keyword`);
                        
                        for (const keyword of keywordsList) {
                            const task = productRetriever.fetchCJProducts({
                                advertiserId: brand.apiId,
                                keywords: [keyword], // 单个关键词
                                limit: perKeywordLimit
                            });
                            concurrentTasks.push(task);
                        }

                        // 同时添加一个无关键词的通用搜索任务
                        const generalTask = productRetriever.fetchCJProducts({
                            advertiserId: brand.apiId,
                            keywords: [],
                            limit: Math.floor(limit * 0.3) // 30%的产品来自通用搜索
                        });
                        concurrentTasks.push(generalTask);
                    } else {
                        // 没有关键词，创建单个任务
                        const task = productRetriever.fetchCJProducts({
                            advertiserId: brand.apiId,
                            keywords: [],
                            limit
                        });
                        concurrentTasks.push(task);
                    }

                } else if (brand.apiType === 'PEPPERJAM') {
                    // 检查Pepperjam API配置
                    if (!process.env.ASCEND_API_KEY && !process.env.PEPPERJAM_API_KEY) {
                        throw new Error('ASCEND_API_KEY or PEPPERJAM_API_KEY not configured');
                    }

                    if (keywordsList.length > 0) {
                        // 如果有关键词，为每个关键词创建并发任务
                        const perKeywordLimit = Math.ceil(limit / keywordsList.length);
                        
                        logger.info(`Pepperjam: Creating ${keywordsList.length} concurrent tasks, ${perKeywordLimit} products per keyword`);
                        
                        for (const keyword of keywordsList) {
                            const task = productRetriever.fetchPepperjamProducts({
                                programId: brand.apiId,
                                keywords: [keyword], // 单个关键词
                                limit: perKeywordLimit
                            });
                            concurrentTasks.push(task);
                        }

                        // 同时添加一个无关键词的通用搜索任务
                        const generalTask = productRetriever.fetchPepperjamProducts({
                            programId: brand.apiId,
                            keywords: [],
                            limit: Math.floor(limit * 0.3) // 30%的产品来自通用搜索
                        });
                        concurrentTasks.push(generalTask);
                    } else {
                        // 没有关键词，创建单个任务
                        const task = productRetriever.fetchPepperjamProducts({
                            programId: brand.apiId,
                            keywords: [],
                            limit
                        });
                        concurrentTasks.push(task);
                    }
                } else {
                    throw new Error(`Unsupported API type: ${brand.apiType}`);
                }

                // 并发执行所有任务
                logger.info(`Executing ${concurrentTasks.length} concurrent API fetch tasks...`);
                const startTime = Date.now();
                
                const results = await Promise.allSettled(concurrentTasks);
                
                const executionTime = Date.now() - startTime;
                logger.info(`Concurrent API fetch completed in ${executionTime}ms`);

                // 处理结果
                const successfulResults: any[][] = [];
                const failedResults: any[] = [];

                results.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        successfulResults.push(result.value);
                        logger.info(`Task ${index + 1} succeeded with ${result.value.length} products`);
                    } else {
                        failedResults.push({ index: index + 1, error: result.reason });
                        logger.warn(`Task ${index + 1} failed:`, result.reason);
                    }
                });

                // 合并所有成功的结果
                allProducts = successfulResults.flat();

                // 去重产品（基于sourceProductId）
                const uniqueProducts = new Map();
                allProducts.forEach(product => {
                    if (!uniqueProducts.has(product.sourceProductId)) {
                        uniqueProducts.set(product.sourceProductId, product);
                    }
                });
                allProducts = Array.from(uniqueProducts.values());

                // 限制到指定数量
                if (allProducts.length > limit) {
                    allProducts = allProducts.slice(0, limit);
                }

                logger.info(`Product fetch completed for brand: ${brand.name}, found ${allProducts.length} unique products from ${concurrentTasks.length} concurrent tasks`);

                // 并发获取原始API数据
                let rawProductsData: any[] = [];
                try {
                    const rawDataTasks: Promise<any[]>[] = [];

                    if (brand.apiType === 'CJ') {
                        if (keywordsList.length > 0) {
                            // 为每个关键词创建原始数据获取任务
                            for (const keyword of keywordsList) {
                                const task = productRetriever.fetchCJProductsRaw({
                                    advertiserId: brand.apiId,
                                    keywords: [keyword],
                                    limit: Math.ceil(limit / keywordsList.length * 1.5) // 获取更多数据
                                });
                                rawDataTasks.push(task);
                            }
                        } else {
                            const task = productRetriever.fetchCJProductsRaw({
                                advertiserId: brand.apiId,
                                keywords: [],
                                limit: Math.min(allProducts.length * 2, 300)
                            });
                            rawDataTasks.push(task);
                        }
                    } else if (brand.apiType === 'PEPPERJAM') {
                        if (keywordsList.length > 0) {
                            // 为每个关键词创建原始数据获取任务
                            for (const keyword of keywordsList) {
                                const task = productRetriever.fetchPepperjamProductsRaw({
                                    programId: brand.apiId,
                                    keywords: [keyword],
                                    limit: Math.ceil(limit / keywordsList.length * 1.5) // 获取更多数据
                                });
                                rawDataTasks.push(task);
                            }
                        } else {
                            const task = productRetriever.fetchPepperjamProductsRaw({
                                programId: brand.apiId,
                                keywords: [],
                                limit: Math.min(allProducts.length * 2, 300)
                            });
                            rawDataTasks.push(task);
                        }
                    }

                    // 并发执行原始数据获取
                    if (rawDataTasks.length > 0) {
                        logger.info(`Executing ${rawDataTasks.length} concurrent raw data fetch tasks...`);
                        const rawResults = await Promise.allSettled(rawDataTasks);
                        
                        rawResults.forEach((result, index) => {
                            if (result.status === 'fulfilled') {
                                rawProductsData.push(...result.value);
                                logger.info(`Raw data task ${index + 1} succeeded with ${result.value.length} products`);
                            } else {
                                logger.warn(`Raw data task ${index + 1} failed:`, result.reason);
                            }
                        });
                    }

                    // 去重原始数据
                    const uniqueRawData = new Map();
                    rawProductsData.forEach(rawProduct => {
                        const rawProductId = brand.apiType === 'CJ' ? 
                            String(rawProduct.id) : 
                            String(rawProduct.id || rawProduct.product_id || rawProduct.sku);
                        
                        if (!uniqueRawData.has(rawProductId)) {
                            uniqueRawData.set(rawProductId, rawProduct);
                        }
                    });
                    rawProductsData = Array.from(uniqueRawData.values());

                    logger.info(`Fetched ${rawProductsData.length} unique raw API products for rawApiData storage`);
                } catch (error) {
                    logger.warn(`Failed to fetch raw API data during import:`, error);
                    rawProductsData = [];
                }

                // 更新导入任务进度
                await prisma.importJob.update({
                    where: { id: importJob.id },
                    data: {
                        productsFound: allProducts.length,
                        filters: {
                            ...(importJob.filters as any),
                            concurrent_tasks: concurrentTasks.length,
                            execution_time_ms: executionTime,
                            failed_tasks: failedResults.length
                        }
                    }
                });

                // 批量保存产品到数据库 - 优化版本
                const savedProducts: any[] = [];
                const batchSize = 10; // 每批处理10个产品
                
                logger.info(`Starting batch product save: ${allProducts.length} products in batches of ${batchSize}`);

                for (let i = 0; i < allProducts.length; i += batchSize) {
                    const batch = allProducts.slice(i, i + batchSize);
                    const batchPromises = batch.map(async (productData) => {
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
                                return await prisma.product.update({
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
                            } else {
                                // 创建新产品，包括原始API数据
                                return await prisma.product.create({
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
                            }
                        } catch (error) {
                            logger.error(`Error saving product ${productData.title}:`, error);
                            return null;
                        }
                    });

                    // 等待当前批次完成
                    const batchResults = await Promise.allSettled(batchPromises);
                    
                    batchResults.forEach((result, index) => {
                        if (result.status === 'fulfilled' && result.value) {
                            savedProducts.push(result.value);
                        } else {
                            logger.error(`Failed to save product in batch ${Math.floor(i / batchSize) + 1}, item ${index + 1}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
                        }
                    });

                    logger.info(`Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allProducts.length / batchSize)}: ${savedProducts.length} products saved so far`);

                    // 在批次之间添加短暂延迟，避免数据库过载
                    if (i + batchSize < allProducts.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                // 更新导入任务状态
                await prisma.importJob.update({
                    where: { id: importJob.id },
                    data: {
                        status: 'COMPLETED',
                        productsFound: allProducts.length,
                        productsImported: savedProducts.length,
                        completedAt: new Date(),
                        filters: {
                            ...(importJob.filters as any),
                            concurrent_tasks: concurrentTasks.length,
                            execution_time_ms: executionTime,
                            failed_tasks: failedResults.length,
                            batch_save_completed: true
                        }
                    }
                });

                // 更新品牌同步时间
                await prisma.brand.update({
                    where: { id: brandId },
                    data: { lastSync: new Date() }
                });

                logger.info(`Import job ${importJob.id} completed: ${savedProducts.length}/${allProducts.length} products saved using ${concurrentTasks.length} concurrent tasks in ${executionTime}ms`);

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