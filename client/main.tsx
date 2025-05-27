import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider as PolarisAppProvider } from '@shopify/polaris'
import { Provider as AppBridgeProvider } from '@shopify/app-bridge-react'
import '@shopify/polaris/build/esm/styles.css'
import { AppProvider } from './contexts/AppContext'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// 获取Shopify配置
const getShopifyConfig = () => {
  // 优先从meta标签获取配置（服务器端注入）
  const apiKey = document.querySelector('meta[name="shopify-api-key"]')?.getAttribute('content')
  const shopFromMeta = document.querySelector('meta[name="shopify-shop-domain"]')?.getAttribute('content')
  const hostFromMeta = document.querySelector('meta[name="shopify-host"]')?.getAttribute('content')
  const embeddedFromMeta = document.querySelector('meta[name="shopify-embedded"]')?.getAttribute('content')

  // 备选方案：从URL参数获取
  const urlParams = new URLSearchParams(window.location.search)
  const shopFromUrl = urlParams.get('shop')
  const hostFromUrl = urlParams.get('host')

  // 从window.shopifyConfig获取（如果可用）
  const windowConfig = (window as any).shopifyConfig || {}

  // 优先级：window.shopifyConfig > meta标签 > URL参数
  let shop = windowConfig.shop || shopFromMeta || shopFromUrl || ''
  let host = windowConfig.host || hostFromMeta || hostFromUrl || ''
  const embedded = windowConfig.embedded !== false && embeddedFromMeta !== 'false'

  // 验证和规范化shop参数
  if (shop && !shop.includes('.myshopify.com')) {
    shop = shop.includes('.') ? shop : `${shop}.myshopify.com`
  }

  // 验证host参数 - Shopify的host必须是base64编码的
  if (host && !host.match(/^[A-Za-z0-9+/]+=*$/)) {
    console.warn('Host parameter is not base64 encoded, this may cause App Bridge issues')
  }

  console.log('Shopify config sources:', {
    apiKey: apiKey ? '***' : 'missing',
    shop: { windowConfig: windowConfig.shop, meta: shopFromMeta, url: shopFromUrl, final: shop },
    host: { windowConfig: windowConfig.host, meta: hostFromMeta, url: hostFromUrl, final: host },
    embedded
  })

  // 验证必需参数
  const errors = []
  if (!apiKey || apiKey === 'dev-api-key' || apiKey === '%SHOPIFY_API_KEY%') {
    errors.push('Missing or invalid Shopify API key')
  }
  if (!shop || shop === '%SHOP%') {
    errors.push('Missing shop parameter')
  }
  if (!host || host === '%HOST%') {
    errors.push('Missing host parameter')
  }

  if (errors.length > 0) {
    console.error('Shopify configuration errors:', errors)

    // 检查是否在开发环境
    const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost'

    if (isDevelopment) {
      console.warn('Development mode detected, using fallback configuration')
      // 在开发环境中，如果缺少关键参数，尝试从URL重新构建
      const currentUrl = new URL(window.location.href)
      const fallbackShop = shop || currentUrl.searchParams.get('shop') || 'dev-store.myshopify.com'
      const fallbackHost = host || currentUrl.searchParams.get('host') || 'localhost:5173'
      const fallbackApiKey = apiKey || 'dev-api-key'

      return {
        apiKey: fallbackApiKey,
        shop: fallbackShop,
        host: fallbackHost,
        forceRedirect: false
      }
    }

    // 生产环境中，如果我们在Shopify管理后台中，尝试重定向到认证
    if (window.top !== window.self) {
      console.log('Detected iframe environment, redirecting to OAuth')

      // 尝试从当前URL获取shop参数
      const currentUrl = new URL(window.location.href)
      const shopParam = shop || currentUrl.searchParams.get('shop') || ''

      if (shopParam && !shopParam.includes('%')) {
        const authUrl = `/auth/shopify?shop=${encodeURIComponent(shopParam)}&embedded=1`
        console.log('Redirecting to OAuth:', authUrl)
        window.parent.location.href = authUrl
        return {
          apiKey: '',
          shop: '',
          host: '',
          forceRedirect: true
        }
      }
    }

    // 如果不在iframe中且有错误，显示错误页面
    console.error('Cannot initialize App Bridge with current configuration')
    return {
      apiKey: apiKey || '',
      shop: shop || '',
      host: host || '',
      forceRedirect: false,
      hasErrors: true,
      errors
    }
  }

  return {
    apiKey: apiKey || '',
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
      <AppBridgeProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <PolarisAppProvider i18n={{}}>
            <AppProvider>
              <App />
            </AppProvider>
          </PolarisAppProvider>
        </QueryClientProvider>
      </AppBridgeProvider>
    </React.StrictMode>,
  )
} 