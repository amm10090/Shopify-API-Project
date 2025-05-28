import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

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
        new URLSearchParams(window.location.search).get('appType') === 'custom';
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
    // 检测应用模式
    const isCustomApp = isCustomAppMode();

    // 根据应用模式使用不同的fetch函数
    let fetch: typeof window.fetch;

    if (isCustomApp) {
        console.log('Custom app mode detected - using standard fetch');
        fetch = createCustomAppFetch();
    } else {
        console.log('OAuth app mode - using authenticated fetch');
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const app = useAppBridge();
        fetch = authenticatedFetch(app);
    }

    const [state, setState] = useState<AppState>({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        toastMessage: '',
        toastActive: false,
        shopifySession: null,
    });

    // 检查Shopify会话状态
    const checkShopifySession = async () => {
        try {
            const response = await fetch('/auth/session');
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
    };

    // 初始化用户状态
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                setState(prev => ({ ...prev, isLoading: true }));

                if (isCustomApp) {
                    // 自定义应用模式：直接设置为已认证状态
                    console.log('Custom app mode - setting authenticated state');
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
                        }
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

                    if (shop && !state.isAuthenticated) {
                        // 重定向到Shopify认证
                        window.location.href = `/auth/shopify?shop=${shop}&host=${host || ''}`;
                        return;
                    }
                }

                // 检查本地存储中的用户信息（作为备选）
                const savedUser = localStorage.getItem('user');
                if (savedUser && !state.user) {
                    const user = JSON.parse(savedUser);
                    setState(prev => ({
                        ...prev,
                        user,
                    }));
                }
            } catch (error) {
                console.error('初始化认证失败:', error);
            } finally {
                setState(prev => ({ ...prev, isLoading: false }));
            }
        };

        initializeAuth();
    }, [isCustomApp]);

    // 定义操作函数
    const actions: AppActions = {
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
                    await fetch('/auth/logout', { method: 'POST' });
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
    };

    const contextValue: AppContextType = {
        state,
        actions,
        fetch, // 提供认证后的fetch函数
    };

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