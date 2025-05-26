import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProvider as PolarisAppProvider } from '@shopify/polaris'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PolarisAppProvider i18n={{}}>
        <AppProvider>
          <App />
        </AppProvider>
      </PolarisAppProvider>
    </QueryClientProvider>
  </React.StrictMode>,
) 