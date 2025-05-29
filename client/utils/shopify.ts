/**
 * Shopify相关的工具函数
 */

// 缓存店铺名称，避免重复API调用
let cachedStoreName: string | null = null;

/**
 * 从服务器API获取Shopify店铺名称
 * 从SHOPIFY_STORE_NAME环境变量中提取店铺名称（去掉.myshopify.com后缀）
 */
export const getShopifyStoreName = async (): Promise<string> => {
    // 如果已经缓存了店铺名称，直接返回
    if (cachedStoreName) {
        return cachedStoreName;
    }

    try {
        // 从设置API获取店铺配置
        const response = await fetch('/api/settings');
        const data = await response.json();

        if (data.success && data.data?.shopify?.storeName) {
            const storeName = data.data.shopify.storeName;
            // 去掉.myshopify.com后缀，只保留店铺名称
            const cleanStoreName = storeName.replace(/\.myshopify\.com$/, '');
            cachedStoreName = cleanStoreName;
            return cleanStoreName;
        }
    } catch (error) {
        console.warn('Failed to fetch store name from API, using fallback:', error);
    }

    // 回退到默认值
    const defaultStoreName = 'amm10090';
    cachedStoreName = defaultStoreName;
    return defaultStoreName;
};

/**
 * 同步版本的获取店铺名称函数（用于需要立即返回值的场景）
 * 注意：这个函数使用缓存值或默认值，不进行API调用
 */
export const getShopifyStoreNameSync = (): string => {
    return cachedStoreName || 'amm10090';
};

/**
 * 生成Shopify管理后台产品页面的URL
 * @param productId Shopify产品ID
 * @returns 完整的Shopify管理后台URL
 */
export const getShopifyProductAdminUrl = async (productId: string): Promise<string> => {
    const storeName = await getShopifyStoreName();
    return `https://admin.shopify.com/store/${storeName}/products/${productId}`;
};

/**
 * 同步版本的生成产品管理URL函数（使用缓存或默认值）
 * @param productId Shopify产品ID
 * @returns 完整的Shopify管理后台URL
 */
export const getShopifyProductAdminUrlSync = (productId: string): string => {
    const storeName = getShopifyStoreNameSync();
    return `https://admin.shopify.com/store/${storeName}/products/${productId}`;
};

/**
 * 生成Shopify管理后台主页URL
 * @returns Shopify管理后台主页URL
 */
export const getShopifyAdminUrl = async (): Promise<string> => {
    const storeName = await getShopifyStoreName();
    return `https://admin.shopify.com/store/${storeName}`;
};

/**
 * 同步版本的生成管理后台主页URL函数
 * @returns Shopify管理后台主页URL
 */
export const getShopifyAdminUrlSync = (): string => {
    const storeName = getShopifyStoreNameSync();
    return `https://admin.shopify.com/store/${storeName}`;
};

/**
 * 检查是否为有效的Shopify产品ID
 * @param productId 产品ID
 * @returns 是否为有效的产品ID
 */
export const isValidShopifyProductId = (productId: string | undefined): boolean => {
    if (!productId) return false;
    // Shopify产品ID通常是数字字符串
    return /^\d+$/.test(productId);
};