/**
 * Shopify iframe环境错误处理器
 * 专门处理iframe沙盒环境中的各种限制和错误
 */

// 错误统计
interface ErrorStats {
    sandboxErrors: number;
    sendBeaconErrors: number;
    fetchErrors: number;
    scriptBlockedErrors: number;
    total: number;
}

class ShopifyIframeHandler {
    private errorStats: ErrorStats = {
        sandboxErrors: 0,
        sendBeaconErrors: 0,
        fetchErrors: 0,
        scriptBlockedErrors: 0,
        total: 0
    };

    private isShopifyIframe: boolean;
    private hasNotifiedUser: boolean = false;

    constructor() {
        this.isShopifyIframe = this.detectShopifyIframe();

        if (this.isShopifyIframe) {
            this.initialize();
            console.log('🏪 Shopify iframe环境检测，激活错误过滤器');
        }
    }

    private detectShopifyIframe(): boolean {
        try {
            return (
                window !== window.top ||
                window.location.search.includes('embedded=1') ||
                window.location.pathname.includes('/admin/apps/') ||
                document.referrer.includes('shopify.com') ||
                window.location.hostname.includes('shopify')
            );
        } catch {
            // 跨域访问被阻止，很可能在iframe中
            return true;
        }
    }

    private initialize(): void {
        this.interceptSandboxErrors();
        this.interceptNetworkAPIs();
        this.setupGlobalErrorHandlers();
        this.monitorErrorPatterns();
    }

    private interceptSandboxErrors(): void {
        // 劫持可能导致沙盒错误的全局方法
        const self = this;

        // 安全的setTimeout包装
        const originalSetTimeout = window.setTimeout;
        (window as any).setTimeout = function (callback: any, delay?: number): any {
            try {
                return originalSetTimeout(callback, delay || 0);
            } catch (error) {
                if (error instanceof Error && error.message.includes('sandboxed')) {
                    self.recordError('sandboxErrors');
                    return 0; // 返回一个虚拟的timer ID
                }
                throw error;
            }
        };

        // 安全的setInterval包装
        const originalSetInterval = window.setInterval;
        (window as any).setInterval = function (callback: any, delay?: number): any {
            try {
                return originalSetInterval(callback, delay || 0);
            } catch (error) {
                if (error instanceof Error && error.message.includes('sandboxed')) {
                    self.recordError('sandboxErrors');
                    return 0;
                }
                throw error;
            }
        };

        // 安全的requestAnimationFrame包装
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        window.requestAnimationFrame = function (callback: FrameRequestCallback): number {
            try {
                return originalRequestAnimationFrame.call(window, callback);
            } catch (error) {
                if (error instanceof Error && error.message.includes('sandboxed')) {
                    self.recordError('sandboxErrors');
                    return 0;
                }
                throw error;
            }
        };
    }

    private interceptNetworkAPIs(): void {
        const self = this;

        // 增强SendBeacon拦截
        if (navigator.sendBeacon) {
            const originalSendBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
                try {
                    return originalSendBeacon(url, data);
                } catch (error) {
                    self.recordError('sendBeaconErrors');
                    // 在Shopify iframe中，SendBeacon失败是常见的
                    return false;
                }
            };
        }

