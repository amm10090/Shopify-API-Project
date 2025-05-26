import React, { useState, useCallback, useEffect } from 'react';
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
} from '@shopify/polaris';
import { ImportIcon, ExportIcon, DeleteIcon } from '@shopify/polaris-icons';
import { productApi, brandApi, shopifyApi } from '../services/api';
import { UnifiedProduct, Brand } from '@shared/types';

interface ProductsPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

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
        try {
            setLoading(true);
            const params: any = {
                page: currentPage,
                limit,
            };

            if (brandFilter) params.brandId = brandFilter;
            if (statusFilter) params.importStatus = statusFilter;
            if (availabilityFilter) params.availability = availabilityFilter === 'true';
            if (searchValue) params.search = searchValue;

            const response = await productApi.getProducts(params);

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
        }
    }, [currentPage, brandFilter, statusFilter, availabilityFilter, searchValue, showToast]);

    // 组件挂载时获取数据
    useEffect(() => {
        fetchBrands();
    }, [fetchBrands]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

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
            setIsLoading(false);
        }
    }, [showToast, setIsLoading, fetchProducts]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'imported':
                return <Badge tone="success">Imported</Badge>;
            case 'pending':
                return <Badge tone="attention">Pending</Badge>;
            case 'failed':
                return <Badge tone="critical">Failed</Badge>;
            default:
                return <Badge>Unknown</Badge>;
        }
    };

    const getAvailabilityBadge = (availability: boolean) => {
        return availability ?
            <Badge tone="success">In Stock</Badge> :
            <Badge tone="critical">Out of Stock</Badge>;
    };

    const formatPrice = (price: number, currency: string = 'USD') => {
        if (currency === 'USD') {
            return `$${price.toFixed(2)}`;
        }
        return `${price.toFixed(2)} ${currency}`;
    };

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleDateString();
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

    if (loading && products.length === 0) {
        return (
            <Page title="Product Management">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <div style={{ padding: '60px', textAlign: 'center' }}>
                                <Spinner size="large" />
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    Loading products...
                                </Text>
                            </div>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    const rows = products.map((product) => [
        <InlineStack gap="300" align="center">
            <Thumbnail
                source={product.imageUrl || 'https://via.placeholder.com/50'}
                alt={product.title}
                size="small"
            />
            <BlockStack gap="100">
                <Text as="span" variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                <Text as="span" variant="bodySm" tone="subdued">{product.sku}</Text>
            </BlockStack>
        </InlineStack>,
        product.brandName,
        formatPrice(product.price, product.currency),
        getStatusBadge(product.importStatus),
        getAvailabilityBadge(product.availability),
        formatDate(product.lastUpdated),
        <ButtonGroup>
            <Button size="slim">View</Button>
            <Button size="slim">Edit</Button>
            {product.importStatus === 'pending' && (
                <Button
                    size="slim"
                    variant="primary"
                    onClick={() => handleSingleImport(product.id)}
                >
                    Import
                </Button>
            )}
        </ButtonGroup>
    ]);

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
            label: 'Status',
            filter: (
                <Select
                    label="Status"
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
                        { label: 'All', value: '' },
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

    const bulkActions = [
        {
            content: 'Import to Shopify',
            icon: ImportIcon,
            onAction: handleBulkImport,
        },
        {
            content: 'Export Data',
            icon: ExportIcon,
            onAction: () => showToast('Export function is under development'),
        },
        {
            content: 'Delete',
            icon: DeleteIcon,
            destructive: true,
            onAction: () => setDeleteModalActive(true),
        },
    ];

    if (products.length === 0 && !loading) {
        return (
            <Page
                title="Product Management"
                primaryAction={{
                    content: 'Import Products',
                    primary: true,
                    onAction: () => showToast('Please go to Import page to fetch products'),
                }}
            >
                <Layout>
                    <Layout.Section>
                        <Card>
                            <EmptyState
                                heading="No products found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>No products match your current filters, or no products have been imported yet. Try adjusting your search criteria or import products from the Import page.</p>
                            </EmptyState>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page
            title="Product Management"
            subtitle={`Total ${totalProducts} products`}
            primaryAction={{
                content: 'Import Products',
                primary: true,
                onAction: () => showToast('Please go to Import page to fetch products'),
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <div style={{ padding: '16px' }}>
                            <Filters
                                queryValue={searchValue}
                                filters={filters}
                                appliedFilters={appliedFilters}
                                onQueryChange={handleFiltersQueryChange}
                                onQueryClear={() => setSearchValue('')}
                                onClearAll={handleFiltersClearAll}
                                queryPlaceholder="Search products..."
                            />
                        </div>
                        <DataTable
                            columnContentTypes={[
                                'text',
                                'text',
                                'text',
                                'text',
                                'text',
                                'text',
                                'text',
                            ]}
                            headings={[
                                'Product',
                                'Brand',
                                'Price',
                                'Status',
                                'Stock',
                                'Last Updated',
                                'Actions',
                            ]}
                            rows={rows}
                            promotedBulkActions={bulkActions}
                            selectedItemsCount={selectedProducts.length}
                            onSelectionChange={handleSelectionChange}
                        />
                        {totalPages > 1 && (
                            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                                <Pagination
                                    hasPrevious={currentPage > 1}
                                    onPrevious={() => setCurrentPage(currentPage - 1)}
                                    hasNext={currentPage < totalPages}
                                    onNext={() => setCurrentPage(currentPage + 1)}
                                    label={`Page ${currentPage} of ${totalPages}`}
                                />
                            </div>
                        )}
                    </Card>
                </Layout.Section>
            </Layout>

            <Modal
                open={deleteModalActive}
                onClose={() => setDeleteModalActive(false)}
                title="Confirm Delete"
                primaryAction={{
                    content: 'Delete',
                    destructive: true,
                    onAction: handleBulkDelete,
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: () => setDeleteModalActive(false),
                    },
                ]}
            >
                <Modal.Section>
                    <TextContainer>
                        <p>Are you sure you want to delete the selected {selectedProducts.length} products? This action cannot be undone.</p>
                    </TextContainer>
                </Modal.Section>
            </Modal>
        </Page>
    );
};

export default ProductsPage; 