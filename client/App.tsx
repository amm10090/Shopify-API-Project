import React, { useState } from 'react'
import {
    Frame,
    Navigation,
    Toast,
    Loading,
} from '@shopify/polaris'
import {
    HomeIcon,
    ProductIcon,
    CollectionIcon,
    ImportIcon,
    SettingsIcon,
} from '@shopify/polaris-icons'
import ProductsPage from './pages/ProductsPage'
import BrandsPage from './pages/BrandsPage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import DashboardPage from './pages/DashboardPage'
import { useAuth, useLoading, useToast } from './contexts/AppContext'

type Page = 'dashboard' | 'products' | 'brands' | 'import' | 'settings' | 'context-test'

function App() {
    const [currentPage, setCurrentPage] = useState<Page>('dashboard')

    // 使用 Context hooks
    const { user, isAuthenticated, logout } = useAuth()
    const { isLoading, setLoading } = useLoading()
    const { toastActive, toastMessage, showToast, hideToast } = useToast()

    const navigationMarkup = (
        <Navigation location="/">
            <Navigation.Section
                items={[
                    {
                        label: 'Dashboard',
                        icon: HomeIcon,
                        selected: currentPage === 'dashboard',
                        onClick: () => setCurrentPage('dashboard'),
                    },
                    {
                        label: 'Products',
                        icon: ProductIcon,
                        selected: currentPage === 'products',
                        onClick: () => setCurrentPage('products'),
                    },
                    {
                        label: 'Brands',
                        icon: CollectionIcon,
                        selected: currentPage === 'brands',
                        onClick: () => setCurrentPage('brands'),
                    },
                    {
                        label: 'Import',
                        icon: ImportIcon,
                        selected: currentPage === 'import',
                        onClick: () => setCurrentPage('import'),
                    },
                    {
                        label: 'Settings',
                        icon: SettingsIcon,
                        selected: currentPage === 'settings',
                        onClick: () => setCurrentPage('settings'),
                    },
                ]}
            />
        </Navigation>
    )

    const renderCurrentPage = () => {
        switch (currentPage) {
            case 'dashboard':
                return <DashboardPage showToast={showToast} setIsLoading={setLoading} />
            case 'products':
                return <ProductsPage showToast={showToast} setIsLoading={setLoading} />
            case 'brands':
                return <BrandsPage showToast={showToast} setIsLoading={setLoading} />
            case 'import':
                return <ImportPage showToast={showToast} setIsLoading={setLoading} />
            case 'settings':
                return <SettingsPage showToast={showToast} />

        }
    }

    const toastMarkup = toastActive ? (
        <Toast
            content={toastMessage}
            onDismiss={hideToast}
        />
    ) : null

    const loadingMarkup = isLoading ? <Loading /> : null

    return (
        <Frame navigation={navigationMarkup}>
            {loadingMarkup}
            {renderCurrentPage()}
            {toastMarkup}
        </Frame>
    )
}

export default App 