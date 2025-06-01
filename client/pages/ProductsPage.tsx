import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    Page,
    Layout,
    Card,
    DataTable,
    Button,
    TextField,
    Select,
    Filters,
    Badge,
    Thumbnail,
    BlockStack,
    InlineStack,
    Text,
    Pagination,
    ButtonGroup,
    Modal,
    TextContainer,
    Spinner,
    EmptyState,
    Box,
    Divider,
    Icon,
    Tooltip,
    ProgressBar,
    Banner,
    UnstyledButton,
} from '@shopify/polaris';
import {
    ImportIcon,
    ExportIcon,
    DeleteIcon,
    SearchIcon,
    FilterIcon,
    ViewIcon,
    EditIcon,
    ProductIcon,
    CalendarIcon,
    InventoryIcon,
    RefreshIcon,
} from '@shopify/polaris-icons';
import { productApi, brandApi, shopifyApi } from '../services/api';
import { UnifiedProduct, Brand } from '@shared/types';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { ProductEditModal } from '../components/ProductEditModal';
import { getShopifyProductAdminUrlSync, getShopifyStoreName, isValidShopifyProductId } from '../utils/shopify';

interface ProductsPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

// 添加脉动动画的CSS
const pulseAnimation = `
    @keyframes pulse {
        0% {
            opacity: 0.6;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: 0.6;
        }
    }
`;

// 将动画样式注入到头部
const injectPulseAnimationStyle = () => {
    // 检查是否已经存在
    if (!document.getElementById('pulse-animation-style')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'pulse-animation-style';
        styleElement.innerHTML = pulseAnimation;
        document.head.appendChild(styleElement);
    }
};

