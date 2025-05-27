import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { Brand, ApiResponse } from '../../shared/types';

const router = Router();

/**
 * 获取所有品牌
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const brands = await prisma.brand.findMany({
            include: {
                _count: {
                    select: {
                        products: true,
                        importJobs: true
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });

        const response: Brand[] = brands.map(brand => ({
            id: brand.id,
            name: brand.name,
            apiType: brand.apiType.toLowerCase() as 'cj' | 'pepperjam',
            apiId: brand.apiId,
            isActive: brand.isActive,
            lastSync: brand.lastSync || new Date()
        }));

        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 根据ID获取单个品牌
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const brand = await prisma.brand.findUnique({
            where: { id: req.params.id },
            include: {
                _count: {
                    select: {
                        products: true,
                        importJobs: true
                    }
                }
            }
        });

        if (!brand) {
            res.status(404).json({
                success: false,
                error: 'Brand not found'
            });
            return;
        }

        const response: Brand = {
            id: brand.id,
            name: brand.name,
            apiType: brand.apiType.toLowerCase() as 'cj' | 'pepperjam',
            apiId: brand.apiId,
            isActive: brand.isActive,
            lastSync: brand.lastSync || new Date()
        };

        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 创建新品牌
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, apiType, apiId, isActive = true } = req.body;

        if (!name || !apiType || !apiId) {
            res.status(400).json({
                success: false,
                error: 'Name, API type, and API ID are required'
            });
            return;
        }

        if (!['cj', 'pepperjam'].includes(apiType.toLowerCase())) {
            res.status(400).json({
                success: false,
                error: 'API type must be either "cj" or "pepperjam"'
            });
            return;
        }

        // 检查品牌名称是否已存在
        const existingBrand = await prisma.brand.findUnique({
            where: { name }
        });

        if (existingBrand) {
            res.status(409).json({
                success: false,
                error: 'Brand name already exists'
            });
            return;
        }

        const brand = await prisma.brand.create({
            data: {
                name,
                apiType: apiType.toUpperCase(),
                apiId,
                isActive
            }
        });

        const response: Brand = {
            id: brand.id,
            name: brand.name,
            apiType: brand.apiType.toLowerCase() as 'cj' | 'pepperjam',
            apiId: brand.apiId,
            isActive: brand.isActive,
            lastSync: brand.lastSync || new Date()
        };

        res.status(201).json({
            success: true,
            data: response,
            message: 'Brand created successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 更新品牌
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, apiType, apiId, isActive } = req.body;

        const existingBrand = await prisma.brand.findUnique({
            where: { id: req.params.id }
        });

        if (!existingBrand) {
            res.status(404).json({
                success: false,
                error: 'Brand not found'
            });
            return;
        }

        // 如果更新名称，检查是否与其他品牌冲突
        if (name && name !== existingBrand.name) {
            const nameConflict = await prisma.brand.findUnique({
                where: { name }
            });

            if (nameConflict) {
                res.status(409).json({
                    success: false,
                    error: 'Brand name already exists'
                });
                return;
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (apiType !== undefined) {
            if (!['cj', 'pepperjam'].includes(apiType.toLowerCase())) {
                res.status(400).json({
                    success: false,
                    error: 'API type must be either "cj" or "pepperjam"'
                });
                return;
            }
            updateData.apiType = apiType.toUpperCase();
        }
        if (apiId !== undefined) updateData.apiId = apiId;
        if (isActive !== undefined) updateData.isActive = isActive;

        const brand = await prisma.brand.update({
            where: { id: req.params.id },
            data: updateData
        });

        const response: Brand = {
            id: brand.id,
            name: brand.name,
            apiType: brand.apiType.toLowerCase() as 'cj' | 'pepperjam',
            apiId: brand.apiId,
            isActive: brand.isActive,
            lastSync: brand.lastSync || new Date()
        };

        res.json({
            success: true,
            data: response,
            message: 'Brand updated successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 删除品牌
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const brand = await prisma.brand.findUnique({
            where: { id: req.params.id },
            include: {
                _count: {
                    select: {
                        products: true,
                        importJobs: true
                    }
                }
            }
        });

        if (!brand) {
            res.status(404).json({
                success: false,
                error: 'Brand not found'
            });
            return;
        }

        // 检查是否有关联的产品
        if (brand._count.products > 0) {
            res.status(409).json({
                success: false,
                error: `Cannot delete brand with ${brand._count.products} associated products. Please delete products first.`
            });
            return;
        }

        await prisma.brand.delete({
            where: { id: req.params.id }
        });

        res.json({
            success: true,
            message: 'Brand deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 更新品牌的最后同步时间
 */
router.patch('/:id/sync', async (req, res, next) => {
    try {
        const brand = await prisma.brand.update({
            where: { id: req.params.id },
            data: { lastSync: new Date() }
        });

        const response: Brand = {
            id: brand.id,
            name: brand.name,
            apiType: brand.apiType.toLowerCase() as 'cj' | 'pepperjam',
            apiId: brand.apiId,
            isActive: brand.isActive,
            lastSync: brand.lastSync || new Date()
        };

        res.json({
            success: true,
            data: response,
            message: 'Brand sync time updated'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 获取品牌的产品统计
 */
router.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const brand = await prisma.brand.findUnique({
            where: { id: req.params.id }
        });

        if (!brand) {
            res.status(404).json({
                success: false,
                error: 'Brand not found'
            });
            return;
        }

        const [
            totalProducts,
            pendingProducts,
            importedProducts,
            failedProducts,
            recentJobs
        ] = await Promise.all([
            prisma.product.count({
                where: { brandId: req.params.id }
            }),
            prisma.product.count({
                where: { brandId: req.params.id, importStatus: 'PENDING' }
            }),
            prisma.product.count({
                where: { brandId: req.params.id, importStatus: 'IMPORTED' }
            }),
            prisma.product.count({
                where: { brandId: req.params.id, importStatus: 'FAILED' }
            }),
            prisma.importJob.findMany({
                where: { brandId: req.params.id },
                orderBy: { createdAt: 'desc' },
                take: 5
            })
        ]);

        res.json({
            success: true,
            data: {
                brand: {
                    id: brand.id,
                    name: brand.name,
                    apiType: brand.apiType.toLowerCase(),
                    isActive: brand.isActive,
                    lastSync: brand.lastSync
                },
                products: {
                    total: totalProducts,
                    pending: pendingProducts,
                    imported: importedProducts,
                    failed: failedProducts
                },
                recentJobs: recentJobs.map(job => ({
                    id: job.id,
                    status: job.status.toLowerCase(),
                    productsFound: job.productsFound,
                    productsImported: job.productsImported,
                    createdAt: job.createdAt,
                    completedAt: job.completedAt,
                    errorMessage: job.errorMessage
                }))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * 批量操作品牌
 */
router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { action, brandIds } = req.body;

        if (!action || !brandIds || !Array.isArray(brandIds)) {
            res.status(400).json({
                success: false,
                error: 'Action and brand IDs are required'
            });
            return;
        }

        let result;

        switch (action) {
            case 'activate':
                result = await prisma.brand.updateMany({
                    where: { id: { in: brandIds } },
                    data: { isActive: true }
                });
                break;

            case 'deactivate':
                result = await prisma.brand.updateMany({
                    where: { id: { in: brandIds } },
                    data: { isActive: false }
                });
                break;

            case 'update_sync':
                result = await prisma.brand.updateMany({
                    where: { id: { in: brandIds } },
                    data: { lastSync: new Date() }
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
            message: `Bulk ${action} completed for ${result.count} brands`
        });
    } catch (error) {
        next(error);
    }
});

export default router; 