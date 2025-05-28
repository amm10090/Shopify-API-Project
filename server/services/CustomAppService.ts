import { Session } from '@shopify/shopify-api';
import { logger } from '@server/utils/logger';

// 定义 Shopify Shop API 响应类型
interface ShopifyShopResponse {
    shop: {
        id: number;
        name: string;
        domain: string;
    };
}

/**
 * 自定义应用服务类
 * 用于处理Shopify自定义应用的API调用
 */
export class CustomAppService {
    private accessToken: string;
    private shopDomain: string;

    constructor(accessToken?: string, shopDomain?: string) {
        this.accessToken = accessToken || process.env.SHOPIFY_ACCESS_TOKEN || '';
        this.shopDomain = shopDomain || process.env.SHOPIFY_STORE_NAME || '';

        if (!this.accessToken) {
            throw new Error('SHOPIFY_ACCESS_TOKEN is required for custom app');
        }

        if (!this.shopDomain) {
            throw new Error('SHOPIFY_STORE_NAME is required for custom app');
        }

        logger.info('CustomAppService initialized', {
            shopDomain: this.shopDomain,
            hasToken: !!this.accessToken
        });
    }

    /**
     * 创建一个模拟的Session对象用于API调用
     */
    createCustomAppSession(): Session {
        // 确保shopDomain包含.myshopify.com
        const normalizedShopDomain = this.shopDomain.includes('.myshopify.com')
            ? this.shopDomain
            : `${this.shopDomain}.myshopify.com`;

        const session = new Session({
            id: normalizedShopDomain,
            shop: normalizedShopDomain,
            state: '',
            isOnline: false
        });

        session.accessToken = this.accessToken;
        session.scope = 'read_products,write_products,read_inventory,write_inventory,read_product_listings,write_product_listings,read_collections,write_collections';

        return session;
    }

    /**
     * 验证自定义应用配置
     */
    async validateCustomAppSetup(): Promise<{ valid: boolean; message: string }> {
        try {
            const session = this.createCustomAppSession();

            // 尝试获取商店信息来验证配置
            const response = await fetch(`https://${session.shop}/admin/api/2024-07/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': this.accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json() as ShopifyShopResponse;
                logger.info('Custom app validation successful', {
                    shopName: data.shop?.name,
                    shopId: data.shop?.id
                });

                return {
                    valid: true,
                    message: `Successfully connected to ${data.shop?.name}`
                };
            } else {
                const errorText = await response.text();
                logger.error('Custom app validation failed', {
                    status: response.status,
                    error: errorText
                });

                return {
                    valid: false,
                    message: `API call failed: ${response.status} - ${errorText}`
                };
            }
        } catch (error) {
            logger.error('Custom app validation error:', error);
            return {
                valid: false,
                message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * 获取商店信息
     */
    async getShopInfo() {
        try {
            const session = this.createCustomAppSession();
            const response = await fetch(`https://${session.shop}/admin/api/2024-07/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': this.accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                return await response.json();
            } else {
                throw new Error(`Failed to get shop info: ${response.status}`);
            }
        } catch (error) {
            logger.error('Error getting shop info:', error);
            throw error;
        }
    }

    /**
     * 获取Session用于其他服务
     */
    getSession(): Session {
        return this.createCustomAppSession();
    }

    /**
     * 检查是否为自定义应用模式
     */
    static isCustomAppMode(): boolean {
        return process.env.SHOPIFY_APP_TYPE === 'custom';
    }
} 