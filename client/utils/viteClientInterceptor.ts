/**
 * Vite 客户端错误拦截器
 * 专门处理在 Cloudflare 隧道和 Shopify iframe 环境中的各种连接错误
 */

// 检测运行环境
const isCloudflareEnv = window.location.hostname.includes('.trycloudflare.com') ||
    window.location.hostname.includes('.amoze.cc');
const isShopifyIframe = window !== window.top ||
    window.location.search.includes('embedded=1') ||
    window.location.pathname.includes('/admin/apps/');
const isSandboxed = (() => {
    try {
        // 尝试检测沙盒环境
        return window.frameElement && window.frameElement.hasAttribute('sandbox');
    } catch (e) {
        // 跨域访问被阻止，可能在iframe中
        return true;
    }
})();

if (isCloudflareEnv || isShopifyIframe) {
    console.log('🌐 激活错误拦截器 - 环境:', isCloudflareEnv ? 'Cloudflare' : 'Shopify iframe');
}

// 需要拦截的错误模式
const errorPatterns = [
    /WebSocket.*failed/i,
    /websocket.*close/i,
    /ERR_HTTP2_PROTOCOL_ERROR/i,
    /NET::ERR_HTTP2_PROTOCOL_ERROR/i,
    /ERR_QUIC_PROTOCOL_ERROR/i,
    /NET::ERR_QUIC_PROTOCOL_ERROR/i,
    /PROTOCOL_ERROR.*websocket/i,
    /failed to connect.*vite/i,
    /node_modules\/.vite\/deps.*PROTOCOL_ERROR/i,
    /24678.*refused/i,
    /0\.0\.0\.0:24678/i,
    /connection.*reset/i,
    /ECONNRESET/i,
    /SendBeacon failed/i,
    /document\.write/i,
    /frame.*sandboxed.*allow-scripts/i,
    /Blocked script execution.*sandboxed/i,
    /Uncaught.*SecurityError.*frame.*sandboxed/i,
    /setTimeout.*handler.*took.*ms/i,
    // Shopify CDN相关错误
    /cdn\.shopify\.com.*context-slice.*metrics/i,
    /cdn\.shopify\.com.*context-slice.*graphql/i,
    /shopifycloud\/web\/assets.*vite.*client/i,
    // SendBeacon和网络相关错误
    /navigator\.sendBeacon/i,
    /beacon.*failed/i,
    /fetch.*aborted/i,
    /Failed to fetch/i
];

// 沙盒相关错误模式
const sandboxErrorPatterns = [
    /sandboxed.*allow-scripts/i,
    /Blocked script execution.*sandboxed/i,
    /SecurityError.*sandboxed/i,
    /Permission denied.*sandboxed/i,
    /document's frame is sandboxed/i,
    /the 'allow-scripts' permission is not set/i,
    /frame.*sandboxed.*allow/i
];

// Shopify特定错误模式
const shopifyErrorPatterns = [
    /context-slice-metrics.*js/i,
    /context-slice-graphql.*js/i,
    /shopifycloud.*assets.*vite/i,
    /cdn\.shopify\.com.*error/i
];

// 检查是否匹配错误模式
function matchesErrorPattern(message: string): boolean {
    return errorPatterns.some(pattern => pattern.test(message));
}

function matchesSandboxError(message: string): boolean {
    return sandboxErrorPatterns.some(pattern => pattern.test(message));
}

function matchesShopifyError(message: string): boolean {
    return shopifyErrorPatterns.some(pattern => pattern.test(message));
}

function isSendBeaconError(message: string): boolean {
    return /SendBeacon.*failed/i.test(message) ||
        /beacon.*failed/i.test(message) ||
        /navigator\.sendBeacon/i.test(message);
}

// 保存原始的控制台方法
const originalConsole = {
    error: console.error,
    warn: console.warn,
    log: console.log
};

// 重写 console.error 以过滤干扰性错误
console.error = function (...args: any[]) {
    const message = args.join(' ');

    // 处理沙盒错误
    if (matchesSandboxError(message)) {
        if (isShopifyIframe || isCloudflareEnv) {
            // 静默处理沙盒错误，它们在Shopify iframe中是正常的
            return;
        }
    }

    // 处理Shopify CDN错误
    if (matchesShopifyError(message)) {
        if (isShopifyIframe) {
            // Shopify iframe环境中的CDN错误是正常的
            return;
        }
    }

    // 处理SendBeacon错误
    if (isSendBeaconError(message)) {
        if (isShopifyIframe || isCloudflareEnv) {
            // SendBeacon在受限环境中可能失败，这是正常的
            return;
        }
    }

    // 处理其他已知错误模式
    if (matchesErrorPattern(message)) {
        if (isCloudflareEnv || isShopifyIframe) {
            // 在受限环境中静默处理
            return;
        } else {
            // 本地环境显示简化错误
            originalConsole.warn('🔄 开发服务器连接问题，请刷新页面');
            return;
        }
    }

    // 非匹配的错误正常输出
    originalConsole.error.apply(console, args);
};

// 拦截未处理的错误事件
window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message || '';
    const filename = event.filename || '';

    // 检查是否是沙盒错误
    if (matchesSandboxError(message)) {
        if (isShopifyIframe || isCloudflareEnv) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }

    // 检查是否是Shopify CDN错误
    if (matchesShopifyError(message) || filename.includes('cdn.shopify.com')) {
        if (isShopifyIframe) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }

    // 检查是否是SendBeacon错误
    if (isSendBeaconError(message)) {
        if (isShopifyIframe || isCloudflareEnv) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }

    // 检查其他错误模式
    if (matchesErrorPattern(message)) {
        if (isCloudflareEnv || isShopifyIframe) {
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }
}, true);

