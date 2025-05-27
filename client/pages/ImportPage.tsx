import React, { useState, useCallback, useEffect } from 'react';
import {
    Page,
    Layout,
    Card,
    Form,
    FormLayout,
    TextField,
    Select,
    Button,
    BlockStack,
    InlineStack,
    Text,
    ProgressBar,
    Badge,
    DataTable,
    Thumbnail,
    Checkbox,
    Banner,
    Spinner,
    EmptyState,
} from '@shopify/polaris';
import { SearchIcon, ImportIcon } from '@shopify/polaris-icons';
import { brandApi, importApi } from '../services/api';
import { Brand, UnifiedProduct, ImportJob } from '@shared/types';

interface ImportPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

const ImportPage: React.FC<ImportPageProps> = ({ showToast, setIsLoading }) => {
    // 基础状态
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loadingBrands, setLoadingBrands] = useState(true);
    const [selectedBrand, setSelectedBrand] = useState('');
    const [keywords, setKeywords] = useState('');
    const [productLimit, setProductLimit] = useState('50');

    // 搜索和导入状态
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<UnifiedProduct[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [importProgress, setImportProgress] = useState(0);
    const [isImporting, setIsImporting] = useState(false);

    // 导入历史
    const [importHistory, setImportHistory] = useState<ImportJob[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // 获取品牌列表
    const fetchBrands = useCallback(async () => {
        try {
            setLoadingBrands(true);
            const response = await brandApi.getBrands();
            if (response.success && response.data) {
                setBrands(response.data.filter(brand => brand.isActive));
            } else {
                showToast('Failed to load brands');
            }
        } catch (error) {
            console.error('Error fetching brands:', error);
            showToast('Failed to load brands');
        } finally {
            setLoadingBrands(false);
        }
    }, [showToast]);

    // 获取导入历史
    const fetchImportHistory = useCallback(async () => {
        try {
            setLoadingHistory(true);
            const response = await importApi.getImportHistory({ limit: 5 });
            if (response.data) {
                setImportHistory(response.data);
            }
        } catch (error) {
            console.error('Error fetching import history:', error);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    // 组件挂载时获取数据
    useEffect(() => {
        fetchBrands();
        fetchImportHistory();

        // 设置定时器，每30秒刷新导入历史
        const interval = setInterval(() => {
            fetchImportHistory();
        }, 30000);

        return () => clearInterval(interval);
    }, [fetchBrands, fetchImportHistory]);

    // 处理产品选择
    const handleProductSelection = useCallback((productId: string, selected: boolean) => {
        setSelectedProducts(prev => {
            if (selected) {
                return [...prev, productId];
            } else {
                return prev.filter(id => id !== productId);
            }
        });
    }, []);

    // 全选/取消全选
    const handleSelectAll = useCallback((selected: boolean) => {
        if (selected) {
            setSelectedProducts(searchResults.map(product => product.id));
        } else {
            setSelectedProducts([]);
        }
    }, [searchResults]);

    const handleSearch = useCallback(async () => {
        if (!selectedBrand) {
            showToast('Please select a brand');
            return;
        }

        setIsSearching(true);
        setSearchResults([]);
        setSelectedProducts([]);

        try {
            // 启动导入任务
            const response = await importApi.startImport({
                brandId: selectedBrand,
                keywords: keywords.trim() || undefined,
                limit: parseInt(productLimit)
            });

            if (response.success && response.data) {
                showToast('Import job started, fetching products...');

                // 轮询检查任务状态
                const checkStatus = async () => {
                    try {
                        const statusResponse = await importApi.getImportStatus(response.data!.id);

                        if (statusResponse.success && statusResponse.data) {
                            const job = statusResponse.data;

                            if (job.status === 'completed') {
                                // 获取产品列表
                                const productsResponse = await fetch(`/api/products?brandId=${selectedBrand}&importStatus=pending`);
                                const productsResult = await productsResponse.json();

                                if (productsResult.data) {
                                    setSearchResults(productsResult.data);
                                    showToast(`Found ${productsResult.data.length} products`);
                                }
                                setIsSearching(false);
                                fetchImportHistory(); // 刷新导入历史
                            } else if (job.status === 'failed') {
                                showToast(`Import failed: ${job.errorMessage || 'Unknown error'}`);
                                setIsSearching(false);
                                fetchImportHistory(); // 刷新导入历史
                            } else {
                                // 继续轮询
                                setTimeout(checkStatus, 2000);
                            }
                        }
                    } catch (error) {
                        showToast('Error checking import status');
                        setIsSearching(false);
                    }
                };

                // 开始状态检查
                setTimeout(checkStatus, 2000);
            } else {
                showToast(response.error || 'Failed to start import');
                setIsSearching(false);
            }
        } catch (error) {
            showToast('Search failed');
            setIsSearching(false);
        }
    }, [selectedBrand, keywords, productLimit, showToast, fetchImportHistory]);

    const handleImport = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to import');
            return;
        }

        setIsImporting(true);
        setImportProgress(0);

        try {
            // 模拟进度更新
            const progressInterval = setInterval(() => {
                setImportProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return prev;
                    }
                    return prev + 10;
                });
            }, 500);

            // 调用Shopify导入API
            const response = await fetch('/api/shopify/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    productIds: selectedProducts
                })
            });

            const result = await response.json();
            clearInterval(progressInterval);
            setImportProgress(100);

            if (result.success) {
                const { success, failed, errors } = result.data;

                if (failed > 0) {
                    showToast(`Import completed: ${success} successful, ${failed} failed. Check console for details.`);
                    console.error('Import errors:', errors);
                } else {
                    showToast(`Successfully imported ${success} products to Shopify`);
                }

                setSelectedProducts([]);

                // 刷新搜索结果以显示更新的状态
                if (selectedBrand) {
                    const productsResponse = await fetch(`/api/products?brandId=${selectedBrand}`);
                    const productsResult = await productsResponse.json();

                    if (productsResult.data) {
                        setSearchResults(productsResult.data);
                    }
                }
            } else {
                showToast(result.error || 'Import failed');
            }
        } catch (error) {
            showToast('Import failed');
            console.error('Import error:', error);
        } finally {
            setIsImporting(false);
            setImportProgress(0);
        }
    }, [selectedProducts, selectedBrand, showToast]);

    const getAvailabilityBadge = (availability: boolean) => {
        return availability ?
            <Badge tone="success">In Stock</Badge> :
            <Badge tone="critical">Out of Stock</Badge>;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <Badge tone="success">Success</Badge>;
            case 'failed':
                return <Badge tone="critical">Failed</Badge>;
            case 'running':
                return <Badge tone="attention">Running</Badge>;
            default:
                return <Badge>Unknown</Badge>;
        }
    };

    const formatPrice = (price: number, currency: string = 'USD') => {
        if (currency === 'USD') {
            return `$${price.toFixed(2)}`;
        }
        return `${price.toFixed(2)} ${currency}`;
    };

    const formatDate = (date: Date | string) => {
        const d = new Date(date);
        const now = new Date();
        const diffInHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));

        if (diffInHours < 1) {
            return 'Just now';
        } else if (diffInHours < 24) {
            return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
        } else {
            const diffInDays = Math.floor(diffInHours / 24);
            return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
        }
    };

    // 生成品牌选项
    const brandOptions = [
        { label: 'Choose Brand', value: '' },
        ...brands.map(brand => ({
            label: `${brand.name} (${brand.apiType.toUpperCase()})`,
            value: brand.id
        }))
    ];

    // 生成搜索结果表格行
    const searchResultRows = searchResults.map((product) => [
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '80px', minWidth: '350px' }}>
            <Checkbox
                label=""
                labelHidden
                checked={selectedProducts.includes(product.id)}
                onChange={(checked) => handleProductSelection(product.id, checked)}
            />
            <Thumbnail
                source={product.imageUrl || 'https://via.placeholder.com/60'}
                alt={product.title}
                size="small"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontWeight: 600,
                    fontSize: '14px',
                    lineHeight: '18px',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    maxHeight: '36px'
                }}>
                    {product.title}
                </div>
                <div style={{
                    fontSize: '12px',
                    color: '#6B7280',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    maxHeight: '16px'
                }}>
                    {product.description ? product.description.substring(0, 60) + '...' : 'No description'}
                </div>
                {product.sku && (
                    <div style={{
                        fontSize: '12px',
                        color: '#6B7280',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    }}>
                        SKU: {product.sku}
                    </div>
                )}
            </div>
        </div>,
        <div style={{ minHeight: '80px', display: 'flex', alignItems: 'center', minWidth: '100px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>
                {formatPrice(product.price, product.currency)}
            </div>
        </div>,
        <div style={{ minHeight: '80px', display: 'flex', alignItems: 'center', minWidth: '100px' }}>
            {getAvailabilityBadge(product.availability)}
        </div>,
        <div style={{ minHeight: '80px', display: 'flex', alignItems: 'center', minWidth: '150px' }}>
            <div style={{
                fontSize: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                maxHeight: '32px'
            }}>
                {product.categories.length > 0 ? product.categories.slice(0, 3).join(', ') : 'No categories'}
            </div>
        </div>,
    ]);

    if (loadingBrands) {
        return (
            <Page title="Product Import" subtitle="Import products from CJ and Pepperjam APIs">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <div style={{ padding: '60px', textAlign: 'center' }}>
                                <Spinner size="large" />
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    Loading brands...
                                </Text>
                            </div>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page title="Product Import" subtitle="Import products from CJ and Pepperjam APIs">
            <Layout>
                {/* 搜索表单 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Search Products</Text>

                            {brands.length === 0 && (
                                <Banner tone="warning">
                                    <p>No active brands found. Please add and activate brands in the Brand Management page first.</p>
                                </Banner>
                            )}

                            <Form onSubmit={handleSearch}>
                                <FormLayout>
                                    <FormLayout.Group>
                                        <Select
                                            label="Select Brand"
                                            options={brandOptions}
                                            value={selectedBrand}
                                            onChange={setSelectedBrand}
                                            disabled={brands.length === 0}
                                        />
                                        <TextField
                                            label="Keywords"
                                            value={keywords}
                                            onChange={setKeywords}
                                            placeholder="Enter search keywords (optional)"
                                            helpText="Multiple keywords separated by commas"
                                            autoComplete="off"
                                        />
                                    </FormLayout.Group>
                                    <FormLayout.Group>
                                        <TextField
                                            label="Product Limit"
                                            type="number"
                                            value={productLimit}
                                            onChange={setProductLimit}
                                            min="1"
                                            max="200"
                                            helpText="Maximum number of products to fetch"
                                            autoComplete="off"
                                        />
                                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                            <Button
                                                variant="primary"
                                                icon={SearchIcon}
                                                loading={isSearching}
                                                disabled={!selectedBrand || brands.length === 0}
                                                submit
                                            >
                                                Search Products
                                            </Button>
                                        </div>
                                    </FormLayout.Group>
                                </FormLayout>
                            </Form>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 搜索结果 */}
                {searchResults.length > 0 && (
                    <Layout.Section>
                        <Card>
                            <BlockStack gap="400">
                                <InlineStack align="space-between">
                                    <Text as="h2" variant="headingMd">Search Results ({searchResults.length} products)</Text>
                                    <InlineStack gap="200">
                                        <Button
                                            variant="plain"
                                            onClick={() => handleSelectAll(selectedProducts.length !== searchResults.length)}
                                        >
                                            {selectedProducts.length === searchResults.length ? 'Deselect All' : 'Select All'}
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => {
                                                setSearchResults([]);
                                                setSelectedProducts([]);
                                                showToast('Search results cleared');
                                            }}
                                        >
                                            Clear Results
                                        </Button>
                                        <Button
                                            variant="primary"
                                            icon={ImportIcon}
                                            onClick={handleImport}
                                            disabled={selectedProducts.length === 0 || isImporting}
                                            loading={isImporting}
                                        >
                                            Import Selected ({selectedProducts.length.toString()})
                                        </Button>
                                    </InlineStack>
                                </InlineStack>

                                {isImporting && (
                                    <BlockStack gap="200">
                                        <Text as="h3" variant="headingMd">Importing products...</Text>
                                        <ProgressBar progress={importProgress} />
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            {importProgress}% Completed
                                        </Text>
                                    </BlockStack>
                                )}

                                <div style={{ overflowX: 'auto' }}>
                                    <DataTable
                                        columnContentTypes={['text', 'numeric', 'text', 'text']}
                                        headings={['Product', 'Price', 'Stock Status', 'Categories']}
                                        rows={searchResultRows}
                                        truncate
                                    />
                                </div>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                )}

                {/* 空状态 */}
                {!isSearching && searchResults.length === 0 && selectedBrand && (
                    <Layout.Section>
                        <Card>
                            <EmptyState
                                heading="No products found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>No products were found for the selected brand and keywords. Try adjusting your search criteria.</p>
                            </EmptyState>
                        </Card>
                    </Layout.Section>
                )}

                {/* 导入说明 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Import Instructions</Text>
                            <Banner tone="info">
                                <p>Products will be imported as drafts to Shopify. You can view and manage them in the Product Management page.</p>
                            </Banner>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Steps:</Text>
                                <ol style={{ paddingLeft: '20px' }}>
                                    <li>Select a brand from the dropdown</li>
                                    <li>Enter keywords (optional) to filter products</li>
                                    <li>Set the maximum number of products to fetch</li>
                                    <li>Click "Search Products" to fetch from the API</li>
                                    <li>Select the products you want to import</li>
                                    <li>Click "Import Selected" to import to Shopify</li>
                                </ol>
                            </BlockStack>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Notes:</Text>
                                <ul style={{ paddingLeft: '20px' }}>
                                    <li>Products are imported as drafts and added to brand-specific collections</li>
                                    <li>Product images are automatically validated (unless disabled in settings)</li>
                                    <li>Affiliate links are saved in product metafields</li>
                                    <li>Duplicate products are automatically updated instead of creating duplicates</li>
                                    <li>You can manage imported products in the Product Management page</li>
                                </ul>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 最近导入历史 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text as="h2" variant="headingMd">Recent Import History</Text>
                                <Button variant="plain" onClick={fetchImportHistory} loading={loadingHistory}>
                                    Refresh
                                </Button>
                            </InlineStack>

                            {loadingHistory ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <Spinner size="small" />
                                </div>
                            ) : importHistory.length > 0 ? (
                                <BlockStack gap="300">
                                    {importHistory.map((job) => {
                                        const brand = brands.find(b => b.id === job.brandId);
                                        return (
                                            <InlineStack key={job.id} align="space-between">
                                                <InlineStack gap="300" align="center">
                                                    <Text as="span" variant="bodyMd">
                                                        {brand?.name || 'Unknown Brand'} - {job.productsImported || job.productsFound || 0} products
                                                    </Text>
                                                    {getStatusBadge(job.status)}
                                                </InlineStack>
                                                <Text as="span" variant="bodySm" tone="subdued">
                                                    {formatDate(job.createdAt)}
                                                </Text>
                                            </InlineStack>
                                        );
                                    })}
                                    <Button variant="plain" size="large">View Full History</Button>
                                </BlockStack>
                            ) : (
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    No import history found. Start by searching and importing products.
                                </Text>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default ImportPage; 