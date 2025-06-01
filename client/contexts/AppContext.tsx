import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useMemo, useCallback } from 'react';

// 定义应用状态接口
interface User {
    id: string;
    name: string;
    email: string;
    shopDomain?: string;
}

interface ShopifySession {
    shop: string;
    scope: string;
    isActive: boolean;
}

interface AppState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    toastMessage: string;
    toastActive: boolean;
    shopifySession: ShopifySession | null;
}

// 定义 Context 操作接口
interface AppActions {
    login: (user: User) => void;
    logout: () => void;
    setLoading: (loading: boolean) => void;
    showToast: (message: string) => void;
    hideToast: () => void;
    setShopifySession: (session: ShopifySession | null) => void;
}

// 完整的 Context 接口
interface AppContextType {
    state: AppState;
    actions: AppActions;
    fetch: typeof fetch; // 认证后的fetch函数
}

// 创建 Context，初始值为 undefined
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider 组件的 Props
interface AppProviderProps {
    children: ReactNode;
}

// 检测是否为自定义应用模式
const isCustomAppMode = () => {
    const windowConfig = (window as any).shopifyConfig || {};
    return windowConfig.appType === 'custom' ||
        windowConfig.isCustomApp === true ||
        windowConfig.skipAppBridge === true ||
        new URLSearchParams(window.location.search).get('appType') === 'custom' ||
        process.env.SHOPIFY_APP_TYPE === 'custom' ||
        // 如果是直接访问localhost且没有shop参数，认为是自定义应用
        (window.location.hostname === 'localhost' && !window.location.search.includes('shop='));
};

// 自定义应用的fetch函数（不需要App Bridge认证）
const createCustomAppFetch = (): typeof fetch => {
    return async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = {
            'Content-Type': 'application/json',
            ...init?.headers,
        };

        return fetch(input, {
            ...init,
            headers,
        });
    };
};

