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

// Context Provider 组件
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const app = useAppBridge();
    const fetch = authenticatedFetch(app);

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

                // 首先检查Shopify会话
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
    }, []);

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
                // 清理Shopify会话
                await fetch('/auth/logout', { method: 'POST' });
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