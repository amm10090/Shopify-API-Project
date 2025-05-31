// App Bridge 安全初始化工具

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

export const isAppBridgeAvailable = (): boolean => {
    return typeof window !== 'undefined' &&
        'shopifyApp' in window &&
        typeof (window as any).shopifyApp === 'object';
};

export const shouldLoadAppBridge = (): boolean => {
    // 检查是否在Shopify环境中
    const urlParams = new URLSearchParams(window.location.search);
    const hasShop = urlParams.has('shop') || urlParams.get('shop');
    const hasHost = urlParams.has('host') || urlParams.get('host');

    // 检查服务器注入的配置
    const config = window.shopifyConfig;
    const hasConfig = config && config.shop && config.shop !== '%SHOP%';

    // 如果是自定义应用，不需要App Bridge
    if (config?.isCustomApp || config?.skipAppBridge) {
        console.log('Skipping App Bridge for custom app');
        return false;
    }

    return !!(hasShop && hasHost) || !!hasConfig;
};

export const initAppBridge = async (): Promise<any> => {
    if (!shouldLoadAppBridge()) {
        console.log('App Bridge not needed');
        return null;
    }

    // 等待App Bridge脚本加载
    let attempts = 0;
    const maxAttempts = 30; // 3秒超时

    while (!isAppBridgeAvailable() && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!isAppBridgeAvailable()) {
        console.warn('App Bridge not available after timeout');
        return null;
    }

    try {
        const config = getAppBridgeConfig();
        if (!config) {
            console.warn('App Bridge config not available');
            return null;
        }

        const { createApp } = (window as any).shopifyApp;

        const app = createApp({
            apiKey: config.apiKey,
            shop: config.shop,
            host: config.host,
            forceRedirect: true
        });

        console.log('App Bridge initialized successfully');
        return app;
    } catch (error) {
        console.error('Failed to initialize App Bridge:', error);
        return null;
    }
};

export const getAppBridgeConfig = (): AppBridgeConfig | null => {
    const urlParams = new URLSearchParams(window.location.search);
    const config = window.shopifyConfig;

    // 优先使用服务器注入的配置
    if (config && config.shop && config.shop !== '%SHOP%') {
        return {
            apiKey: config.apiKey,
            shop: config.shop,
            host: config.host,
            embedded: config.embedded
        };
    }

    // 回退到URL参数
    const shop = urlParams.get('shop');
    const host = urlParams.get('host');
    const apiKey = urlParams.get('api_key') || config?.apiKey;

    if (shop && host && apiKey) {
        return {
            apiKey,
            shop,
            host,
            embedded: urlParams.get('embedded') !== '0'
        };
    }

    return null;
};

export const handleSendBeacon = (): void => {
    // 拦截SendBeacon错误
    const originalSendBeacon = navigator.sendBeacon;
    if (originalSendBeacon) {
        navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
            try {
                return originalSendBeacon.call(this, url, data);
            } catch (error) {
                console.warn('SendBeacon failed (suppressed):', error);
                return false;
            }
        };
    }
};

// 初始化错误处理
export const initErrorHandling = (): void => {
    // 处理SendBeacon错误
    handleSendBeacon();

    // 监听未捕获的错误
    window.addEventListener('error', (event) => {
        if (event.message?.includes('SendBeacon')) {
            event.preventDefault();
            console.warn('SendBeacon error suppressed:', event.error);
        }
    });

    // 监听未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason?.message?.includes('SendBeacon')) {
            event.preventDefault();
            console.warn('SendBeacon promise rejection suppressed:', event.reason);
        }
    });
}; 