// Context Provider 组件
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    // 检测应用模式 - 只在组件初始化时执行一次
    const isCustomApp = useRef(isCustomAppMode()).current;

    // 使用useMemo缓存fetch函数，避免重新创建
    const authenticatedFetch = useMemo(() => {
        if (isCustomApp) {
            // 移除频繁的日志打印，只在开发环境打印一次
            if (process.env.NODE_ENV === 'development') {
                console.log('Custom app mode detected - using standard fetch');
            }
            return createCustomAppFetch();
        } else {
            if (process.env.NODE_ENV === 'development') {
                console.log('OAuth app mode - using standard fetch with session handling');
            }
            // 对于OAuth应用，使用标准fetch，让服务器端处理认证
            return async (input: RequestInfo | URL, init?: RequestInit) => {
                const headers = {
                    'Content-Type': 'application/json',
                    ...init?.headers,
                };

                return fetch(input, {
                    ...init,
                    headers,
                    credentials: 'include', // 包含cookie用于会话管理
                });
            };
        }
    }, [isCustomApp]); // 依赖于isCustomApp，但它是一个ref的current值，不会改变

    const [state, setState] = useState<AppState>({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        toastMessage: '',
        toastActive: false,
        shopifySession: null,
    });

    // 检查Shopify会话状态
    const checkShopifySession = useCallback(async () => {
        try {
            const response = await authenticatedFetch('/auth/session');
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    setState(prev => ({
                        ...prev,
                        shopifySession: data.data,
                        isAuthenticated: true,
                    }));
                    return true;
                }
            }
        } catch (error) {
            console.error('检查Shopify会话失败:', error);
        }
        return false;
    }, [authenticatedFetch]);

    // 初始化用户状态
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        const initializeAuth = async () => {
            try {
                setState(prev => ({ ...prev, isLoading: true }));

                if (isCustomApp) {
                    // 自定义应用模式：直接设置为已认证状态
                    const windowConfig = (window as any).shopifyConfig || {};
                    const shop = windowConfig.shop || new URLSearchParams(window.location.search).get('shop') || '';

                    setState(prev => ({
                        ...prev,
                        isAuthenticated: true,
                        shopifySession: {
                            shop: shop,
                            scope: 'custom-app',
                            isActive: true
                        },
                        user: {
                            id: 'custom-app-user',
                            name: 'Custom App User',
                            email: 'custom@app.local',
                            shopDomain: shop
                        },
                        isLoading: false
                    }));
                    return;
                }

                // OAuth应用模式：检查Shopify会话
                const hasValidSession = await checkShopifySession();

                if (!hasValidSession) {
                    // 检查URL参数以确定是否需要重定向到认证
                    const urlParams = new URLSearchParams(window.location.search);
                    const shop = urlParams.get('shop');
                    const host = urlParams.get('host');

                    if (shop) {
                        // 重定向到Shopify认证
                        console.log('Redirecting to Shopify auth for shop:', shop);
                        window.location.href = `/auth/shopify?shop=${shop}&host=${host || ''}`;
                        return;
                    }
                }

                // 检查本地存储中的用户信息（作为备选）
                const savedUser = localStorage.getItem('user');
                if (savedUser) {
                    const user = JSON.parse(savedUser);
                    setState(prev => ({
                        ...prev,
                        user,
                        isLoading: false
                    }));
                } else {
                    setState(prev => ({ ...prev, isLoading: false }));
                }
            } catch (error) {
                console.error('初始化认证失败:', error);
                setState(prev => ({ ...prev, isLoading: false }));
            }
        };

        initializeAuth();
    }, [isCustomApp, authenticatedFetch, checkShopifySession]);

    // 定义操作函数
    const actions: AppActions = useMemo(() => ({
        login: (user: User) => {
            localStorage.setItem('user', JSON.stringify(user));
            setState(prev => ({
                ...prev,
                user,
                isAuthenticated: true,
            }));
        },

        logout: async () => {
            try {
                // 对于OAuth应用，清理Shopify会话
                if (!isCustomApp) {
                    await authenticatedFetch('/auth/logout', { method: 'POST' });
                }
            } catch (error) {
                console.error('登出失败:', error);
            }

            localStorage.removeItem('user');
            setState(prev => ({
                ...prev,
                user: null,
                isAuthenticated: false,
                shopifySession: null,
            }));
        },

        setLoading: (loading: boolean) => {
            setState(prev => ({ ...prev, isLoading: loading }));
        },

        showToast: (message: string) => {
            setState(prev => ({
                ...prev,
                toastMessage: message,
                toastActive: true,
            }));

            // 自动隐藏toast
            setTimeout(() => {
                setState(prev => ({
                    ...prev,
                    toastActive: false,
                    toastMessage: '',
                }));
            }, 4000);
        },

        hideToast: () => {
            setState(prev => ({
                ...prev,
                toastActive: false,
                toastMessage: '',
            }));
        },

        setShopifySession: (session: ShopifySession | null) => {
            setState(prev => ({
                ...prev,
                shopifySession: session,
                isAuthenticated: !!session,
            }));
        },
    }), [isCustomApp, authenticatedFetch]);

    const contextValue: AppContextType = useMemo(() => ({
        state,
        actions,
        fetch: authenticatedFetch,
    }), [state, actions, authenticatedFetch]);

    return (
        <AppContext.Provider value={contextValue}>
            {children}
        </AppContext.Provider>
    );
};

// 自定义 Hook 来使用 Context，包含类型安全检查
export const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);

    if (context === undefined) {
        throw new Error(
            'useAppContext 必须在 AppProvider 内部使用。请确保您的组件被 AppProvider 包裹。'
        );
    }

    return context;
};

// 便捷的 Hooks
export const useAuth = () => {
    const { state, actions } = useAppContext();
    return {
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        shopifySession: state.shopifySession,
        login: actions.login,
        logout: actions.logout,
    };
};

export const useLoading = () => {
    const { state, actions } = useAppContext();
    return {
        isLoading: state.isLoading,
        setLoading: actions.setLoading,
    };
};

export const useToast = () => {
    const { state, actions } = useAppContext();
    return {
        toastMessage: state.toastMessage,
        toastActive: state.toastActive,
        showToast: actions.showToast,
        hideToast: actions.hideToast,
    };
};

// 认证后的fetch Hook
export const useAuthenticatedFetch = () => {
    const { fetch } = useAppContext();
    return fetch;
}; 