const ProductsPage: React.FC<ProductsPageProps> = ({ showToast, setIsLoading }) => {
    const [products, setProducts] = useState<UnifiedProduct[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [availabilityFilter, setAvailabilityFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);
    const [deleteModalActive, setDeleteModalActive] = useState(false);
    const [importProgress, setImportProgress] = useState<{ [key: string]: boolean }>({});

    // 添加请求标记，防止重复请求
    const isFetchingStats = useRef(false);

    // 统计信息 state - 只定义一次
    const [stats, setStats] = useState({
        total: 0,
        imported: 0,
        pending: 0,
        inStock: 0
    });

    // Product detail modal state
    const [detailModalActive, setDetailModalActive] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<UnifiedProduct | null>(null);

    // Product edit modal state
    const [editModalActive, setEditModalActive] = useState(false);
    const [editingProduct, setEditingProduct] = useState<UnifiedProduct | null>(null);
    const [editLoading, setEditLoading] = useState(false);

    const limit = 20;

    // 获取品牌列表
    const fetchBrands = useCallback(async () => {
        try {
            const response = await brandApi.getBrands();
            if (response.success && response.data) {
                setBrands(response.data);
            }
        } catch (error) {
            console.error('Error fetching brands:', error);
        }
    }, []);

    // 获取产品列表
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        setIsLoading(true);
        try {
            const response = await productApi.getProducts({
                page: currentPage,
                limit: limit,
                importStatus: statusFilter || undefined,
                availability: availabilityFilter ? availabilityFilter === 'true' : undefined,
                search: searchValue || undefined,
                brandId: brandFilter || undefined,
            });

            if (response.data) {
                setProducts(response.data);
                setTotalPages(response.pagination.totalPages);
                setTotalProducts(response.pagination.total);
            } else {
                setProducts([]);
                setTotalPages(1);
                setTotalProducts(0);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
            showToast('Failed to fetch products');
            setProducts([]);
        } finally {
            setLoading(false);
            setIsLoading(false);
        }
    }, [currentPage, limit, statusFilter, availabilityFilter, searchValue, brandFilter, showToast, setIsLoading]);

    // 获取产品统计数据 - 使用ref防止重复请求
    const fetchProductStats = useCallback(async () => {
        // 如果已经在获取统计数据，则跳过
        if (isFetchingStats.current) return;

        isFetchingStats.current = true;
        try {
            // 使用多个接口调用获取不同状态的产品数量
            const [totalResponse, importedResponse, pendingResponse, inStockResponse] = await Promise.all([
                // 获取总产品数
                productApi.getProducts({ page: 1, limit: 1 }),
                // 获取已导入产品数
                productApi.getProducts({ page: 1, limit: 1, importStatus: 'imported' }),
                // 获取待处理产品数
                productApi.getProducts({ page: 1, limit: 1, importStatus: 'pending' }),
                // 获取有库存产品数
                productApi.getProducts({ page: 1, limit: 1, availability: true })
            ]);

            setStats({
                total: totalResponse.pagination?.total || 0,
                imported: importedResponse.pagination?.total || 0,
                pending: pendingResponse.pagination?.total || 0,
                inStock: inStockResponse.pagination?.total || 0
            });
        } catch (error) {
            console.error('Error fetching product stats:', error);
            // 使用简单设置而不是依赖前一个状态
            setStats(prev => ({
                ...prev,
                total: totalProducts
            }));
        } finally {
            isFetchingStats.current = false;
        }
    }, [totalProducts]);

    // 组件挂载时获取数据
    useEffect(() => {
        fetchBrands();
        // 预先获取店铺名称以便缓存
        getShopifyStoreName().catch(console.error);
    }, [fetchBrands]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // 获取统计数据 - 只在组件挂载时和筛选条件改变后调用一次
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProductStats();
        }, 300); // 添加延时避免频繁调用
        return () => clearTimeout(timer);
    }, [fetchProductStats, currentPage, statusFilter, availabilityFilter, searchValue, brandFilter]);

    // 组件挂载时注入动画样式
    useEffect(() => {
        injectPulseAnimationStyle();
        return () => {
            // 组件卸载时移除样式
            const styleElement = document.getElementById('pulse-animation-style');
            if (styleElement) {
                styleElement.remove();
            }
        };
    }, []);

    const handleSelectionChange = useCallback((selection: string[]) => {
        setSelectedProducts(selection);
    }, []);

    const handleBulkImport = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to import');
            return;
        }

        setIsLoading(true);
        try {
            const response = await shopifyApi.importToShopify(selectedProducts);

            if (response.success) {
                const { success, failed, errors } = response.data;

                if (failed > 0) {
                    showToast(`Import completed: ${success} successful, ${failed} failed. Check console for details.`);
                    console.error('Import errors:', errors);
                } else {
                    showToast(`Successfully imported ${success} products`);
                }

                setSelectedProducts([]);
                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to bulk import');
            }
        } catch (error) {
            console.error('Error during bulk import:', error);
            showToast('Failed to bulk import');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading, fetchProducts]);

    const handleBulkDatabaseUpdate = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to update');
            return;
        }

        setIsLoading(true);
        try {
            const response = await productApi.bulkUpdateFromSource(selectedProducts);

            if (response.success) {
                const { success, failed, noChanges, errors } = response.data;

                if (failed > 0) {
                    showToast(`Update completed: ${success} updated, ${noChanges} no changes, ${failed} failed. Check console for details.`);
                    console.error('Update errors:', errors);
                } else if (noChanges > 0 && success === 0) {
                    showToast(`All ${noChanges} products are already up to date`);
                } else {
                    showToast(`Successfully updated ${success} products${noChanges > 0 ? `, ${noChanges} already up to date` : ''}`);
                }

                setSelectedProducts([]);
                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to bulk update');
            }
        } catch (error) {
            console.error('Error during bulk database update:', error);
            showToast('Failed to bulk update');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading, fetchProducts]);

    const handleBulkStatusSync = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to sync status');
            return;
        }

        setIsLoading(true);
        try {
            const response = await shopifyApi.syncProductStatus(selectedProducts);

            if (response.success) {
                const { checked, stillExists, deleted, updated, errors } = response.data;

                if (errors && errors.length > 0) {
                    showToast(`Status sync completed: ${checked} checked, ${deleted} marked as deleted, ${errors.length} errors. Check console for details.`);
                    console.error('Sync errors:', errors);
                } else {
                    showToast(`Status sync completed: ${checked} checked, ${stillExists} still exist, ${deleted} marked as deleted`);
                }

                setSelectedProducts([]);
                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to sync status');
            }
        } catch (error) {
            console.error('Error during status sync:', error);
            showToast('Failed to sync status');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading, fetchProducts]);

    const handleBulkInventorySync = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to sync inventory');
            return;
        }

        setIsLoading(true);
        try {
            const response = await shopifyApi.syncInventory(selectedProducts);

            if (response.success) {
                const { checked, synced, errors } = response.data;

                if (errors && errors.length > 0) {
                    showToast(`Inventory sync completed: ${checked} checked, ${synced} synced, ${errors.length} errors. Check console for details.`);
                    console.error('Inventory sync errors:', errors);
                } else {
                    showToast(`Inventory sync completed: ${checked} checked, ${synced} synced`);
                }

                setSelectedProducts([]);
                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to sync inventory');
            }
        } catch (error) {
            console.error('Error during inventory sync:', error);
            showToast('Failed to sync inventory');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading, fetchProducts]);

    const handleBulkDelete = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await productApi.bulkAction('delete', selectedProducts);

            if (response.success) {
                showToast(`Successfully deleted ${response.data.count} products`);
                setSelectedProducts([]);
                setDeleteModalActive(false);
                fetchProducts(); // 刷新产品列表
            } else {
                showToast('Failed to delete products');
            }
        } catch (error) {
            console.error('Error deleting products:', error);
            showToast('Failed to delete products');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading, fetchProducts]);

    const handleSingleImport = useCallback(async (productId: string) => {
        setImportProgress(prev => ({ ...prev, [productId]: true }));
        setIsLoading(true);
        try {
            const response = await shopifyApi.importToShopify([productId]);

            if (response.success) {
                const { success, failed, errors } = response.data;

                if (failed > 0) {
                    showToast(`Import failed: ${errors[0]?.error || 'Unknown error'}`);
                } else {
                    showToast('Product imported successfully');
                }

                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to import product');
            }
        } catch (error) {
            console.error('Error importing product:', error);
            showToast('Failed to import product');
        } finally {
            setImportProgress(prev => ({ ...prev, [productId]: false }));
            setIsLoading(false);
        }
    }, [showToast, setIsLoading, fetchProducts]);

    // 处理已导入产品的更新
    const handleSingleUpdate = useCallback(async (productId: string) => {
        setImportProgress(prev => ({ ...prev, [productId]: true }));
        setIsLoading(true);
        try {
            const response = await shopifyApi.updateProducts([productId]);

            if (response.success) {
                const { success, failed, noChanges, errors } = response.data;

                if (failed > 0) {
                    showToast(`Update failed: ${errors[0]?.error || 'Unknown error'}`);
                } else if (noChanges > 0) {
                    showToast('No changes detected - product is already up to date');
                } else {
                    showToast('Product updated successfully');
                }

                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to update product');
            }
        } catch (error) {
            console.error('Error updating product:', error);
            showToast('Failed to update product');
        } finally {
            setImportProgress(prev => ({ ...prev, [productId]: false }));
            setIsLoading(false);
        }
    }, [showToast, setIsLoading, fetchProducts]);

    // 处理数据库信息更新（从源API重新获取商品信息并更新数据库）
    const handleDatabaseUpdate = useCallback(async (productId: string) => {
        setImportProgress(prev => ({ ...prev, [productId]: true }));
        setIsLoading(true);
        try {
            const response = await productApi.updateProductFromSource(productId);

            if (response.success) {
                showToast('Product information updated successfully');
                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to update product information');
            }
        } catch (error) {
            console.error('Error updating product from source:', error);
            showToast('Failed to update product information');
        } finally {
            setImportProgress(prev => ({ ...prev, [productId]: false }));
            setIsLoading(false);
        }
    }, [showToast, setIsLoading, fetchProducts]);

    // Handle product edit - jump to Shopify if imported, open edit modal if not
    const handleProductEdit = useCallback((product: UnifiedProduct) => {
        if (product.importStatus === 'imported' && isValidShopifyProductId(product.shopifyProductId)) {
            // 跳转到Shopify编辑页面 - 使用标准的Shopify管理后台URL
            const shopifyUrl = getShopifyProductAdminUrlSync(product.shopifyProductId!);
            window.open(shopifyUrl, '_blank');
            showToast(`Opening ${product.title} in Shopify`);
        } else {
            // 打开编辑模态框
            setEditingProduct(product);
            setEditModalActive(true);
        }
    }, [showToast]);

    // Handle saving product edits
    const handleSaveProductEdit = useCallback(async (productId: string, updates: Partial<UnifiedProduct>) => {
        setEditLoading(true);
        try {
            const response = await productApi.updateProduct(productId, updates);

            if (response.success) {
                showToast('Product updated successfully');
                setEditModalActive(false);
                setEditingProduct(null);
                fetchProducts(); // 刷新产品列表
            } else {
                showToast(response.error || 'Failed to update product');
            }
        } catch (error) {
            console.error('Error updating product:', error);
            showToast('Failed to update product');
        } finally {
            setEditLoading(false);
        }
    }, [showToast, fetchProducts]);

    const getStatusBadge = (status: string) => {
        const statusConfig = {
            imported: { tone: 'success' as const, label: 'Imported', icon: '✓' },
            pending: { tone: 'attention' as const, label: 'Pending', icon: '⏳' },
            failed: { tone: 'critical' as const, label: 'Failed', icon: '✗' },
        };

        const config = statusConfig[status as keyof typeof statusConfig] ||
            { tone: 'info' as const, label: 'Unknown', icon: '?' };

        return (
            <Badge tone={config.tone}>
                {`${config.icon} ${config.label}`}
            </Badge>
        );
    };

    const getAvailabilityBadge = (availability: boolean) => {
        return availability ? (
            <Badge tone="success">
                📦 In Stock
            </Badge>
        ) : (
            <Badge tone="critical">
                📭 Out of Stock
            </Badge>
        );
    };

    const formatPrice = (price: number, currency: string = 'USD') => {
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
        });
        return formatter.format(price);
    };

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    // 重置筛选器
    const handleFiltersQueryChange = useCallback((value: string) => {
        setSearchValue(value);
        setCurrentPage(1); // 重置到第一页
    }, []);

    const handleFiltersClearAll = useCallback(() => {
        setBrandFilter('');
        setStatusFilter('');
        setAvailabilityFilter('');
        setSearchValue('');
        setCurrentPage(1);
    }, []);

    // 当筛选器改变时重置到第一页
    useEffect(() => {
        setCurrentPage(1);
    }, [brandFilter, statusFilter, availabilityFilter, searchValue]);

    // 卡片点击处理函数
    const handleFilterCardClick = useCallback((newStatusFilter: string, newAvailabilityFilter: string) => {
        // 设置筛选条件
        setStatusFilter(newStatusFilter);
        setAvailabilityFilter(newAvailabilityFilter);
        setBrandFilter('');  // 清除品牌筛选
        setSearchValue('');  // 清除搜索条件
        setCurrentPage(1);   // 重置页码

        // 不需要额外触发fetchProducts，因为状态更新会自动触发useEffect
    }, []);

    if (loading && products.length === 0) {
        return (
            <Page fullWidth title="Product Management">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <Box padding="800">
                                <BlockStack align="center" gap="400">
                                    <Spinner size="large" />
                                    <Text as="h3" variant="headingMd" alignment="center">
                                        Loading products...
                                    </Text>
                                    <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                                        Please wait while we fetch your product data
                                    </Text>
                                </BlockStack>
                            </Box>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    // 渲染关键词标签
    const renderKeywords = (keywords: string[] | undefined) => {
        if (!keywords || keywords.length === 0) {
            return (
                <Text as="span" variant="bodySm" tone="subdued">
                    No keywords
                </Text>
            );
        }

        // 简化关键词显示逻辑，避免使用不必要的Tooltip
        return (
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px',
                alignItems: 'flex-start',
                maxWidth: '100%',
                overflow: 'hidden'
            }}>
                {keywords.slice(0, 3).map((keyword, index) => (
                    <Badge key={index} tone="info" size="small">
                        {keyword.length > 12 ? `${keyword.substring(0, 12)}...` : keyword}
                    </Badge>
                ))}
                {keywords.length > 3 && (
                    <Badge tone="info" size="small">
                        {`+${keywords.length - 3}`}
                    </Badge>
                )}
            </div>
        );
    };

    const brandOptions = [
        { label: 'All Brands', value: '' },
        ...brands.map(brand => ({ label: brand.name, value: brand.id }))
    ];

    const filters = [
        {
            key: 'brand',
            label: 'Brand',
            filter: (
                <Select
                    label="Brand"
                    labelHidden
                    options={brandOptions}
                    value={brandFilter}
                    onChange={setBrandFilter}
                />
            ),
            shortcut: true,
        },
        {
            key: 'status',
            label: 'Import Status',
            filter: (
                <Select
                    label="Import Status"
                    labelHidden
                    options={[
                        { label: 'All Status', value: '' },
                        { label: 'Imported', value: 'imported' },
                        { label: 'Pending', value: 'pending' },
                        { label: 'Failed', value: 'failed' },
                    ]}
                    value={statusFilter}
                    onChange={setStatusFilter}
                />
            ),
            shortcut: true,
        },
        {
            key: 'availability',
            label: 'Stock Status',
            filter: (
                <Select
                    label="Stock Status"
                    labelHidden
                    options={[
                        { label: 'All Stock Status', value: '' },
                        { label: 'In Stock', value: 'true' },
                        { label: 'Out of Stock', value: 'false' },
                    ]}
                    value={availabilityFilter}
                    onChange={setAvailabilityFilter}
                />
            ),
        },
    ];

    const appliedFilters: Array<{ key: string; label: string; onRemove: () => void }> = [];
    if (brandFilter) {
        const brand = brands.find(b => b.id === brandFilter);
        appliedFilters.push({
            key: 'brand',
            label: `Brand: ${brand?.name || brandFilter}`,
            onRemove: () => setBrandFilter('')
        });
    }
    if (statusFilter) appliedFilters.push({
        key: 'status',
        label: `Status: ${statusFilter}`,
        onRemove: () => setStatusFilter('')
    });
    if (availabilityFilter) appliedFilters.push({
        key: 'availability',
        label: `Stock: ${availabilityFilter === 'true' ? 'In Stock' : 'Out of Stock'}`,
        onRemove: () => setAvailabilityFilter('')
    });

    // 检查是否有任何筛选条件被应用
    const hasActiveFilters = searchValue || brandFilter || statusFilter || availabilityFilter;

    // 如果没有产品且没有应用任何筛选条件，显示完整的空状态页面
    if (products.length === 0 && !loading && !hasActiveFilters && totalProducts === 0) {
        return (
            <Page
                fullWidth
                title="Product Management"
                primaryAction={{
                    content: 'Import Products',
                    primary: true,
                    icon: ImportIcon,
                    onAction: () => showToast('Please go to Import page to fetch products'),
                }}
            >
                <Layout>
                    <Layout.Section>
                        <Card>
                            <EmptyState
                                heading="No products found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                                action={{
                                    content: 'Import Products',
                                    onAction: () => showToast('Please go to Import page to fetch products'),
                                }}
                            >
                                <p>No products have been imported yet. Please go to the Import page to fetch products from your connected sources.</p>
                            </EmptyState>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page
            fullWidth
            title="Product Management"
            subtitle={`Managing ${totalProducts.toLocaleString()} products across ${brands.length} brands`}
            primaryAction={{
                content: 'Import Products',
                primary: true,
                icon: ImportIcon,
                onAction: () => showToast('Please go to Import page to fetch products'),
            }}
            secondaryActions={[
                {
                    content: 'Export All',
                    icon: ExportIcon,
                    onAction: () => showToast('Export function is under development'),
                },
            ]}
        >
            <Layout>
                {/* 统计卡片 */}
                <Layout.Section>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <Card padding="0">
                            <div
                                style={{
                                    padding: '16px',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    height: '100%',
                                    boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => handleFilterCardClick('', '')}
                                onMouseOver={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '#F4F6F8';
                                    target.style.transform = 'translateY(-2px)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 4px 7px 0 rgba(63, 63, 68, 0.15)';

                                    // 添加波纹效果的元素
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = 'scale(1.2) rotate(10deg)';
                                    }

                                    // 显示交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '1';
                                    }
                                }}
                                onMouseOut={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '';
                                    target.style.transform = 'translateY(0)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)';

                                    // 恢复图标
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = '';
                                    }

                                    // 隐藏交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '0';
                                    }
                                }}
                            >
                                {/* 波纹动画效果 - 绝对定位在卡片后面 */}
                                <div className="ripple-background" style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'radial-gradient(circle, transparent 1%, #F4F6F8 1%) center/15000%',
                                    opacity: 0.8,
                                    transform: 'translate3d(0,0,0)',
                                }}></div>

                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingSm" tone="subdued">
                                            Total Products
                                        </Text>
                                        <div className="card-icon" style={{
                                            transition: 'transform 0.3s ease'
                                        }}>
                                            <Icon source={ProductIcon} />
                                        </div>
                                    </InlineStack>
                                    <Text as="p" variant="heading2xl" fontWeight="bold">
                                        {stats.total}
                                    </Text>
                                    <InlineStack align="space-between">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Click to view all products
                                                <Icon source={ViewIcon} tone="subdued" />
                                            </span>
                                        </Text>
                                        {/* 交互提示指示器 */}
                                        <div className="interaction-hint" style={{
                                            background: 'rgba(0, 110, 255, 0.1)',
                                            color: '#006EFF',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: 0,
                                            transition: 'opacity 0.3s ease',
                                            animation: 'pulse 1.5s infinite'
                                        }}>
                                            <span>Click</span>
                                        </div>
                                    </InlineStack>
                                </BlockStack>
                            </div>
                        </Card>
                        <Card padding="0">
                            <div
                                style={{
                                    padding: '16px',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    height: '100%',
                                    boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => handleFilterCardClick('imported', '')}
                                onMouseOver={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '#F1F8F5';
                                    target.style.transform = 'translateY(-2px)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 4px 7px 0 rgba(63, 63, 68, 0.15)';

                                    // 添加波纹效果的元素
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = 'scale(1.2) rotate(10deg)';
                                    }

                                    // 显示交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '1';
                                    }
                                }}
                                onMouseOut={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '';
                                    target.style.transform = 'translateY(0)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)';

                                    // 恢复图标
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = '';
                                    }

                                    // 隐藏交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '0';
                                    }
                                }}
                            >
                                {/* 波纹动画效果 - 绝对定位在卡片后面 */}
                                <div className="ripple-background" style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'radial-gradient(circle, transparent 1%, #F1F8F5 1%) center/15000%',
                                    opacity: 0.8,
                                    transform: 'translate3d(0,0,0)',
                                }}></div>

                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingSm" tone="subdued">
                                            Imported
                                        </Text>
                                        <div className="card-icon" style={{
                                            transition: 'transform 0.3s ease'
                                        }}>
                                            <Icon source={ImportIcon} tone="success" />
                                        </div>
                                    </InlineStack>
                                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                                        {stats.imported}
                                    </Text>
                                    <InlineStack align="space-between">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Click to view imported products
                                                <Icon source={ViewIcon} tone="subdued" />
                                            </span>
                                        </Text>
                                        {/* 交互提示指示器 */}
                                        <div className="interaction-hint" style={{
                                            background: 'rgba(0, 128, 96, 0.1)',
                                            color: '#008060',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: 0,
                                            transition: 'opacity 0.3s ease',
                                            animation: 'pulse 1.5s infinite'
                                        }}>
                                            <span>Click</span>
                                        </div>
                                    </InlineStack>
                                </BlockStack>
                            </div>
                        </Card>
                        <Card padding="0">
                            <div
                                style={{
                                    padding: '16px',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    height: '100%',
                                    boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => handleFilterCardClick('pending', '')}
                                onMouseOver={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '#FDF8E8';
                                    target.style.transform = 'translateY(-2px)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 4px 7px 0 rgba(63, 63, 68, 0.15)';

                                    // 添加波纹效果的元素
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = 'scale(1.2) rotate(10deg)';
                                    }

                                    // 显示交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '1';
                                    }
                                }}
                                onMouseOut={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '';
                                    target.style.transform = 'translateY(0)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)';

                                    // 恢复图标
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = '';
                                    }

                                    // 隐藏交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '0';
                                    }
                                }}
                            >
                                {/* 波纹动画效果 - 绝对定位在卡片后面 */}
                                <div className="ripple-background" style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'radial-gradient(circle, transparent 1%, #FDF8E8 1%) center/15000%',
                                    opacity: 0.8,
                                    transform: 'translate3d(0,0,0)',
                                }}></div>

                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingSm" tone="subdued">
                                            Pending
                                        </Text>
                                        <div className="card-icon" style={{
                                            transition: 'transform 0.3s ease'
                                        }}>
                                            <Icon source={CalendarIcon} tone="warning" />
                                        </div>
                                    </InlineStack>
                                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="caution">
                                        {stats.pending}
                                    </Text>
                                    <InlineStack align="space-between">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Click to view pending products
                                                <Icon source={ViewIcon} tone="subdued" />
                                            </span>
                                        </Text>
                                        {/* 交互提示指示器 */}
                                        <div className="interaction-hint" style={{
                                            background: 'rgba(216, 123, 0, 0.1)',
                                            color: '#D87B00',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: 0,
                                            transition: 'opacity 0.3s ease',
                                            animation: 'pulse 1.5s infinite'
                                        }}>
                                            <span>Click</span>
                                        </div>
                                    </InlineStack>
                                </BlockStack>
                            </div>
                        </Card>
                        <Card padding="0">
                            <div
                                style={{
                                    padding: '16px',
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    height: '100%',
                                    boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => handleFilterCardClick('', 'true')}
                                onMouseOver={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '#F1F8F5';
                                    target.style.transform = 'translateY(-2px)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 4px 7px 0 rgba(63, 63, 68, 0.15)';

                                    // 添加波纹效果的元素
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = 'scale(1.2) rotate(10deg)';
                                    }

                                    // 显示交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '1';
                                    }
                                }}
                                onMouseOut={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const target = e.currentTarget;
                                    target.style.backgroundColor = '';
                                    target.style.transform = 'translateY(0)';
                                    target.style.boxShadow = '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)';

                                    // 恢复图标
                                    const icon = target.querySelector('.card-icon') as HTMLElement;
                                    if (icon) {
                                        icon.style.transform = '';
                                    }

                                    // 隐藏交互提示
                                    const hint = target.querySelector('.interaction-hint') as HTMLElement;
                                    if (hint) {
                                        hint.style.opacity = '0';
                                    }
                                }}
                            >
                                {/* 波纹动画效果 - 绝对定位在卡片后面 */}
                                <div className="ripple-background" style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'radial-gradient(circle, transparent 1%, #F1F8F5 1%) center/15000%',
                                    opacity: 0.8,
                                    transform: 'translate3d(0,0,0)',
                                }}></div>

                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <Text as="h3" variant="headingSm" tone="subdued">
                                            In Stock
                                        </Text>
                                        <div className="card-icon" style={{
                                            transition: 'transform 0.3s ease'
                                        }}>
                                            <Icon source={InventoryIcon} tone="success" />
                                        </div>
                                    </InlineStack>
                                    <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                                        {stats.inStock}
                                    </Text>
                                    <InlineStack align="space-between">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Click to view in stock products
                                                <Icon source={ViewIcon} tone="subdued" />
                                            </span>
                                        </Text>
                                        {/* 交互提示指示器 */}
                                        <div className="interaction-hint" style={{
                                            background: 'rgba(0, 128, 96, 0.1)',
                                            color: '#008060',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: 0,
                                            transition: 'opacity 0.3s ease',
                                            animation: 'pulse 1.5s infinite'
                                        }}>
                                            <span>Click</span>
                                        </div>
                                    </InlineStack>
                                </BlockStack>
                            </div>
                        </Card>
                    </div>
                </Layout.Section>

                {/* 主要内容区域 */}
                <Layout.Section>
                    <Card>
                        <Box padding="400">
                            <BlockStack gap="400">
                                {/* 筛选器区域 */}
                                <Box>
                                    <Filters
                                        queryValue={searchValue}
                                        filters={filters}
                                        appliedFilters={appliedFilters}
                                        onQueryChange={handleFiltersQueryChange}
                                        onQueryClear={() => setSearchValue('')}
                                        onClearAll={handleFiltersClearAll}
                                        queryPlaceholder="Search products by name, SKU, or brand..."
                                    />
                                </Box>

                                {/* 选中产品的操作提示和批量操作 */}
                                {selectedProducts.length > 0 && (
                                    <Card>
                                        <Box padding="400">
                                            <InlineStack align="space-between">
                                                <BlockStack gap="200">
                                                    <Text as="h3" variant="headingSm" fontWeight="semibold">
                                                        {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected
                                                    </Text>
                                                    <Text as="p" variant="bodySm" tone="subdued">
                                                        Choose an action to perform on the selected products
                                                    </Text>
                                                </BlockStack>
                                                <InlineStack gap="200">
                                                    <Button
                                                        variant="primary"
                                                        icon={ImportIcon}
                                                        onClick={handleBulkImport}
                                                    >
                                                        Import to Shopify
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        icon={RefreshIcon}
                                                        onClick={handleBulkDatabaseUpdate}
                                                    >
                                                        Update Product Data
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        icon={RefreshIcon}
                                                        onClick={handleBulkStatusSync}
                                                    >
                                                        Sync Status
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        icon={InventoryIcon}
                                                        onClick={handleBulkInventorySync}
                                                    >
                                                        Sync Inventory
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        icon={ExportIcon}
                                                        onClick={() => showToast('Export function is under development')}
                                                    >
                                                        Export Data
                                                    </Button>
                                                    <Button
                                                        variant="secondary"
                                                        tone="critical"
                                                        icon={DeleteIcon}
                                                        onClick={() => setDeleteModalActive(true)}
                                                    >
                                                        Delete
                                                    </Button>
                                                    <Button
                                                        variant="tertiary"
                                                        onClick={() => setSelectedProducts([])}
                                                    >
                                                        Clear Selection
                                                    </Button>
                                                </InlineStack>
                                            </InlineStack>
                                        </Box>
                                    </Card>
                                )}

                                <Divider />

                                {/* 产品列表 */}
                                <div style={{ overflowX: 'auto' }}>
                                    <Box
                                        width="100%"
                                        borderWidth="025"
                                        borderColor="border"
                                        borderRadius="200"
                                        background="bg"
                                        shadow="100"
                                    >
                                        {products.length > 0 ? (
                                            /* 表格容器 - 响应式设计 */
                                            <div style={{
                                                minWidth: '1400px',
                                                width: '100%'
                                            }}>
                                                {/* 表头 */}
                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '50px 1fr 120px 160px 200px 160px',
                                                    gap: '12px',
                                                    padding: '16px 20px',
                                                    borderBottom: '1px solid #E1E3E5',
                                                    backgroundColor: '#F6F6F7',
                                                    fontWeight: 600,
                                                    fontSize: '12px',
                                                    color: '#6D7175',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px',
                                                    alignItems: 'center'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedProducts.length === products.length && products.length > 0}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedProducts(products.map(p => p.id));
                                                                } else {
                                                                    setSelectedProducts([]);
                                                                }
                                                            }}
                                                            style={{ margin: 0 }}
                                                        />
                                                    </div>
                                                    <div>Product Details</div>
                                                    <div style={{ textAlign: 'center' }}>Price</div>
                                                    <div style={{ textAlign: 'center' }}>Status</div>
                                                    <div style={{ textAlign: 'center' }}>Keywords</div>
                                                    <div style={{ textAlign: 'center' }}>Actions</div>
                                                </div>

                                                {/* 产品行 */}
                                                <div>
                                                    {products.map((product, index) => (
                                                        <div
                                                            key={product.id}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: '50px 1fr 120px 160px 200px 160px',
                                                                gap: '12px',
                                                                padding: '16px 20px',
                                                                borderBottom: index < products.length - 1 ? '1px solid #E1E3E5' : 'none',
                                                                alignItems: 'center',
                                                                transition: 'background-color 0.2s ease',
                                                                backgroundColor: selectedProducts.includes(product.id) ? '#F0F8FF' : 'transparent'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (!selectedProducts.includes(product.id)) {
                                                                    e.currentTarget.style.backgroundColor = '#F6F6F7';
                                                                }
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                if (!selectedProducts.includes(product.id)) {
                                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                                } else {
                                                                    e.currentTarget.style.backgroundColor = '#F0F8FF';
                                                                }
                                                            }}
                                                        >
                                                            {/* 复选框 */}
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedProducts.includes(product.id)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setSelectedProducts([...selectedProducts, product.id]);
                                                                        } else {
                                                                            setSelectedProducts(selectedProducts.filter(id => id !== product.id));
                                                                        }
                                                                    }}
                                                                    style={{ margin: 0 }}
                                                                />
                                                            </div>

                                                            {/* 产品详情 - 使用flex布局，占用剩余空间 */}
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: '12px',
                                                                minWidth: 0,
                                                                width: '100%'
                                                            }}>
                                                                <Thumbnail
                                                                    source={product.imageUrl || 'https://via.placeholder.com/64'}
                                                                    alt={product.title}
                                                                    size="large"
                                                                />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{
                                                                        fontWeight: 600,
                                                                        fontSize: '14px',
                                                                        lineHeight: '18px',
                                                                        marginBottom: '6px',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        display: '-webkit-box',
                                                                        WebkitLineClamp: 2,
                                                                        WebkitBoxOrient: 'vertical',
                                                                        maxHeight: '36px',
                                                                        wordBreak: 'break-word'
                                                                    }}>
                                                                        {product.title}
                                                                    </div>
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        marginBottom: '4px',
                                                                        flexWrap: 'wrap'
                                                                    }}>
                                                                        <Badge tone="info" size="small">
                                                                            {product.brandName}
                                                                        </Badge>
                                                                        <Text as="span" variant="bodySm" tone="subdued">
                                                                            {product.sku}
                                                                        </Text>
                                                                    </div>
                                                                    <Text as="span" variant="bodySm" tone="subdued">
                                                                        {formatDate(product.lastUpdated)}
                                                                    </Text>
                                                                </div>
                                                            </div>

                                                            {/* 价格 */}
                                                            <div style={{ textAlign: 'center' }}>
                                                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                                    {formatPrice(product.price, product.currency)}
                                                                </Text>
                                                            </div>

                                                            {/* 状态 */}
                                                            <div style={{
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '4px',
                                                                alignItems: 'center'
                                                            }}>
                                                                {getStatusBadge(product.importStatus)}
                                                                {getAvailabilityBadge(product.availability)}
                                                            </div>

                                                            {/* 关键词 */}
                                                            <div style={{
                                                                width: '100%',
                                                                overflow: 'hidden',
                                                                display: 'flex',
                                                                justifyContent: 'center'
                                                            }}>
                                                                <div style={{ maxWidth: '180px' }}>
                                                                    {renderKeywords(product.keywordsMatched)}
                                                                </div>
                                                            </div>

                                                            {/* 操作按钮 */}
                                                            <div style={{
                                                                display: 'flex',
                                                                gap: '4px',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                flexWrap: 'wrap'
                                                            }}>
                                                                <Button
                                                                    size="slim"
                                                                    icon={ViewIcon}
                                                                    variant="tertiary"
                                                                    onClick={() => {
                                                                        setSelectedProduct(product);
                                                                        setDetailModalActive(true);
                                                                    }}
                                                                    accessibilityLabel="View details"
                                                                />
                                                                <Button
                                                                    size="slim"
                                                                    icon={EditIcon}
                                                                    variant="tertiary"
                                                                    onClick={() => handleProductEdit(product)}
                                                                    accessibilityLabel="Edit product"
                                                                />

                                                                {/* 数据库更新按钮 - 对所有商品都显示 */}
                                                                <Button
                                                                    size="slim"
                                                                    icon={RefreshIcon}
                                                                    variant="tertiary"
                                                                    loading={importProgress[product.id]}
                                                                    onClick={() => handleDatabaseUpdate(product.id)}
                                                                    accessibilityLabel="Update product data from source API"
                                                                />

                                                                {/* Shopify相关操作按钮 */}
                                                                {product.importStatus === 'pending' && (
                                                                    <Button
                                                                        size="slim"
                                                                        variant="primary"
                                                                        icon={ImportIcon}
                                                                        loading={importProgress[product.id]}
                                                                        onClick={() => handleSingleImport(product.id)}
                                                                    >
                                                                        Import
                                                                    </Button>
                                                                )}
                                                                {product.importStatus === 'imported' && (
                                                                    <Button
                                                                        size="slim"
                                                                        variant="secondary"
                                                                        loading={importProgress[product.id]}
                                                                        onClick={() => handleSingleUpdate(product.id)}
                                                                    >
                                                                        Sync
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            /* 筛选结果为空的状态 */
                                            <Box padding="800">
                                                <BlockStack align="center" gap="400">
                                                    <div style={{
                                                        width: '120px',
                                                        height: '120px',
                                                        borderRadius: '50%',
                                                        backgroundColor: '#F6F6F7',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '48px'
                                                    }}>
                                                        🔍
                                                    </div>
                                                    <BlockStack align="center" gap="200">
                                                        <Text as="h3" variant="headingMd" alignment="center">
                                                            No products found
                                                        </Text>
                                                        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                                                            No products match your current search criteria. Try adjusting your filters or search terms.
                                                        </Text>
                                                    </BlockStack>
                                                    <InlineStack gap="200">
                                                        <Button
                                                            variant="primary"
                                                            onClick={handleFiltersClearAll}
                                                        >
                                                            Clear All Filters
                                                        </Button>
                                                        <Button
                                                            variant="secondary"
                                                            icon={ImportIcon}
                                                            onClick={() => showToast('Please go to Import page to fetch products')}
                                                        >
                                                            Import Products
                                                        </Button>
                                                    </InlineStack>
                                                </BlockStack>
                                            </Box>
                                        )}
                                    </Box>
                                </div>

                                {/* 分页 */}
                                {totalPages > 1 && (
                                    <Box>
                                        <InlineStack align="center">
                                            <Pagination
                                                hasPrevious={currentPage > 1}
                                                onPrevious={() => setCurrentPage(currentPage - 1)}
                                                hasNext={currentPage < totalPages}
                                                onNext={() => setCurrentPage(currentPage + 1)}
                                                label={`Page ${currentPage} of ${totalPages}`}
                                            />
                                        </InlineStack>
                                    </Box>
                                )}
                            </BlockStack>
                        </Box>
                    </Card>
                </Layout.Section>
            </Layout>

            {/* 删除确认模态框 */}
            <Modal
                open={deleteModalActive}
                onClose={() => setDeleteModalActive(false)}
                title="确认删除 / Confirm Deletion"
                primaryAction={{
                    content: '删除产品 / Delete Products',
                    destructive: true,
                    onAction: handleBulkDelete,
                }}
                secondaryActions={[
                    {
                        content: '取消 / Cancel',
                        onAction: () => setDeleteModalActive(false),
                    },
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="400">
                        <Text as="p" variant="bodyMd">
                            确定要删除选中的 {selectedProducts.length} 个产品吗？
                        </Text>
                        <Text as="p" variant="bodyMd">
                            Are you sure you want to delete the selected {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''}?
                        </Text>

                        {/* 产品状态统计 */}
                        {selectedProducts.length > 0 && (
                            <Box
                                padding="400"
                                background="bg-surface-secondary"
                                borderRadius="200"
                            >
                                <BlockStack gap="300">
                                    <Text as="h3" variant="headingSm">
                                        产品状态统计 / Selected Products Status
                                    </Text>
                                    <InlineStack gap="400" wrap={false}>
                                        <Box background="bg-surface" padding="300" borderRadius="200" borderColor="border" borderWidth="025">
                                            <BlockStack gap="100" align="center">
                                                <Text as="span" variant="bodySm" tone="subdued">已导入 / Imported</Text>
                                                <Text as="p" variant="headingLg" fontWeight="bold" tone="success">
                                                    {products.filter(p => selectedProducts.includes(p.id) && p.importStatus === 'imported').length}
                                                </Text>
                                            </BlockStack>
                                        </Box>
                                        <Box background="bg-surface" padding="300" borderRadius="200" borderColor="border" borderWidth="025">
                                            <BlockStack gap="100" align="center">
                                                <Text as="span" variant="bodySm" tone="subdued">待处理 / Pending</Text>
                                                <Text as="p" variant="headingLg" fontWeight="bold" tone="caution">
                                                    {products.filter(p => selectedProducts.includes(p.id) && p.importStatus === 'pending').length}
                                                </Text>
                                            </BlockStack>
                                        </Box>
                                        <Box background="bg-surface" padding="300" borderRadius="200" borderColor="border" borderWidth="025">
                                            <BlockStack gap="100" align="center">
                                                <Text as="span" variant="bodySm" tone="subdued">库存中 / In Stock</Text>
                                                <Text as="p" variant="headingLg" fontWeight="bold" tone="success">
                                                    {products.filter(p => selectedProducts.includes(p.id) && p.availability).length}
                                                </Text>
                                            </BlockStack>
                                        </Box>
                                    </InlineStack>
                                </BlockStack>
                            </Box>
                        )}

                        <Banner tone="critical">
                            <p><strong>警告 / Warning:</strong> 此操作无法撤消。所有产品数据将被永久删除。<br />
                                This action cannot be undone. All product data will be permanently removed.</p>

                            {products.filter(p => selectedProducts.includes(p.id) && p.importStatus === 'imported').length > 0 && (
                                <p style={{ marginTop: '8px' }}><strong>注意 / Note:</strong> 您选择的产品中包含已导入到Shopify的产品。删除这些产品将不会从Shopify商店中删除它们，仅从此应用中删除。</p>
                            )}
                        </Banner>
                    </BlockStack>
                </Modal.Section>
            </Modal>

            {/* Product detail modal */}
            {detailModalActive && selectedProduct && (
                <ProductDetailModal
                    product={selectedProduct}
                    open={detailModalActive}
                    onClose={() => {
                        setDetailModalActive(false);
                        setSelectedProduct(null);
                    }}
                    onImport={handleSingleImport}
                    isImporting={importProgress[selectedProduct.id] || false}
                />
            )}

            {/* Product edit modal */}
            {editModalActive && editingProduct && (
                <ProductEditModal
                    product={editingProduct}
                    open={editModalActive}
                    onClose={() => {
                        setEditModalActive(false);
                        setEditingProduct(null);
                    }}
                    onSave={handleSaveProductEdit}
                    isLoading={editLoading}
                />
            )}
        </Page>
    );
};

export default ProductsPage; 