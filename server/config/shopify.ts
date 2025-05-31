import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';

// 单例模式的Shopify API实例
let shopifyInstance: any = null;

export function getShopifyApi() {
    if (shopifyInstance) {
        return shopifyInstance;
    }

    // 初始化Shopify API（只执行一次）
    shopifyInstance = shopifyApi({
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
            'write_collections',
            'read_webhooks',
            'write_webhooks'
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

    logger.info('Shopify API initialized (singleton)');
    return shopifyInstance;
} 