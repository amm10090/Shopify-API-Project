import { Router, Request, Response, NextFunction } from 'express';
import { Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';
import { CustomAppService } from '@server/services/CustomAppService';
import { getShopifyApi } from '@server/config/shopify';

const router: Router = Router();

// 使用单例的Shopify API实例
const shopify = getShopifyApi();

/**
 * 开始OAuth认证流程
 */
router.get('/shopify', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop } = req.query;

        if (!shop || typeof shop !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Shop parameter is required'
            });
            return;
        }

        // 验证shop域名格式
        const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;

        // 生成授权URL
        const authRoute = await shopify.auth.begin({
            shop: shopDomain,
            callbackPath: '/auth/shopify/callback',
            isOnline: false,
            rawRequest: req,
            rawResponse: res
        });

        res.redirect(authRoute);

    } catch (error) {
        logger.error('Error starting Shopify auth:', error);
        next(error);
    }
});

/**
 * OAuth回调处理
 */
router.get('/shopify/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const callback = await shopify.auth.callback({
            rawRequest: req,
            rawResponse: res
        });

        const { session } = callback;

        if (!session) {
            res.status(400).json({
                success: false,
                error: 'Failed to create session'
            });
            return;
        }

        logger.info(`OAuth callback successful for shop: ${session.shop}`);

        // 在后台异步注册webhooks（不影响用户重定向）
        // 使用setTimeout确保在当前请求完成后执行
        setTimeout(async () => {
            try {
                const { WebhookService } = await import('../services/WebhookService');
                const webhookService = new WebhookService();

                logger.info(`Starting webhook registration for newly installed app: ${session.shop}`);
                const webhookResults = await webhookService.registerWebhooks(session);

                const successCount = webhookResults.filter(r => r.success).length;
                const failureCount = webhookResults.filter(r => !r.success).length;

                if (failureCount === 0) {
                    logger.info(`All webhooks registered successfully for shop: ${session.shop}`, {
                        shop: session.shop,
                        successful: successCount,
                        total: webhookResults.length
                    });
                } else {
                    logger.warn(`Some webhooks failed to register for shop: ${session.shop}`, {
                        shop: session.shop,
                        successful: successCount,
                        failed: failureCount,
                        errors: webhookResults.filter(r => !r.success).map(r => ({
                            topic: r.topic,
                            message: r.message
                        }))
                    });
                }
            } catch (webhookError) {
                logger.error(`Failed to register webhooks for shop: ${session.shop}`, {
                    shop: session.shop,
                    error: webhookError instanceof Error ? webhookError.message : webhookError
                });
            }
        }, 100); // 100ms延迟，确保响应已发送

        // 重定向到应用主页面
        const host = req.query.host;
        const redirectUrl = host
            ? `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}?host=${host}`
            : `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`;

        res.redirect(redirectUrl);

    } catch (error) {
        logger.error('Error in Shopify auth callback:', error);

        // 检查是否是权限被拒绝的错误
        if (error instanceof Error && error.message.includes('access_denied')) {
            res.redirect('/auth/error?message=access_denied');
            return;
        }

        next(error);
    }
});

/**
 * 验证会话中间件（支持自定义应用）
 */
