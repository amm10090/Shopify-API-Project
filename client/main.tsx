// 立即导入Vite客户端拦截器（必须在最前面）
import './utils/viteClientInterceptor'

import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider as PolarisAppProvider } from '@shopify/polaris'
import '@shopify/polaris/build/esm/styles.css'
import { AppProvider } from './contexts/AppContext'
import { initErrorHandling } from './utils/appBridge'
import { initHMRErrorHandler } from './utils/hmrErrorHandler'
import App from './App'

// 立即初始化HMR错误处理器（在任何其他代码之前）
initHMRErrorHandler();

// 初始化错误处理
initErrorHandling();

// 添加一些全局样式来确保正确渲染
const globalStyles = `
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  #root {
    height: 100vh;
    width: 100vw;
  }
`

// 注入全局样式
const styleSheet = document.createElement('style')
styleSheet.textContent = globalStyles
document.head.appendChild(styleSheet)

// 错误边界组件
class AppBridgeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('App Bridge Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          fontFamily: 'system-ui',
          maxWidth: '600px',
          margin: '2rem auto',
          border: '1px solid #e1e1e1',
          borderRadius: '8px',
          backgroundColor: '#f8f8f8'
        }}>
          <h2 style={{ color: '#d73a49', marginBottom: '1rem' }}>
            🚨 App Bridge Initialization Failed
          </h2>
          <p style={{ marginBottom: '1rem' }}>
            The application encountered an error while initializing Shopify App Bridge. This is usually caused by configuration issues.
          </p>
          <div style={{ padding: '1rem', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px', marginBottom: '1rem' }}>
            <strong>Error Message:</strong>
            <pre style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#856404' }}>
              {this.state.error?.message || 'Unknown error'}
            </pre>
          </div>
          <div style={{ padding: '1rem', backgroundColor: '#d1ecf1', border: '1px solid #bee5eb', borderRadius: '4px' }}>
            <strong>Troubleshooting Steps:</strong>
            <ol style={{ marginTop: '0.5rem' }}>
              <li>Ensure you're accessing this app through the Shopify admin panel</li>
              <li>Check that the URL contains the correct shop and host parameters</li>
              <li>Verify the app installation status</li>
              <li>If the problem persists, try reinstalling the app</li>
            </ol>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// 简化的应用配置 - 不再需要复杂的App Bridge设置

// 简化的配置检测
const getShopifyConfig = () => {
  console.log('=== Shopify App Initialization ===');
  console.log('Current URL:', window.location.href);
  console.log('Environment:', process.env.NODE_ENV);

  // 从window获取服务器端注入的配置
  const windowConfig = (window as any).shopifyConfig || {};
  console.log('Window config:', windowConfig);

  // 检查是否为自定义应用模式
  const isCustomApp = windowConfig.appType === 'custom' ||
    windowConfig.isCustomApp === true ||
    (window.location.hostname === 'localhost' && !window.location.search.includes('shop='));

  console.log('Is custom app:', isCustomApp);

  return {
    isCustomApp,
    shop: windowConfig.shop || '',
    apiKey: windowConfig.apiKey || '',
    initialized: true
  };
}

const config = getShopifyConfig()

console.log('Final App Bridge config:', {
  apiKey: config.apiKey ? '***' : 'missing',
  shop: config.shop,
  isCustomApp: config.isCustomApp,
  initialized: config.initialized
})

// 渲染应用 - 使用简化的方式，根据最新的Shopify App Bridge模式
console.log('Rendering application...');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBridgeErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PolarisAppProvider i18n={{}}>
          <AppProvider>
            <App />
          </AppProvider>
        </PolarisAppProvider>
      </QueryClientProvider>
    </AppBridgeErrorBoundary>
  </React.StrictMode>
); 