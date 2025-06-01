/**
 * Shopify App Bridge 初始化和配置
 */

// 扩展window类型定义
declare global {
    interface Window {
        ShopifyAnalytics?: any;
        Shopify?: any;
        shopifyConfig?: {
            apiKey: string;
            shop: string;
            host: string;
            embedded: boolean;
            appType: string;
            isCustomApp: boolean;
            skipAppBridge: boolean;
        };
    }
}

export interface AppBridgeConfig {
    apiKey: string;
    shop: string;
    host: string;
    embedded: boolean;
}

// 检查 App Bridge 是否可用
export const isAppBridgeAvailable = (): boolean => {
    try {
        return typeof window !== 'undefined' &&
            typeof document !== 'undefined' &&
            window.location.search.includes('shop=');
    } catch (e) {
        return false;
    }
};

// 检查是否应该加载 App Bridge
export const shouldLoadAppBridge = (): boolean => {
    try {
        // 检查环境配置
        const config = window.shopifyConfig;
        if (config?.skipAppBridge || config?.isCustomApp || config?.appType === 'custom') {
            return false;
        }

        // 检查URL参数 - 是否包含appType=custom参数
        if (window.location.search.includes('appType=custom')) {
            return false;
        }

        // 检查iframe环境
        const isInIframe = window !== window.top;
        const hasShopParam = window.location.search.includes('shop=');
        const hasHostParam = window.location.search.includes('host=');

        // 在localhost上，如果不是嵌入在iframe中，则不加载AppBridge
        if (window.location.hostname === 'localhost' && !isInIframe) {
            return false;
        }

        return isInIframe && hasShopParam && hasHostParam;
    } catch (error) {
        // 减少日志输出，只在开发环境记录错误
        if (process.env.NODE_ENV === 'development') {
            console.warn('App Bridge availability check failed:', error);
        }
        return false;
    }
};

// 初始化 App Bridge（异步）
export const initAppBridge = async (): Promise<any> => {
    if (!shouldLoadAppBridge()) {
        // 减少日志输出，只在开发环境输出日志
        if (process.env.NODE_ENV === 'development') {
            console.log('🔄 跳过App Bridge初始化 - 自定义应用或非iframe环境');
        }
        return null;
    }

    try {
        // 减少日志输出，只在开发环境输出初始化日志
        if (process.env.NODE_ENV === 'development') {
            console.log('🏪 开始初始化Shopify App Bridge...');
        }

        // 获取配置
        const config = getAppBridgeConfig();
        if (!config) {
            throw new Error('App Bridge配置无效');
        }

        // 动态导入App Bridge以避免沙盒错误
        const { createApp } = await import('@shopify/app-bridge');

        // 创建App Bridge实例
        const app = createApp({
            apiKey: config.apiKey,
            host: config.host,
            forceRedirect: true
        });

        // 减少日志输出，只在开发环境输出成功日志
        if (process.env.NODE_ENV === 'development') {
            console.log('✅ App Bridge初始化成功');
        }
        return app;

    } catch (error) {
        // 在生产环境中减少错误日志
        if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ App Bridge初始化失败:', error);
        }

        // 在沙盒环境中，App Bridge可能无法正常工作
        // 这是正常现象，我们可以静默处理
        if (error instanceof Error && error.message.includes('sandboxed')) {
            if (process.env.NODE_ENV === 'development') {
                console.log('🔒 检测到沙盒环境，跳过App Bridge');
            }
            return null;
        }

        throw error;
    }
};

// 获取 App Bridge 配置
export const getAppBridgeConfig = (): AppBridgeConfig | null => {
    try {
        // 从服务器注入的配置获取
        const serverConfig = window.shopifyConfig;
        if (serverConfig && serverConfig.shop && serverConfig.apiKey) {
            return {
                apiKey: serverConfig.apiKey,
                shop: serverConfig.shop,
                host: serverConfig.host,
                embedded: serverConfig.embedded
            };
        }

        // 从URL参数获取（备用方案）
        const urlParams = new URLSearchParams(window.location.search);
        const shop = urlParams.get('shop');
        const host = urlParams.get('host');

        if (!shop || !host) {
            return null;
        }

        return {
            apiKey: process.env.REACT_APP_SHOPIFY_API_KEY || '',
            shop,
            host,
            embedded: true
        };
    } catch (error) {
        console.warn('获取App Bridge配置失败:', error);
        return null;
    }
};

// 处理 SendBeacon 错误
export const handleSendBeacon = (): void => {
    // 拦截和处理navigator.sendBeacon错误
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const originalSendBeacon = navigator.sendBeacon.bind(navigator);

        navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
            try {
                return originalSendBeacon(url, data);
            } catch (error) {
                // 在某些环境中SendBeacon可能失败，这是正常的
                console.debug('SendBeacon调用被静默处理');
                return false;
            }
        };
    }
};

// 初始化错误处理
export const initErrorHandling = (): void => {
    // 处理SendBeacon错误
    handleSendBeacon();

    // 添加全局错误处理器，专门处理App Bridge相关错误
    window.addEventListener('error', (event) => {
        const message = event.message || '';

        // App Bridge相关错误
        if (message.includes('App Bridge') ||
            message.includes('Shopify') ||
            message.includes('sendBeacon') ||
            message.includes('sandboxed')) {

            // 只在开发环境输出调试信息
            if (process.env.NODE_ENV === 'development') {
                console.debug('App Bridge相关错误被静默处理:', message);
            }
            event.preventDefault();
            return false;
        }
    }, true);

    // 处理未捕获的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
        const message = String(event.reason?.message || event.reason || '');

        if (message.includes('App Bridge') ||
            message.includes('sendBeacon') ||
            message.includes('sandboxed')) {

            // 只在开发环境输出调试信息
            if (process.env.NODE_ENV === 'development') {
                console.debug('App Bridge Promise拒绝被静默处理:', message);
            }
            event.preventDefault();
            return false;
        }
    });

    // 只在开发环境输出初始化成功信息
    if (process.env.NODE_ENV === 'development') {
        console.log('✅ App Bridge错误处理已初始化');
    }
}; 