// 拦截未处理的 Promise 拒绝
window.addEventListener('unhandledrejection', (event) => {
    const message = String(event.reason?.message || event.reason || '');

    // 检查沙盒错误
    if (matchesSandboxError(message)) {
        if (isShopifyIframe || isCloudflareEnv) {
            event.preventDefault();
            return false;
        }
    }

    // 检查Shopify相关错误
    if (matchesShopifyError(message)) {
        if (isShopifyIframe) {
            event.preventDefault();
            return false;
        }
    }

    // 检查SendBeacon错误
    if (isSendBeaconError(message)) {
        if (isShopifyIframe || isCloudflareEnv) {
            event.preventDefault();
            return false;
        }
    }

    // 检查其他错误模式
    if (matchesErrorPattern(message)) {
        if (isCloudflareEnv || isShopifyIframe) {
            event.preventDefault();
            return false;
        }
    }
});

// 创建安全的 WebSocket 代理，避免连接失败错误
if (isCloudflareEnv || isShopifyIframe) {
    const OriginalWebSocket = window.WebSocket;

    (window as any).WebSocket = function (url: string | URL, protocols?: string | string[]) {
        const urlStr = url.toString();

        // 检查是否是 HMR WebSocket
        if (urlStr.includes('24678') || urlStr.includes('vite') || urlStr.includes('hmr')) {
            console.log('🌐 阻止HMR WebSocket连接:', urlStr);

            // 创建一个假的 WebSocket 对象以避免错误
            const fakeSocket = {
                readyState: 3, // CLOSED
                url: urlStr,
                protocol: '',
                extensions: '',
                bufferedAmount: 0,
                binaryType: 'blob' as BinaryType,
                onopen: null,
                onclose: null,
                onerror: null,
                onmessage: null,
                close: function () { /* no-op */ },
                send: function () { /* no-op */ },
                addEventListener: function () { /* no-op */ },
                removeEventListener: function () { /* no-op */ },
                dispatchEvent: function () { return false; },
                CONNECTING: 0,
                OPEN: 1,
                CLOSING: 2,
                CLOSED: 3
            };

            // 延迟触发关闭事件以避免错误
            setTimeout(() => {
                if (fakeSocket.onclose && typeof fakeSocket.onclose === 'function') {
                    const closeEvent = {
                        code: 1000,
                        reason: 'Disabled in tunnel environment',
                        wasClean: true,
                        type: 'close'
                    };
                    (fakeSocket.onclose as any)(closeEvent);
                }
            }, 1);

            return fakeSocket as any;
        }

        // 非 HMR WebSocket 正常创建
        const ws = new OriginalWebSocket(url, protocols);

        // 添加错误处理
        ws.addEventListener('error', () => {
            console.warn('WebSocket连接错误，这在隧道环境中是正常的');
        });

        return ws;
    };

    // 复制静态属性
    const WebSocketConstructor = (window as any).WebSocket;
    WebSocketConstructor.CONNECTING = 0;
    WebSocketConstructor.OPEN = 1;
    WebSocketConstructor.CLOSING = 2;
    WebSocketConstructor.CLOSED = 3;
    WebSocketConstructor.prototype = OriginalWebSocket.prototype;
}

// 针对沙盒环境的特殊处理
if (isShopifyIframe) {
    // 拦截可能导致沙盒错误的操作

    // 安全的 document.write 替代
    const originalDocumentWrite = document.write;
    document.write = function (content: string) {
        try {
            // 在沙盒环境中，document.write 可能被禁用
            if (document.readyState === 'loading') {
                // 尝试使用更安全的方法
                const div = document.createElement('div');
                div.innerHTML = content;
                document.body?.appendChild(div);
            }
        } catch (e) {
            console.warn('🔒 document.write在沙盒环境中被禁用');
        }
    };

    // 拦截可能导致沙盒错误的 eval 调用
    const originalEval = window.eval;
    window.eval = function (code: string) {
        try {
            return originalEval.call(window, code);
        } catch (e) {
            if (e instanceof Error && e.message.includes('sandboxed')) {
                console.warn('🔒 eval在沙盒环境中受限');
                return undefined;
            }
            throw e;
        }
    };
}

// 处理SendBeacon API的特殊情况
if (isShopifyIframe || isCloudflareEnv) {
    // 劫持navigator.sendBeacon以避免失败错误
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const originalSendBeacon = navigator.sendBeacon.bind(navigator);

        navigator.sendBeacon = function (url: string | URL, data?: BodyInit | null): boolean {
            try {
                return originalSendBeacon(url, data);
            } catch (error) {
                // 在受限环境中，SendBeacon可能失败，静默处理
                return false;
            }
        };
    }

    // 劫持fetch API以处理可能的沙盒限制
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>): Promise<Response> {
        return originalFetch.apply(window, args).catch((error) => {
            // 如果fetch失败且是由于沙盒限制，返回一个假的成功响应
            if (error.message?.includes('sandboxed') || error.message?.includes('Failed to fetch')) {
                return new Response('{}', {
                    status: 200,
                    statusText: 'OK',
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            throw error;
        });
    };
}

// 环境信息输出
if (isCloudflareEnv) {
    console.log('🌐 Cloudflare隧道环境检测');
}
if (isShopifyIframe) {
    console.log('🏪 Shopify iframe环境检测');
}

export { }; 