export const verifyShopifySession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 检查是否为自定义应用模式
        if (CustomAppService.isCustomAppMode()) {
            // 自定义应用模式：直接使用配置的访问令牌
            try {
                const customAppService = new CustomAppService();
                const session = customAppService.createCustomAppSession();

                // 首先尝试从缓存获取验证结果
                const cachedValidation = customAppService.validateCustomAppSetupCached();

                if (cachedValidation) {
                    // 使用缓存的验证结果
                    if (!cachedValidation.valid) {
                        res.status(401).json({
                            success: false,
                            error: 'Custom app validation failed (cached)',
                            details: cachedValidation.message
                        });
                        return;
                    }
                } else {
                    // 缓存中没有结果，进行网络验证
                    // 但只对特定的端点进行验证，避免每个API请求都验证
                    const shouldValidate = req.path === '/auth/session' ||
                        req.path.startsWith('/api/shopify') ||
                        req.method === 'POST';

                    if (shouldValidate) {
                        const validation = await customAppService.validateCustomAppSetup();
                        if (!validation.valid) {
                            res.status(401).json({
                                success: false,
                                error: 'Custom app validation failed',
                                details: validation.message
                            });
                            return;
                        }
                    }
                    // 对于其他请求，跳过验证，直接使用session
                }

                // 将会话信息添加到请求对象
                (req as any).shopifySession = session;
                (req as any).isCustomApp = true;
                next();
                return;
            } catch (error) {
                // 对于自定义应用，配置错误通常是致命的
                if (error instanceof Error &&
                    (error.message.includes('SHOPIFY_ACCESS_TOKEN') ||
                        error.message.includes('SHOPIFY_STORE_NAME'))) {
                    logger.error('Custom app configuration error:', error);
                    res.status(500).json({
                        success: false,
                        error: 'Custom app configuration error',
                        details: 'Please check SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_NAME environment variables'
                    });
                    return;
                }

                // 对于其他错误，记录警告但允许继续
                logger.warn('Custom app session creation issue:', error);
                res.status(500).json({
                    success: false,
                    error: 'Custom app setup error',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
                return;
            }
        }

        // 原有的OAuth应用逻辑
        const sessionId = await shopify.session.getCurrentId({
            isOnline: false,
            rawRequest: req,
            rawResponse: res
        });

        if (!sessionId) {
            res.status(401).json({
                success: false,
                error: 'No session found',
                redirectUrl: '/auth/shopify'
            });
            return;
        }

        const session = await shopify.config.sessionStorage?.loadSession(sessionId);

        if (!session || !session.accessToken) {
            res.status(401).json({
                success: false,
                error: 'Invalid session',
                redirectUrl: '/auth/shopify'
            });
            return;
        }

        // 验证会话是否仍然有效
        try {
            const client = new shopify.clients.Rest({ session });
            await client.get({ path: 'shop' });
        } catch (error) {
            logger.warn(`Session validation failed for shop ${session.shop}:`, error);
            res.status(401).json({
                success: false,
                error: 'Session expired',
                redirectUrl: '/auth/shopify'
            });
            return;
        }

        // 将会话信息添加到请求对象
        (req as any).shopifySession = session;
        (req as any).isCustomApp = false;
        next();

    } catch (error) {
        logger.error('Error verifying Shopify session:', error);
        res.status(500).json({
            success: false,
            error: 'Session verification failed'
        });
    }
};

/**
 * 获取当前会话信息
 */
router.get('/session', verifyShopifySession, async (req: Request, res: Response) => {
    const session = (req as any).shopifySession;

    res.json({
        success: true,
        data: {
            shop: session.shop,
            scope: session.scope,
            isActive: true
        }
    });
});

/**
 * 应用卸载处理
 */
router.post('/uninstall', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop } = req.body;

        if (!shop) {
            res.status(400).json({
                success: false,
                error: 'Shop parameter is required'
            });
            return;
        }

        // 停用会话
        await prisma.shopifySession.updateMany({
            where: { shop },
            data: { isActive: false }
        });

        // 清理相关数据（可选）
        // 注意：根据你的业务需求决定是否删除用户数据

        logger.info(`App uninstalled for shop: ${shop}`);

        res.json({
            success: true,
            message: 'App uninstalled successfully'
        });

    } catch (error) {
        logger.error('Error handling app uninstall:', error);
        next(error);
    }
});

/**
 * 错误页面
 */
router.get('/error', (req: Request, res: Response) => {
    const message = req.query.message || 'An error occurred';

    res.status(400).json({
        success: false,
        error: message,
        message: 'Authentication failed. Please try again.'
    });
});

export default router; 