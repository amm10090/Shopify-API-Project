import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { ProductRetriever } from '../services/ProductRetriever';
import { logger } from '../utils/logger';
import { ApiResponse, PaginatedResponse, UnifiedProduct, ProductFilters } from '../../shared/types/index';

const router = Router();
const productRetriever = new ProductRetriever();

/**
 * 获取产品列表（分页）
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        // 构建过滤条件
        const where: any = {};

        if (req.query.brandId) {
            where.brandId = req.query.brandId;
        }

        if (req.query.sourceApi) {
            where.sourceApi = req.query.sourceApi;
        }

        if (req.query.availability !== undefined) {
            where.availability = req.query.availability === 'true';
        }

        if (req.query.importStatus) {
            where.importStatus = (req.query.importStatus as string).toUpperCase();
        }

        if (req.query.search) {
            const search = req.query.search as string;
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } }
            ];
        }

        // 价格范围过滤
        if (req.query.minPrice || req.query.maxPrice) {
            where.price = {};
            if (req.query.minPrice) {
                where.price.gte = parseFloat(req.query.minPrice as string);
            }
            if (req.query.maxPrice) {
                where.price.lte = parseFloat(req.query.maxPrice as string);
            }
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip,
                take: limit,
                include: {
                    brand: true
                },
                orderBy: {
                    lastUpdated: 'desc'
                }
            }),
            prisma.product.count({ where })
        ]);

        const response: PaginatedResponse<UnifiedProduct> = {
            data: products.map(p => ({
                id: p.id,
                sourceApi: p.sourceApi.toLowerCase() as 'cj' | 'pepperjam',
                sourceProductId: p.sourceProductId,
                brandName: p.brand.name,
                title: p.title,
                description: p.description,
                price: p.price,
                salePrice: p.salePrice || undefined,
                currency: p.currency,
                imageUrl: p.imageUrl,
                affiliateUrl: p.affiliateUrl,
                categories: p.categories,
                availability: p.availability,
                shopifyProductId: p.shopifyProductId || undefined,
                importStatus: p.importStatus.toLowerCase() as 'pending' | 'imported' | 'failed',
                lastUpdated: p.lastUpdated,
                keywordsMatched: p.keywordsMatched,
                sku: p.sku || undefined
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };

        res.json(response);
    } catch (error) {
        next(error);
    }
});

/**
 * 根据ID获取单个产品
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { brand: true }
        });

        if (!product) {
            res.status(404).json({
                success: false,
                error: 'Product not found'
            });
            return;
        }

        const unifiedProduct: UnifiedProduct = {
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

        res.json({
            success: true,
            data: unifiedProduct
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 从API获取产品（不保存到数据库）
 */
router.post('/fetch', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { brandId, keywords, limit = 50, apiType } = req.body;

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

        let products: UnifiedProduct[] = [];

        if (brand.apiType === 'CJ') {
            products = await productRetriever.fetchCJProducts({
                advertiserId: brand.apiId,
                keywords: keywords ? keywords.split(',').map((k: string) => k.trim()) : [],
                limit
            });
        } else if (brand.apiType === 'PEPPERJAM') {
            products = await productRetriever.fetchPepperjamProducts({
                programId: brand.apiId,
                keywords: keywords ? keywords.split(',').map((k: string) => k.trim()) : [],
                limit
            });
        }

        res.json({
            success: true,
            data: products,
            message: `Fetched ${products.length} products from ${brand.apiType} API`
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 保存获取的产品到数据库
 */
router.post('/save', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { products, brandId } = req.body;

        if (!products || !Array.isArray(products)) {
            res.status(400).json({
                success: false,
                error: 'Products array is required'
            });
            return;
        }

        if (!brandId) {
            res.status(400).json({
                success: false,
                error: 'Brand ID is required'
            });
            return;
        }

        const savedProducts = [];
        const errors = [];

        for (const productData of products) {
            try {
                // 检查产品是否已存在
                const existingProduct = await prisma.product.findFirst({
                    where: {
                        sourceApi: productData.sourceApi.toUpperCase(),
                        sourceProductId: productData.sourceProductId
                    }
                });

                if (existingProduct) {
                    // 更新现有产品
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
                            lastUpdated: new Date()
                        }
                    });
                    savedProducts.push(updatedProduct);
                } else {
                    // 创建新产品
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
                            importStatus: 'PENDING'
                        }
                    });
                    savedProducts.push(newProduct);
                }
            } catch (error) {
                logger.error(`Error saving product ${productData.title}:`, error);
                errors.push({
                    product: productData.title,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        res.json({
            success: true,
            data: {
                saved: savedProducts.length,
                errors: errors.length,
                details: errors
            },
            message: `Saved ${savedProducts.length} products, ${errors.length} errors`
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 更新产品状态
 */
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { importStatus } = req.body;

        if (!['pending', 'imported', 'failed'].includes(importStatus)) {
            res.status(400).json({
                success: false,
                error: 'Invalid import status'
            });
            return;
        }

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: {
                importStatus: importStatus.toUpperCase(),
                lastUpdated: new Date()
            }
        });

        res.json({
            success: true,
            data: product,
            message: 'Product status updated'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 删除产品
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.product.delete({
            where: { id: req.params.id }
        });

        res.json({
            success: true,
            message: 'Product deleted'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 批量操作
 */
router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, productIds } = req.body;

        if (!action || !productIds || !Array.isArray(productIds)) {
            res.status(400).json({
                success: false,
                error: 'Action and product IDs are required'
            });
            return;
        }

        let result;

        switch (action) {
            case 'delete':
                result = await prisma.product.deleteMany({
                    where: { id: { in: productIds } }
                });
                break;

            case 'mark_imported':
                result = await prisma.product.updateMany({
                    where: { id: { in: productIds } },
                    data: {
                        importStatus: 'IMPORTED',
                        lastUpdated: new Date()
                    }
                });
                break;

            case 'mark_failed':
                result = await prisma.product.updateMany({
                    where: { id: { in: productIds } },
                    data: {
                        importStatus: 'FAILED',
                        lastUpdated: new Date()
                    }
                });
                break;

            default:
                res.status(400).json({
                    success: false,
                    error: 'Invalid action'
                });
                return;
        }

        res.json({
            success: true,
            data: result,
            message: `Bulk ${action} completed for ${result.count} products`
        });
    } catch (error) {
        next(error);
    }
});

export default router; 