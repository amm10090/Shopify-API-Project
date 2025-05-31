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

// 验证缓存结果
interface ValidationCache {
    valid: boolean;
    message: string;
    timestamp: number;
    ttl: number; // 缓存生存时间（毫秒）
}

/**
 * 自定义应用服务类
 * 用于处理Shopify自定义应用的API调用
 */
export class CustomAppService {
    private accessToken: string;
    private shopDomain: string;
    private static validationCache: Map<string, ValidationCache> = new Map();
    private static readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
    private static readonly REQUEST_TIMEOUT = 10000; // 10秒超时

    constructor(accessToken?: string, shopDomain?: string) {
        this.accessToken = accessToken || process.env.SHOPIFY_ACCESS_TOKEN || '';
        this.shopDomain = shopDomain || process.env.SHOPIFY_STORE_NAME || '';

        if (!this.accessToken) {
            throw new Error('SHOPIFY_ACCESS_TOKEN is required for custom app');
        }

        if (!this.shopDomain) {
            throw new Error('SHOPIFY_STORE_NAME is required for custom app');
        }

        // 移除初始化日志，只在错误时打印
        // logger.info('CustomAppService initialized', {
        //     shopDomain: this.shopDomain,
        //     hasToken: !!this.accessToken
        // });
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
     * 检查缓存的验证结果
     */
    private getCachedValidation(): ValidationCache | null {
        const cacheKey = `${this.shopDomain}:${this.accessToken}`;
        const cached = CustomAppService.validationCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            return cached;
        }

        if (cached) {
            // 清理过期缓存
            CustomAppService.validationCache.delete(cacheKey);
        }

        return null;
    }

    /**
     * 设置验证结果缓存
     */
    private setCachedValidation(result: { valid: boolean; message: string }): void {
        const cacheKey = `${this.shopDomain}:${this.accessToken}`;
        CustomAppService.validationCache.set(cacheKey, {
            ...result,
            timestamp: Date.now(),
            ttl: CustomAppService.CACHE_TTL
        });
    }

    /**
     * 创建带超时的fetch请求
     */
    private async fetchWithTimeout(url: string, options: RequestInit, timeout: number = CustomAppService.REQUEST_TIMEOUT): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    }

    /**
     * 验证自定义应用配置（带缓存）
     */
    async validateCustomAppSetup(): Promise<{ valid: boolean; message: string }> {
        // 首先检查缓存
        const cached = this.getCachedValidation();
        if (cached) {
            return { valid: cached.valid, message: cached.message };
        }

        try {
            const session = this.createCustomAppSession();

            // 使用带超时的fetch请求
            const response = await this.fetchWithTimeout(
                `https://${session.shop}/admin/api/2024-07/shop.json`,
                {
                    headers: {
                        'X-Shopify-Access-Token': this.accessToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json() as ShopifyShopResponse;
                const result = {
                    valid: true,
                    message: `Successfully connected to ${data.shop?.name}`
                };

                // 缓存成功结果
                this.setCachedValidation(result);
                return result;
            } else {
                const errorText = await response.text();
                const result = {
                    valid: false,
                    message: `API call failed: ${response.status} - ${errorText}`
                };

                // 不缓存失败结果，允许快速重试
                logger.warn('Custom app validation failed', {
                    status: response.status,
                    shop: this.shopDomain
                });

                return result;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // 对于网络超时错误，使用警告级别而不是错误级别
            if (errorMessage.includes('timeout') || errorMessage.includes('fetch failed')) {
                logger.warn('Custom app validation timeout:', {
                    shop: this.shopDomain,
                    error: errorMessage
                });
            } else {
                logger.error('Custom app validation error:', error);
            }

            return {
                valid: false,
                message: `Validation error: ${errorMessage}`
            };
        }
    }

    /**
     * 快速验证（仅检查缓存，不发起网络请求）
     */
    validateCustomAppSetupCached(): { valid: boolean; message: string } | null {
        const cached = this.getCachedValidation();
        if (cached) {
            return { valid: cached.valid, message: cached.message };
        }
        return null;
    }

    /**
     * 获取商店信息
     */
    async getShopInfo() {
        try {
            const session = this.createCustomAppSession();
            const response = await this.fetchWithTimeout(
                `https://${session.shop}/admin/api/2024-07/shop.json`,
                {
                    headers: {
                        'X-Shopify-Access-Token': this.accessToken,
                        'Content-Type': 'application/json'
                    }
                }
            );

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

    /**
     * 清理验证缓存
     */
    static clearValidationCache(): void {
        CustomAppService.validationCache.clear();
    }
} 