import React, { useState, useCallback, useEffect } from 'react';
import {
    Page,
    Layout,
    Card,
    Grid,
    Button,
    InlineStack,
    Text,
    Spinner,
    EmptyState,
    Pagination,
} from '@shopify/polaris';
import { ProductCard } from './ProductCard';
import { FilterPanel } from './FilterPanel';
import { ProductDetailModal } from './ProductDetailModal';
import { productApi } from '../services/api';
import { UnifiedProduct, ProductFilters } from '@shared/types';

interface ProductGridProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

export const ProductGrid: React.FC<ProductGridProps> = ({ showToast, setIsLoading }) => {
    const [products, setProducts] = useState<UnifiedProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState<ProductFilters>({
        keywords: [],
        brands: [],
        availability: undefined,
        priceRange: undefined,
        categories: []
    });

    // Product detail modal state
    const [detailModalActive, setDetailModalActive] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<UnifiedProduct | null>(null);

    const limit = 50; // 每页显示的产品数量

    // 获取产品数据
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page: currentPage,
                limit,
                brandId: filters.brands?.[0], // 简化：只支持单个品牌筛选
                availability: filters.availability,
                minPrice: filters.priceRange?.min,
                maxPrice: filters.priceRange?.max,
                search: filters.keywords?.join(' '),
            };

            const response = await productApi.getProducts(params);
            setProducts(response.data);
            setTotalPages(response.pagination.totalPages);
        } catch (error) {
            showToast('Failed to fetch products');
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    }, [currentPage, filters, showToast]);

    // 初始加载和筛选器变化时重新获取数据
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // 处理筛选器变化
    const handleFiltersChange = useCallback((newFilters: ProductFilters) => {
        setFilters(newFilters);
        setCurrentPage(1); // 重置到第一页
    }, []);

    // 处理产品选择
    const handleProductSelect = useCallback((productId: string, selected: boolean) => {
        setSelectedProducts(prev => {
            if (selected) {
                return [...prev, productId];
            } else {
                return prev.filter(id => id !== productId);
            }
        });
    }, []);

    // 处理单个产品导入
    const handleProductImport = useCallback(async (productId: string) => {
        setIsLoading(true);
        try {
            // 获取产品信息以确定是导入还是更新
            const product = products.find(p => p.id === productId);
            const isUpdate = product?.importStatus === 'imported';
            const endpoint = isUpdate ? '/api/shopify/update' : '/api/shopify/import';
            const actionName = isUpdate ? 'update' : 'import';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productIds: [productId]
                })
            });

            const result = await response.json();

            if (result.success) {
                const { success, failed, noChanges, errors } = result.data;

                if (failed > 0) {
                    showToast(`${actionName} failed: ${errors[0]?.error || 'Unknown error'}`);
                } else if (noChanges > 0) {
                    showToast('No changes detected - product is already up to date');
                } else {
                    showToast(`Product ${actionName}ed successfully`);
                }

                fetchProducts(); // Refresh product list
            } else {
                showToast(result.error || `Failed to ${actionName} product`);
            }
        } catch (error) {
            const product = products.find(p => p.id === productId);
            const isUpdate = product?.importStatus === 'imported';
            const actionName = isUpdate ? 'update' : 'import';
            showToast(`Failed to ${actionName} product`);
        } finally {
            setIsLoading(false);
        }
    }, [showToast, setIsLoading, fetchProducts, products]);

    // 处理批量导入
    const handleBulkImport = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to import');
            return;
        }

        setIsLoading(true);
        try {
            // 分离导入和更新的产品
            const productsToImport = selectedProducts.filter(id => {
                const product = products.find(p => p.id === id);
                return product?.importStatus !== 'imported';
            });

            const productsToUpdate = selectedProducts.filter(id => {
                const product = products.find(p => p.id === id);
                return product?.importStatus === 'imported';
            });

            let totalSuccess = 0;
            let totalFailed = 0;
            let totalNoChanges = 0;
            const allErrors: any[] = [];

            // 处理导入
            if (productsToImport.length > 0) {
                const importResponse = await fetch('/api/shopify/import', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        productIds: productsToImport
                    })
                });

                const importResult = await importResponse.json();
                if (importResult.success) {
                    totalSuccess += importResult.data.success;
                    totalFailed += importResult.data.failed;
                    allErrors.push(...importResult.data.errors);
                }
            }

            // 处理更新
            if (productsToUpdate.length > 0) {
                const updateResponse = await fetch('/api/shopify/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        productIds: productsToUpdate
                    })
                });

                const updateResult = await updateResponse.json();
                if (updateResult.success) {
                    totalSuccess += updateResult.data.success;
                    totalFailed += updateResult.data.failed;
                    totalNoChanges += updateResult.data.noChanges || 0;
                    allErrors.push(...updateResult.data.errors);
                }
            }

            // 显示结果
            if (totalFailed > 0) {
                showToast(`Operation completed: ${totalSuccess} successful, ${totalFailed} failed${totalNoChanges > 0 ? `, ${totalNoChanges} no changes` : ''}. Check console for details.`);
                console.error('Operation errors:', allErrors);
            } else if (totalNoChanges > 0) {
                showToast(`Operation completed: ${totalSuccess} successful, ${totalNoChanges} had no changes`);
            } else {
                showToast(`Successfully processed ${totalSuccess} products`);
            }

            setSelectedProducts([]);
            fetchProducts(); // Refresh product list

        } catch (error) {
            showToast('Failed to process products');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading, fetchProducts, products]);

    // 渲染产品网格
    const renderProductGrid = () => {
        if (loading) {
            return (
                <Card>
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <Spinner size="large" />
                        <Text as="p" variant="bodyMd" tone="subdued">
                            Loading products...
                        </Text>
                    </div>
                </Card>
            );
        }

        if (products.length === 0) {
            return (
                <Card>
                    <EmptyState
                        heading="No Products Found"
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>No products match your current filters. Try adjusting your search criteria.</p>
                    </EmptyState>
                </Card>
            );
        }

        return (
            <Card>
                <div style={{ padding: '16px' }}>
                    {selectedProducts.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <InlineStack align="space-between">
                                <Text as="p" variant="bodyMd">
                                    {selectedProducts.length} products selected
                                </Text>
                                <Button
                                    variant="primary"
                                    onClick={handleBulkImport}
                                >
                                    Process Selected Products
                                </Button>
                            </InlineStack>
                        </div>
                    )}

                    <Grid>
                        {products.map((product) => (
                            <Grid.Cell
                                key={product.id}
                                columnSpan={{ xs: 6, sm: 4, md: 3, lg: 3, xl: 2 }}
                            >
                                <ProductCard
                                    product={product}
                                    onImport={handleProductImport}
                                    onSelect={handleProductSelect}
                                    onViewDetails={(product) => {
                                        setSelectedProduct(product);
                                        setDetailModalActive(true);
                                    }}
                                    isSelected={selectedProducts.includes(product.id)}
                                />
                            </Grid.Cell>
                        ))}
                    </Grid>

                    {totalPages > 1 && (
                        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center' }}>
                            <Pagination
                                hasPrevious={currentPage > 1}
                                onPrevious={() => setCurrentPage(currentPage - 1)}
                                hasNext={currentPage < totalPages}
                                onNext={() => setCurrentPage(currentPage + 1)}
                                label={`Page ${currentPage} of ${totalPages}`}
                            />
                        </div>
                    )}
                </div>
            </Card>
        );
    };

    return (
        <Page
            title="Product Management"
            subtitle={`${products.length} products total`}
        >
            <Layout>
                <Layout.Section variant="oneThird">
                    <FilterPanel
                        filters={filters}
                        onFiltersChange={handleFiltersChange}
                    />
                </Layout.Section>
                <Layout.Section>
                    {renderProductGrid()}
                </Layout.Section>
            </Layout>

            {/* Product detail modal */}
            {detailModalActive && selectedProduct && (
                <ProductDetailModal
                    product={selectedProduct}
                    open={detailModalActive}
                    onClose={() => {
                        setDetailModalActive(false);
                        setSelectedProduct(null);
                    }}
                    onImport={handleProductImport}
                    isImporting={false}
                />
            )}
        </Page>
    );
}; 