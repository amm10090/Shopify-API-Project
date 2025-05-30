import { Router, Request, Response, NextFunction } from 'express';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';
import { CustomAppService } from '@server/services/CustomAppService';

const router: Router = Router();

// 初始化Shopify API
const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    adminApiAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    scopes: [
        'read_products',
        'write_products',
        'read_inventory',
        'write_inventory',
        'read_product_listings',
        'write_product_listings',
        'read_collections',
        'write_collections'
    ],
    hostName: process.env.SHOPIFY_HOST_NAME || 'localhost:3000',
    apiVersion: ApiVersion.July24,
    isEmbeddedApp: process.env.SHOPIFY_APP_TYPE === 'custom' ? false : true,
    sessionStorage: {
        async storeSession(session: Session): Promise<boolean> {
            try {
                await prisma.shopifySession.upsert({
                    where: { shop: session.shop },
                    update: {
                        accessToken: session.accessToken || '',
                        scope: session.scope || '',
                        isActive: true,
                        updatedAt: new Date()
                    },
                    create: {
                        shop: session.shop,
                        accessToken: session.accessToken || '',
                        scope: session.scope || '',
                        isActive: true
                    }
                });
                logger.info(`Session stored for shop: ${session.shop}`);
                return true;
            } catch (error) {
                logger.error('Error storing session:', error);
                return false;
            }
        },

        async loadSession(id: string): Promise<Session | undefined> {
            try {
                const sessionData = await prisma.shopifySession.findUnique({
                    where: { shop: id }
                });

                if (!sessionData || !sessionData.isActive) {
                    return undefined;
                }

                const session = new Session({
                    id: sessionData.shop,
                    shop: sessionData.shop,
                    state: '',
                    isOnline: false
                });

                session.accessToken = sessionData.accessToken;
                session.scope = sessionData.scope;

                return session;
            } catch (error) {
                logger.error('Error loading session:', error);
                return undefined;
            }
        },

        async deleteSession(id: string): Promise<boolean> {
            try {
                await prisma.shopifySession.update({
                    where: { shop: id },
                    data: { isActive: false }
                });
                logger.info(`Session deactivated for shop: ${id}`);
                return true;
            } catch (error) {
                logger.error('Error deleting session:', error);
                return false;
            }
        },

        async deleteSessions(ids: string[]): Promise<boolean> {
            try {
                await prisma.shopifySession.updateMany({
                    where: { shop: { in: ids } },
                    data: { isActive: false }
                });
                logger.info(`Sessions deactivated for shops: ${ids.join(', ')}`);
                return true;
            } catch (error) {
                logger.error('Error deleting sessions:', error);
                return false;
            }
        },

        async findSessionsByShop(shop: string): Promise<Session[]> {
            try {
                const sessions = await prisma.shopifySession.findMany({
                    where: { shop, isActive: true }
                });

                return sessions.map(sessionData => {
                    const session = new Session({
                        id: sessionData.shop,
                        shop: sessionData.shop,
                        state: '',
                        isOnline: false
                    });
                    session.accessToken = sessionData.accessToken;
                    session.scope = sessionData.scope;
                    return session;
                });
            } catch (error) {
                logger.error('Error finding sessions:', error);
                return [];
            }
        }
    }
});

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

                // 验证自定义应用配置
                const validation = await customAppService.validateCustomAppSetup();
                if (!validation.valid) {
                    res.status(401).json({
                        success: false,
                        error: 'Custom app validation failed',
                        details: validation.message
                    });
                    return;
                }

                // 将会话信息添加到请求对象
                (req as any).shopifySession = session;
                (req as any).isCustomApp = true;
                next();
                return;
            } catch (error) {
                logger.error('Custom app session creation failed:', error);
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