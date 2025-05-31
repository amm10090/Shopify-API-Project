import { Router, Request, Response, NextFunction } from 'express';
import { verifyShopifySession } from '@server/routes/auth';
import { WebhookService } from '@server/services/WebhookService';
import { logger } from '@server/utils/logger';
import { prisma } from '@server/index';

const router = Router();
const webhookService = new WebhookService();

// 应用会话验证中间件到所有路由
router.use(verifyShopifySession);

/**
 * 注册webhooks
 * POST /api/webhook-management/register
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Webhook registration requested for shop: ${session.shop}`);

        const results = await webhookService.registerWebhooks(session);

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        res.json({
            success: failureCount === 0,
            data: {
                total: results.length,
                successful: successCount,
                failed: failureCount,
                results: results
            },
            message: failureCount === 0
                ? `Successfully registered ${successCount} webhooks`
                : `Registered ${successCount} webhooks, ${failureCount} failed`
        });

    } catch (error) {
        logger.error('Error in webhook registration:', error);
        next(error);
    }
});

/**
 * 列出当前webhooks
 * GET /api/webhook-management/list
 */
router.get('/list', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Webhook list requested for shop: ${session.shop}`);

        const webhooks = await webhookService.listWebhooks(session);

        res.json({
            success: true,
            data: {
                count: webhooks.length,
                webhooks: webhooks
            }
        });

    } catch (error) {
        logger.error('Error listing webhooks:', error);
        next(error);
    }
});

/**
 * 验证webhook配置
 * GET /api/webhook-management/validate
 */
router.get('/validate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Webhook validation requested for shop: ${session.shop}`);

        const validation = await webhookService.validateWebhookConfiguration(session);

        res.json({
            success: true,
            data: validation,
            message: validation.isValid
                ? 'Webhook configuration is valid'
                : `Found ${validation.missingWebhooks.length} missing webhooks and ${validation.issues.length} issues`
        });

    } catch (error) {
        logger.error('Error validating webhooks:', error);
        next(error);
    }
});

/**
 * 修复webhook配置
 * POST /api/webhook-management/repair
 */
router.post('/repair', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Webhook repair requested for shop: ${session.shop}`);

        const repairResult = await webhookService.repairWebhookConfiguration(session);

        res.json({
            success: repairResult.success,
            data: repairResult,
            message: repairResult.success
                ? `Successfully repaired ${repairResult.repaired.length} webhooks`
                : `Repaired ${repairResult.repaired.length} webhooks, ${repairResult.errors.length} errors occurred`
        });

    } catch (error) {
        logger.error('Error repairing webhooks:', error);
        next(error);
    }
});

/**
 * 删除特定webhook
 * DELETE /api/webhook-management/:webhookId
 */
router.delete('/:webhookId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { webhookId } = req.params;
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Webhook deletion requested for shop: ${session.shop}, webhookId: ${webhookId}`);

        const success = await webhookService.deleteWebhook(session, webhookId);

        res.json({
            success,
            message: success
                ? 'Webhook deleted successfully'
                : 'Failed to delete webhook'
        });

    } catch (error) {
        logger.error('Error deleting webhook:', error);
        next(error);
    }
});

/**
 * 获取webhook状态概览
 * GET /api/webhook-management/status
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Webhook status requested for shop: ${session.shop}`);

        // 获取webhooks列表和验证结果
        const [webhooks, validation] = await Promise.all([
            webhookService.listWebhooks(session),
            webhookService.validateWebhookConfiguration(session)
        ]);

        // 分析webhook状态
        const requiredWebhooks = ['products/delete', 'products/update', 'app/uninstalled'];
        const webhookStatus = requiredWebhooks.map(topic => {
            const webhook = webhooks.find(w => w.topic === topic);
            return {
                topic,
                configured: !!webhook,
                webhook: webhook || null,
                required: true
            };
        });

        // 找到额外配置的webhooks（不在必需列表中的）
        const extraWebhooks = webhooks.filter(w => !requiredWebhooks.includes(w.topic));

        const status = {
            shop: session.shop,
            totalWebhooks: webhooks.length,
            requiredWebhooks: requiredWebhooks.length,
            configuredRequired: webhookStatus.filter(w => w.configured).length,
            missingRequired: validation.missingWebhooks.length,
            extraWebhooks: extraWebhooks.length,
            isValid: validation.isValid,
            lastChecked: new Date().toISOString(),
            webhookDetails: webhookStatus,
            extraWebhookDetails: extraWebhooks,
            issues: validation.issues
        };

        res.json({
            success: true,
            data: status,
            message: validation.isValid
                ? 'All required webhooks are properly configured'
                : `${validation.missingWebhooks.length} required webhooks missing, ${validation.issues.length} issues found`
        });

    } catch (error) {
        logger.error('Error getting webhook status:', error);
        next(error);
    }
});

/**
 * 测试产品删除webhook功能
 * POST /api/webhook-management/test-deletion
 */