        // XMLHttpRequest拦截
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null) {
            try {
                return originalXHROpen.call(this, method, url, async ?? true, user, password);
            } catch (error) {
                if (error instanceof Error && error.message.includes('sandboxed')) {
                    self.recordError('fetchErrors');
                    // 创建一个假的XHR对象
                    Object.defineProperty(this, 'readyState', { value: 4, writable: false });
                    Object.defineProperty(this, 'status', { value: 200, writable: false });
                    Object.defineProperty(this, 'responseText', { value: '{}', writable: false });
                    return;
                }
                throw error;
            }
        };
    }

    private setupGlobalErrorHandlers(): void {
        const self = this;

        // 专门的沙盒错误过滤器
        window.addEventListener('error', (event) => {
            const message = event.message || '';
            const filename = event.filename || '';

            // 识别Shopify相关的沙盒错误
            if (this.isShopifySandboxError(message, filename)) {
                self.recordError('scriptBlockedErrors');
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        }, true);

        // Promise rejection过滤器
        window.addEventListener('unhandledrejection', (event) => {
            const reason = String(event.reason?.message || event.reason || '');

            if (this.isShopifySandboxError(reason)) {
                self.recordError('scriptBlockedErrors');
                event.preventDefault();
                return false;
            }
        });
    }

    private isShopifySandboxError(message: string, filename?: string): boolean {
        const isSandboxMessage = (
            message.includes('sandboxed') ||
            message.includes('allow-scripts') ||
            message.includes('Blocked script execution') ||
            message.includes("document's frame is sandboxed") ||
            message.includes('Permission denied')
        );

        const isShopifyScript = filename ? (
            filename.includes('cdn.shopify.com') ||
            filename.includes('shopifycloud') ||
            filename.includes('context-slice')
        ) : false;

        return isSandboxMessage || isShopifyScript;
    }

    private monitorErrorPatterns(): void {
        // 监控控制台输出，过滤已知的Shopify错误模式
        const originalConsoleError = console.error;
        const originalConsoleWarn = console.warn;
        const self = this;

        console.error = function (...args: any[]) {
            const message = args.join(' ');

            if (self.isShopifySandboxError(message)) {
                self.recordError('scriptBlockedErrors');
                return; // 静默处理
            }

            if (message.includes('SendBeacon') && message.includes('failed')) {
                self.recordError('sendBeaconErrors');
                return; // 静默处理
            }

            // 其他错误正常输出
            originalConsoleError.apply(console, args);
        };

        console.warn = function (...args: any[]) {
            const message = args.join(' ');

            if (self.isShopifySandboxError(message)) {
                self.recordError('scriptBlockedErrors');
                return; // 静默处理
            }

            // 其他警告正常输出
            originalConsoleWarn.apply(console, args);
        };
    }

    private recordError(type: keyof Omit<ErrorStats, 'total'>): void {
        this.errorStats[type]++;
        this.errorStats.total++;

        // 如果错误太多，显示用户友好的提示
        if (!this.hasNotifiedUser && this.errorStats.total > 10) {
            this.showUserNotification();
            this.hasNotifiedUser = true;
        }
    }

    private showUserNotification(): void {
        // 显示一个不干扰的通知，告知用户当前环境状态
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f0f9ff;
            color: #1e40af;
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid #3b82f6;
            font-size: 12px;
            max-width: 300px;
            z-index: 10000;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>🏪</span>
                <div>
                    <strong>Shopify安全模式</strong><br>
                    应用在Shopify iframe中运行<br>
                    <small style="color: #6b7280;">某些API限制为正常现象</small>
                </div>
            </div>
        `;

        document.body.appendChild(notification);

        // 淡入效果
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 100);

        // 5秒后自动消失
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    // 公共方法
    public getErrorStats(): ErrorStats {
        return { ...this.errorStats };
    }

    public isInShopifyIframe(): boolean {
        return this.isShopifyIframe;
    }

    public clearStats(): void {
        this.errorStats = {
            sandboxErrors: 0,
            sendBeaconErrors: 0,
            fetchErrors: 0,
            scriptBlockedErrors: 0,
            total: 0
        };
        this.hasNotifiedUser = false;
    }
}

// 创建全局实例
let shopifyIframeHandler: ShopifyIframeHandler | null = null;

export const initShopifyIframeHandler = (): ShopifyIframeHandler => {
    if (!shopifyIframeHandler) {
        shopifyIframeHandler = new ShopifyIframeHandler();
    }
    return shopifyIframeHandler;
};

export const getShopifyIframeHandler = (): ShopifyIframeHandler | null => {
    return shopifyIframeHandler;
};

// 自动初始化
if (typeof window !== 'undefined') {
    initShopifyIframeHandler();
}

export { ShopifyIframeHandler }; 