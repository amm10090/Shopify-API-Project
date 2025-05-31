/**
 * HMR WebSocket 错误处理器
 * 处理Vite HMR在Cloudflare隧道环境下的连接问题
 */

interface HMRError {
    type: string;
    message: string;
    timestamp: Date;
}

class HMRErrorHandler {
    private errors: HMRError[] = [];
    private maxErrors = 10;
    private retryCount = 0;
    private maxRetries = 3;
    private isCloudflareEnv = false;

    constructor() {
        this.isCloudflareEnv = window.location.hostname.includes('.trycloudflare.com') ||
            window.location.hostname.includes('.amoze.cc');

        this.setupErrorHandlers();
        this.setupWebSocketErrorHandler();
    }

    private setupErrorHandlers() {
        // 捕获未处理的WebSocket错误
        window.addEventListener('error', (event) => {
            if (this.isWebSocketError(event.error) || this.isWebSocketError(event.message)) {
                this.handleWebSocketError(event.error || event.message);
                event.preventDefault(); // 阻止错误冒泡到控制台
                event.stopPropagation();
                return false;
            }
        });

        // 捕获未处理的Promise拒绝（WebSocket连接失败）
        window.addEventListener('unhandledrejection', (event) => {
            if (this.isWebSocketError(event.reason)) {
                this.handleWebSocketError(event.reason);
                event.preventDefault(); // 阻止错误输出到控制台
                return false;
            }
        });

        // 拦截console.error以过滤WebSocket错误
        this.interceptConsoleErrors();
    }

    private interceptConsoleErrors() {
        const originalConsoleError = console.error;
        const self = this;

        console.error = function (...args: any[]) {
            // 检查是否是WebSocket相关错误
            const errorMessage = args.join(' ');
            if (self.isWebSocketError({ message: errorMessage })) {
                // 在Cloudflare环境下静默处理
                if (self.isCloudflareEnv) {
                    return;
                }
                // 本地环境下显示简化的错误信息
                originalConsoleError.call(console, '🔄 HMR连接问题，请刷新页面');
                return;
            }

            // 非WebSocket错误正常输出
            originalConsoleError.apply(console, args);
        };
    }

    private setupWebSocketErrorHandler() {
        // 劫持WebSocket构造函数以添加错误处理
        const originalWebSocket = window.WebSocket;
        const self = this;

        // 创建新的WebSocket构造函数
        const NewWebSocket = function (url: string | URL, protocols?: string | string[]) {
            const ws = new originalWebSocket(url, protocols);

            // 检查是否是HMR WebSocket
            const urlStr = url.toString();
            const isHMRSocket = urlStr.includes('24678') || urlStr.includes('vite') || urlStr.includes('hmr');

            if (isHMRSocket) {
                ws.addEventListener('error', (event) => {
                    self.handleWebSocketError(new Error(`WebSocket connection failed: ${urlStr}`));
                });

                ws.addEventListener('close', (event) => {
                    if (event.code !== 1000) { // 非正常关闭
                        self.handleWebSocketError(new Error(`WebSocket closed unexpectedly: ${urlStr} (code: ${event.code})`));
                    }
                });
            }

            return ws;
        } as any;

        // 复制原始WebSocket的静态属性
        NewWebSocket.prototype = originalWebSocket.prototype;
        NewWebSocket.CONNECTING = originalWebSocket.CONNECTING;
        NewWebSocket.OPEN = originalWebSocket.OPEN;
        NewWebSocket.CLOSING = originalWebSocket.CLOSING;
        NewWebSocket.CLOSED = originalWebSocket.CLOSED;

        // 替换全局WebSocket
        (window as any).WebSocket = NewWebSocket;
    }

    private isWebSocketError(error: any): boolean {
        if (!error) return false;

        const message = error.message || error.toString();
        return message.includes('WebSocket') ||
            message.includes('websocket') ||
            message.includes('24678') ||
            message.includes('0.0.0.0:24678') ||
            message.includes('WebSocket closed without opened') ||
            message.includes('failed to connect to websocket') ||
            message.includes('ERR_HTTP2_PROTOCOL_ERROR') ||
            message.includes('NET::ERR_HTTP2_PROTOCOL_ERROR') ||
            (message.includes('failed to connect') && message.includes('vite')) ||
            (message.includes('node_modules/.vite/deps') && message.includes('PROTOCOL_ERROR'));
    }

    private handleWebSocketError(error: any) {
        this.addError({
            type: 'websocket',
            message: error.message || error.toString(),
            timestamp: new Date()
        });

        // 在Cloudflare环境下，WebSocket错误是预期的
        if (this.isCloudflareEnv) {
            console.warn('🌐 HMR WebSocket连接在Cloudflare隧道环境下不可用，这是正常现象');

            // 尝试显示用户友好的提示
            if (this.retryCount === 0) {
                this.showCloudflareNotice();
            }
        } else {
            // 本地环境下的WebSocket错误需要重试
            this.retryConnection();
        }

        this.retryCount++;
    }

    private addError(error: HMRError) {
        this.errors.push(error);
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }
    }

    private retryConnection() {
        if (this.retryCount < this.maxRetries) {
            console.log(`🔄 尝试重新连接HMR WebSocket (${this.retryCount + 1}/${this.maxRetries})`);

            setTimeout(() => {
                // 触发页面刷新以重新建立连接
                if (this.retryCount >= this.maxRetries - 1) {
                    console.warn('⚠️ HMR连接失败，建议刷新页面');
                }
            }, 2000 * (this.retryCount + 1));
        }
    }

    private showCloudflareNotice() {
        // 检查是否已经显示过提示
        const hasShownNotice = localStorage.getItem('hmr-cloudflare-notice-shown');
        if (hasShownNotice) {
            return;
        }

        // 标记已显示提示
        localStorage.setItem('hmr-cloudflare-notice-shown', 'true');

        // 创建一个不干扰的通知
        const notice = document.createElement('div');
        notice.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #f0f8ff;
            color: #1e3a8a;
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

        notice.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>🌐</span>
                <div>
                    <strong>Cloudflare隧道模式</strong><br>
                    热重载已禁用，部分协议错误为正常现象<br>
                    <small style="color: #6b7280;">手动刷新页面查看更改</small>
                </div>
            </div>
        `;

        document.body.appendChild(notice);

        // 淡入效果
        setTimeout(() => {
            notice.style.opacity = '1';
        }, 100);

        // 5秒后自动消失
        setTimeout(() => {
            notice.style.opacity = '0';
            setTimeout(() => {
                if (notice.parentNode) {
                    notice.parentNode.removeChild(notice);
                }
            }, 300);
        }, 5000);
    }

    // 公共方法
    public getErrors(): HMRError[] {
        return [...this.errors];
    }

    public clearErrors(): void {
        this.errors = [];
        this.retryCount = 0;
    }

    public isInCloudflareMode(): boolean {
        return this.isCloudflareEnv;
    }
}

// 创建全局实例
let hmrErrorHandler: HMRErrorHandler | null = null;

export const initHMRErrorHandler = (): HMRErrorHandler => {
    if (!hmrErrorHandler) {
        hmrErrorHandler = new HMRErrorHandler();
    }
    return hmrErrorHandler;
};

export const getHMRErrorHandler = (): HMRErrorHandler | null => {
    return hmrErrorHandler;
};

// 自动初始化（如果在浏览器环境中）
if (typeof window !== 'undefined') {
    initHMRErrorHandler();
} 