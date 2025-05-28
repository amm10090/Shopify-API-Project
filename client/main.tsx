import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider as PolarisAppProvider } from '@shopify/polaris'
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react'
import '@shopify/polaris/build/esm/styles.css'
import { AppProvider } from './contexts/AppContext'
import App from './App'

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

// 自定义 AppBridge Provider 组件，支持自定义应用模式
interface CustomAppBridgeProviderProps {
  config: any;
  children: React.ReactNode;
}

const CustomAppBridgeProvider: React.FC<CustomAppBridgeProviderProps> = ({ config, children }) => {
  // 如果是自定义应用模式，直接渲染子组件，不使用 App Bridge
  if (config.isCustomApp) {
    console.log('Custom app mode detected - skipping App Bridge initialization');
    return <>{children}</>;
  }

  // 对于普通应用，使用标准的 App Bridge Provider
  return <AppBridgeProvider config={config}>{children}</AppBridgeProvider>;
};

// 获取Shopify配置
const getShopifyConfig = () => {
  console.log('=== Shopify Config Debug Info ===');
  console.log('Current URL:', window.location.href);
  console.log('Environment:', process.env.NODE_ENV);

  // 优先从window.shopifyConfig获取（服务器端注入）
  const windowConfig = (window as any).shopifyConfig || {};
  console.log('Window config:', windowConfig);

  // 检查是否为自定义应用模式
  const isCustomApp = windowConfig.appType === 'custom' ||
    new URLSearchParams(window.location.search).get('appType') === 'custom';

  console.log('Is custom app:', isCustomApp);

  // 对于自定义应用，我们不需要完整的App Bridge配置
  if (isCustomApp) {
    console.log('Using custom app configuration - bypassing App Bridge requirements');
    return {
      apiKey: 'custom-app', // 使用占位符
      shop: windowConfig.shop || new URLSearchParams(window.location.search).get('shop') || 'custom-app',
      host: 'custom-app', // 使用占位符
      forceRedirect: false,
      isCustomApp: true
    };
  }

  // 从meta标签获取配置
  const apiKey = document.querySelector('meta[name="shopify-api-key"]')?.getAttribute('content')
  const shopFromMeta = document.querySelector('meta[name="shopify-shop-domain"]')?.getAttribute('content')
  const hostFromMeta = document.querySelector('meta[name="shopify-host"]')?.getAttribute('content')
  const embeddedFromMeta = document.querySelector('meta[name="shopify-embedded"]')?.getAttribute('content')

  console.log('Meta tags:', { apiKey: apiKey ? '***' : 'missing', shopFromMeta, hostFromMeta: hostFromMeta ? '***' : 'missing', embeddedFromMeta });

  // 从URL参数获取
  const urlParams = new URLSearchParams(window.location.search)
  const shopFromUrl = urlParams.get('shop')
  const hostFromUrl = urlParams.get('host')

  console.log('URL params:', { shopFromUrl, hostFromUrl: hostFromUrl ? '***' : 'missing' });

  // 优先级：window.shopifyConfig > URL参数 > meta标签（对于shop和host）
  // API key始终从meta标签或window config获取
  let shop = windowConfig.shop || shopFromUrl || shopFromMeta || ''
  let host = windowConfig.host || hostFromUrl || hostFromMeta || ''
  const embedded = windowConfig.embedded !== false && embeddedFromMeta !== 'false'
  let finalApiKey = windowConfig.apiKey || apiKey || ''

  // 验证和规范化shop参数
  if (shop && !shop.includes('.myshopify.com')) {
    if (shop !== '%SHOP%' && shop !== 'dev-shop.myshopify.com') {
      shop = shop.includes('.') ? shop : `${shop}.myshopify.com`
    }
  }

  // 清理占位符
  if (shop === '%SHOP%') shop = ''
  if (host === '%HOST%') host = ''
  if (finalApiKey === '%SHOPIFY_API_KEY%') finalApiKey = ''

  console.log('Processed values:', {
    apiKey: finalApiKey ? '***' : 'missing',
    shop,
    host: host ? '***' : 'missing',
    embedded
  });

  // 检查是否在开发环境
  const isDevelopment = process.env.NODE_ENV === 'development' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'

  console.log('Is development:', isDevelopment);

  if (isDevelopment) {
    // Use fake data for development environment
    console.log('Using development configuration');
    return {
      apiKey: finalApiKey || 'dev-api-key',
      shop: shop || 'dev-shop.myshopify.com',
      host: host || btoa('dev-shop.myshopify.com/admin'),
      forceRedirect: false
    }
  }

  // Production environment validation
  const errors = []
  if (!finalApiKey || finalApiKey === 'dev-api-key') {
    errors.push('Missing or invalid Shopify API key')
  }
  if (!shop) {
    errors.push('Missing shop parameter')
  }
  if (!host) {
    errors.push('Missing host parameter')
  }

  if (errors.length > 0) {
    console.error('Shopify configuration errors:', errors)

    // In production environment, if we're in Shopify admin, try redirecting to OAuth
    if (window.top !== window.self && shop) {
      console.log('Detected iframe environment, redirecting to OAuth')
      const authUrl = `/auth/shopify?shop=${encodeURIComponent(shop)}&embedded=1`
      console.log('Redirecting to OAuth:', authUrl)
      window.parent.location.href = authUrl
      return {
        apiKey: '',
        shop: '',
        host: '',
        forceRedirect: true
      }
    }

    // Show error page
    return {
      apiKey: finalApiKey || '',
      shop: shop || '',
      host: host || '',
      forceRedirect: false,
      hasErrors: true,
      errors
    }
  }

  // Validate host parameter - Shopify host must be base64 encoded
  if (host && !host.match(/^[A-Za-z0-9+/]+=*$/)) {
    console.warn('Host parameter is not base64 encoded, this may cause App Bridge issues')
    console.warn('Host value:', host)
  }

  return {
    apiKey: finalApiKey,
    shop: shop,
    host: host,
    forceRedirect: false
  }
}

const config = getShopifyConfig()

console.log('Final App Bridge config:', {
  apiKey: config.apiKey ? '***' : 'missing',
  shop: config.shop,
  host: config.host ? '***' : 'missing',
  forceRedirect: config.forceRedirect,
  hasErrors: (config as any).hasErrors
})

// 如果配置有致命错误，显示错误页面
if ((config as any).hasErrors) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
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
        🚨 App Bridge 配置错误
      </h2>
      <p style={{ marginBottom: '1rem' }}>
        应用无法正确初始化 Shopify App Bridge。请检查以下配置：
      </p>
      <ul style={{ marginBottom: '1.5rem', color: '#586069' }}>
        {((config as any).errors || []).map((error: string, index: number) => (
          <li key={index} style={{ marginBottom: '0.5rem' }}>❌ {error}</li>
        ))}
      </ul>
      <div style={{ padding: '1rem', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px' }}>
        <strong>解决步骤：</strong>
        <ol style={{ marginTop: '0.5rem' }}>
          <li>确保通过 Shopify 管理后台访问此应用</li>
          <li>检查环境变量配置是否正确</li>
          <li>验证 Shopify 应用设置中的 URL 配置</li>
        </ol>
      </div>
      <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#586069' }}>
        如果问题持续存在，请联系技术支持。
      </p>
    </div>
  )
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppBridgeErrorBoundary>
        <CustomAppBridgeProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <PolarisAppProvider i18n={{}}>
              <AppProvider>
                <App />
              </AppProvider>
            </PolarisAppProvider>
          </QueryClientProvider>
        </CustomAppBridgeProvider>
      </AppBridgeErrorBoundary>
    </React.StrictMode>,
  )
} 