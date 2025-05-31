/**
 * Vite客户端错误拦截器
 * 在Vite客户端代码加载前就开始拦截WebSocket和HTTP2错误
 */

// 立即执行，不等待任何模块加载
(function () {
    // 检测环境
    const isCloudflareEnv = window.location.hostname.includes('.trycloudflare.com') ||
        window.location.hostname.includes('.amoze.cc');

    if (!isCloudflareEnv) {
        return; // 非Cloudflare环境不需要拦截
    }

    console.log('🌐 初始化Vite客户端错误拦截器');

    // 创建错误模式匹配器
    const errorPatterns = [
        'WebSocket',
        'websocket',
        '24678',
        '0.0.0.0:24678',
        'wss://0.0.0.0:24678',
        'ERR_HTTP2_PROTOCOL_ERROR',
        'NET::ERR_HTTP2_PROTOCOL_ERROR',
        'PROTOCOL_ERROR',
        'failed to connect to websocket',
        'WebSocket closed without opened',
        'node_modules/.vite/deps',
        'createConnection',
        'connect @',
        'client:802',
        'client:437',
        'client:811',
        'client:290',
        'client:383',
        'client:908'
    ];

    // 检查是否匹配错误模式
    function matchesErrorPattern(message: string): boolean {
        return errorPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()));
    }

    // 保存原始函数
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    // 拦截console.error
    console.error = function () {
        const message = Array.from(arguments).join(' ');
        // 检查消息内容和可能的堆栈跟踪
        if (matchesErrorPattern(message)) {
            console.debug('🌐 已静默WebSocket错误:', message.substring(0, 100) + '...');
            return; // 静默处理Vite/WebSocket错误
        }
        return originalConsoleError.apply(console, arguments as any);
    };

    // 拦截console.warn  
    console.warn = function () {
        const message = Array.from(arguments).join(' ');
        if (matchesErrorPattern(message)) {
            return; // 静默处理Vite/WebSocket警告
        }
        return originalConsoleWarn.apply(console, arguments as any);
    };

    // 拦截全局错误事件
    window.addEventListener('error', function (event) {
        const message = event.message || (event.error && event.error.message) || '';
        if (matchesErrorPattern(message)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return false;
        }
    }, true);

    // 拦截Promise rejection
    window.addEventListener('unhandledrejection', function (event) {
        const message = (event.reason && event.reason.message) || event.reason || '';
        if (typeof message === 'string' && matchesErrorPattern(message)) {
            event.preventDefault();
            return false;
        }
    }, true);

    // HTTP2协议错误通过console和事件拦截器处理，这里跳过fetch拦截

    // 劫持WebSocket构造函数
    const OriginalWebSocket = window.WebSocket;

    (window as any).WebSocket = function (url: string | URL, protocols?: string | string[]) {
        const urlStr = url.toString();

        // 如果是Vite HMR WebSocket，返回一个模拟对象
        if (urlStr.includes('24678') || urlStr.includes('0.0.0.0')) {
            console.debug('🌐 阻止Vite HMR WebSocket连接');

            // 创建一个模拟的WebSocket对象
            const mockWebSocket = {
                readyState: 3, // CLOSED
                url: urlStr,
                protocol: '',
                extensions: '',
                bufferedAmount: 0,
                binaryType: 'blob' as BinaryType,
                close: function () { },
                send: function () { },
                addEventListener: function () { },
                removeEventListener: function () { },
                dispatchEvent: function () { return false; },
                onopen: null as any,
                onclose: null as any,
                onerror: null as any,
                onmessage: null as any,
                CONNECTING: 0,
                OPEN: 1,
                CLOSING: 2,
                CLOSED: 3
            };

            // 延迟触发close事件
            setTimeout(() => {
                if (typeof mockWebSocket.onclose === 'function') {
                    const closeEvent = {
                        code: 1000,
                        reason: 'Blocked in Cloudflare environment',
                        wasClean: true,
                        type: 'close'
                    };
                    mockWebSocket.onclose(closeEvent as any);
                }
            }, 100);

            return mockWebSocket as any;
        }

        // 非HMR WebSocket正常创建
        return new OriginalWebSocket(url, protocols);
    };

    // 复制静态属性（使用Object.defineProperty避免只读错误）
    const WebSocketConstructor = (window as any).WebSocket;
    Object.defineProperty(WebSocketConstructor, 'CONNECTING', { value: 0 });
    Object.defineProperty(WebSocketConstructor, 'OPEN', { value: 1 });
    Object.defineProperty(WebSocketConstructor, 'CLOSING', { value: 2 });
    Object.defineProperty(WebSocketConstructor, 'CLOSED', { value: 3 });
    WebSocketConstructor.prototype = OriginalWebSocket.prototype;

    console.log('✅ Vite客户端错误拦截器已激活');
})();

export { }; // 确保这是一个模块 