router.post('/test-deletion', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shopifyProductId } = req.body;
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        if (!shopifyProductId) {
            res.status(400).json({
                success: false,
                error: 'Shopify Product ID is required'
            });
            return;
        }

        logger.info(`Testing product deletion webhook for product: ${shopifyProductId}, shop: ${session.shop}`);

        // 1. 检查产品是否存在于数据库
        const existingProducts = await prisma.product.findMany({
            where: {
                shopifyProductId: shopifyProductId.toString()
            },
            include: {
                brand: true
            }
        });

        if (existingProducts.length === 0) {
            res.json({
                success: false,
                message: `No products found in database with Shopify ID: ${shopifyProductId}`,
                suggestion: 'Make sure the product has been imported first'
            });
            return;
        }

        // 2. 检查产品是否在Shopify中存在
        const { ShopifyService } = await import('../services/ShopifyService');
        const shopifyService = new ShopifyService();

        let shopifyExists = false;
        try {
            const checkResult = await shopifyService.checkProductExists(session, shopifyProductId);
            shopifyExists = checkResult.exists;
        } catch (error) {
            logger.warn(`Could not check Shopify product existence: ${error}`);
        }

        // 3. 模拟webhook删除处理
        let simulationResults = [];
        for (const product of existingProducts) {
            try {
                await prisma.product.update({
                    where: { id: product.id },
                    data: {
                        shopifyProductId: null,
                        importStatus: 'PENDING',
                        lastUpdated: new Date()
                    }
                });

                simulationResults.push({
                    productId: product.id,
                    title: product.title,
                    brand: product.brand?.name,
                    success: true,
                    message: 'Successfully updated to PENDING status'
                });

                logger.info(`Test: Updated product ${product.id} status to PENDING`);
            } catch (error) {
                simulationResults.push({
                    productId: product.id,
                    title: product.title,
                    brand: product.brand?.name,
                    success: false,
                    message: `Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
            }
        }

        res.json({
            success: true,
            message: 'Product deletion webhook test completed',
            data: {
                shopifyProductId,
                shopifyExists,
                databaseProducts: existingProducts.length,
                results: simulationResults,
                summary: {
                    total: simulationResults.length,
                    successful: simulationResults.filter(r => r.success).length,
                    failed: simulationResults.filter(r => !r.success).length
                }
            }
        });

    } catch (error) {
        logger.error('Error in webhook deletion test:', error);
        next(error);
    }
});

/**
 * 检查webhook配置诊断
 * GET /api/webhook-management/diagnose
 */
router.get('/diagnose', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Running webhook diagnostics for shop: ${session.shop}`);

        const diagnostics = {
            shop: session.shop,
            timestamp: new Date().toISOString(),
            checks: [] as Array<{
                check: string;
                status: 'pass' | 'fail' | 'warning';
                message: string;
                details?: any;
            }>
        };

        // 1. 检查webhook列表
        let webhooks = [];
        try {
            webhooks = await webhookService.listWebhooks(session);
            diagnostics.checks.push({
                check: 'Webhook List Access',
                status: 'pass',
                message: `Successfully retrieved ${webhooks.length} webhooks`
            });
        } catch (error) {
            diagnostics.checks.push({
                check: 'Webhook List Access',
                status: 'fail',
                message: `Failed to retrieve webhooks: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
        }

        // 2. 检查必需的webhook
        const requiredWebhooks = ['products/delete', 'products/update', 'app/uninstalled'];
        const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';

        for (const requiredTopic of requiredWebhooks) {
            const webhook = webhooks.find(w => w.topic === requiredTopic);
            const expectedEndpoint = `${appUrl}/api/webhooks/${requiredTopic}`;

            if (!webhook) {
                diagnostics.checks.push({
                    check: `Required Webhook: ${requiredTopic}`,
                    status: 'fail',
                    message: 'Webhook not registered',
                    details: { expectedEndpoint }
                });
            } else if (webhook.address !== expectedEndpoint) {
                diagnostics.checks.push({
                    check: `Required Webhook: ${requiredTopic}`,
                    status: 'warning',
                    message: 'Webhook endpoint mismatch',
                    details: {
                        current: webhook.address,
                        expected: expectedEndpoint
                    }
                });
            } else {
                diagnostics.checks.push({
                    check: `Required Webhook: ${requiredTopic}`,
                    status: 'pass',
                    message: 'Webhook properly configured',
                    details: {
                        id: webhook.id,
                        address: webhook.address,
                        format: webhook.format
                    }
                });
            }
        }

        // 3. 检查环境配置
        const hasWebhookSecret = !!(process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET);
        diagnostics.checks.push({
            check: 'Webhook Secret Configuration',
            status: hasWebhookSecret ? 'pass' : 'fail',
            message: hasWebhookSecret ? 'Webhook secret is configured' : 'Missing SHOPIFY_WEBHOOK_SECRET or SHOPIFY_API_SECRET'
        });

        // 4. 检查应用URL配置
        diagnostics.checks.push({
            check: 'Application URL Configuration',
            status: 'pass',
            message: `Application URL: ${appUrl}`,
            details: {
                appUrl,
                source: process.env.SHOPIFY_APP_URL ? 'SHOPIFY_APP_URL' :
                    process.env.APPLICATION_URL ? 'APPLICATION_URL' : 'default'
            }
        });

        // 5. 检查数据库中有Shopify ID的产品
        const productsWithShopifyId = await prisma.product.count({
            where: {
                shopifyProductId: { not: null }
            }
        });

        diagnostics.checks.push({
            check: 'Products with Shopify ID',
            status: productsWithShopifyId > 0 ? 'pass' : 'warning',
            message: `Found ${productsWithShopifyId} products with Shopify IDs`,
            details: { count: productsWithShopifyId }
        });

        // 6. 统计结果
        const passCount = diagnostics.checks.filter(c => c.status === 'pass').length;
        const failCount = diagnostics.checks.filter(c => c.status === 'fail').length;
        const warningCount = diagnostics.checks.filter(c => c.status === 'warning').length;

        const overallStatus = failCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass';

        res.json({
            success: true,
            data: {
                ...diagnostics,
                summary: {
                    overallStatus,
                    totalChecks: diagnostics.checks.length,
                    passed: passCount,
                    failed: failCount,
                    warnings: warningCount
                }
            },
            message: `Webhook diagnostics completed: ${passCount} passed, ${failCount} failed, ${warningCount} warnings`
        });

    } catch (error) {
        logger.error('Error in webhook diagnostics:', error);
        next(error);
    }
});

/**
 * 强制重新同步所有产品状态
 * POST /api/webhook-management/force-sync
 */
router.post('/force-sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = (req as any).shopifySession;

        if (!session) {
            res.status(401).json({
                success: false,
                error: 'No valid Shopify session found'
            });
            return;
        }

        logger.info(`Force sync requested for shop: ${session.shop}`);

        // 获取所有有Shopify ID的产品
        const productsWithShopifyId = await prisma.product.findMany({
            where: {
                shopifyProductId: { not: null },
                importStatus: 'IMPORTED'
            },
            include: {
                brand: true
            }
        });

        logger.info(`Found ${productsWithShopifyId.length} imported products to check`);

        const { ShopifyService } = await import('../services/ShopifyService');
        const shopifyService = new ShopifyService();

        const results = {
            checked: 0,
            stillExists: 0,
            deleted: 0,
            errors: [] as Array<{ productId: string; error: string }>
        };

        for (const product of productsWithShopifyId) {
            try {
                results.checked++;

                const checkResult = await shopifyService.checkProductExists(session, product.shopifyProductId!);

                if (checkResult.exists) {
                    results.stillExists++;
                } else {
                    // 产品在Shopify中不存在，更新状态
                    await prisma.product.update({
                        where: { id: product.id },
                        data: {
                            shopifyProductId: null,
                            importStatus: 'PENDING',
                            lastUpdated: new Date()
                        }
                    });

                    results.deleted++;

                    logger.info(`Force sync: Updated product ${product.id} status to PENDING (deleted from Shopify)`);
                }

                // 添加延迟以避免API限制
                if (results.checked % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                results.errors.push({
                    productId: product.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                logger.error(`Error checking product ${product.id}:`, error);
            }
        }

        res.json({
            success: true,
            data: results,
            message: `Force sync completed: ${results.checked} checked, ${results.deleted} marked as deleted, ${results.errors.length} errors`
        });

    } catch (error) {
        logger.error('Error in force sync:', error);
        next(error);
    }
});

export default router; 