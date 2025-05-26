import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// 定义应用状态接口
interface User {
    id: string;
    name: string;
    email: string;
    shopDomain?: string;
}

interface AppState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    toastMessage: string;
    toastActive: boolean;
}

// 定义 Context 操作接口
interface AppActions {
    login: (user: User) => void;
    logout: () => void;
    setLoading: (loading: boolean) => void;
    showToast: (message: string) => void;
    hideToast: () => void;
}

// 完整的 Context 接口
interface AppContextType {
    state: AppState;
    actions: AppActions;
}

// 创建 Context，初始值为 undefined
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider 组件的 Props
interface AppProviderProps {
    children: ReactNode;
}

// Context Provider 组件
export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const [state, setState] = useState<AppState>({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        toastMessage: '',
        toastActive: false,
    });

    // 初始化用户状态
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                setState(prev => ({ ...prev, isLoading: true }));

                // 检查本地存储中的用户信息
                const savedUser = localStorage.getItem('user');
                const token = localStorage.getItem('token');

                if (savedUser && token) {
                    const user = JSON.parse(savedUser);
                    setState(prev => ({
                        ...prev,
                        user,
                        isAuthenticated: true,
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
            localStorage.setItem('token', 'dummy-token'); // 实际项目中应该是真实的 token
            setState(prev => ({
                ...prev,
                user,
                isAuthenticated: true,
            }));
        },

        logout: () => {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            setState(prev => ({
                ...prev,
                user: null,
                isAuthenticated: false,
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
        },

        hideToast: () => {
            setState(prev => ({
                ...prev,
                toastActive: false,
                toastMessage: '',
            }));
        },
    };

    const contextValue: AppContextType = {
        state,
        actions,
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