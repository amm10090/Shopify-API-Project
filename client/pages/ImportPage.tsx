import React, { useState, useCallback } from 'react';
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
} from '@shopify/polaris';
import { SearchIcon, ImportIcon } from '@shopify/polaris-icons';

interface ImportPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

const ImportPage: React.FC<ImportPageProps> = ({ showToast, setIsLoading }) => {
    const [selectedBrand, setSelectedBrand] = useState('');
    const [keywords, setKeywords] = useState('');
    const [productLimit, setProductLimit] = useState('50');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [importProgress, setImportProgress] = useState(0);
    const [isImporting, setIsImporting] = useState(false);

    // 模拟品牌选项
    const brandOptions = [
        { label: 'Choose Brand', value: '' },
        { label: 'Dreo (CJ)', value: 'dreo' },
        { label: 'Canada Pet Care (CJ)', value: 'canada-pet-care' },
        { label: 'Le Creuset (Pepperjam)', value: 'le-creuset' },
        { label: 'BOMBAS (Pepperjam)', value: 'bombas' },
    ];

    // 模拟搜索结果
    const mockSearchResults = [
        {
            id: '1',
            title: 'Dreo Air Fryer 6.8L',
            price: '$129.99',
            imageUrl: 'https://via.placeholder.com/60',
            availability: true,
            categories: ['Kitchen', 'Appliances'],
            description: 'Air Fryer, 6.8L, suitable for home use...',
        },
        {
            id: '2',
            title: 'Dreo Smart Tower Fan',
            price: '$89.99',
            imageUrl: 'https://via.placeholder.com/60',
            availability: true,
            categories: ['Home', 'Fans'],
            description: 'Smart Tower Fan, quiet design, remote control...',
        },
        {
            id: '3',
            title: 'Dreo Humidifier',
            price: '$59.99',
            imageUrl: 'https://via.placeholder.com/60',
            availability: false,
            categories: ['Home', 'Health'],
            description: 'Ultrasonic humidifier, large capacity water tank...',
        },
    ];

    const handleSearch = useCallback(async () => {
        if (!selectedBrand) {
            showToast('Please select a brand');
            return;
        }

        setIsSearching(true);
        try {
            // 启动导入任务
            const response = await fetch('/api/import/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    brandId: selectedBrand,
                    keywords: keywords.trim() || undefined,
                    limit: parseInt(productLimit)
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast('Import job started, fetching products...');

                // 轮询检查任务状态
                const checkStatus = async () => {
                    try {
                        const statusResponse = await fetch(`/api/import/${result.data.id}/status`);
                        const statusResult = await statusResponse.json();

                        if (statusResult.success) {
                            const job = statusResult.data;

                            if (job.status === 'completed') {
                                // 获取产品列表
                                const productsResponse = await fetch(`/api/products?brandId=${selectedBrand}&importStatus=pending`);
                                const productsResult = await productsResponse.json();

                                if (productsResult.data) {
                                    setSearchResults(productsResult.data);
                                    showToast(`Found ${productsResult.data.length} products`);
                                }
                                setIsSearching(false);
                            } else if (job.status === 'failed') {
                                showToast(`Import failed: ${job.errorMessage || 'Unknown error'}`);
                                setIsSearching(false);
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
                showToast(result.error || 'Failed to start import');
                setIsSearching(false);
            }
        } catch (error) {
            showToast('Search failed');
            setIsSearching(false);
        }
    }, [selectedBrand, keywords, productLimit, showToast]);

    const handleImport = useCallback(async () => {
        if (selectedProducts.length === 0) {
            showToast('Please select products to import');
            return;
        }

        setIsImporting(true);
        setImportProgress(0);

        try {
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

    const searchResultRows = searchResults.map((product) => [
        <InlineStack gap="300" align="center">
            <Thumbnail source={product.imageUrl} alt={product.title} size="small" />
            <BlockStack gap="100">
                <Text as="span" variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                <Text as="span" variant="bodySm" tone="subdued">{product.description.substring(0, 50)}...</Text>
            </BlockStack>
        </InlineStack>,
        product.price,
        getAvailabilityBadge(product.availability),
        product.categories.join(', '),
    ]);

    return (
        <Page title="Product Import" subtitle="Import products from CJ and Pepperjam APIs">
            <Layout>
                {/* 搜索表单 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Search Products</Text>
                            <Form onSubmit={handleSearch}>
                                <FormLayout>
                                    <FormLayout.Group>
                                        <Select
                                            label="Select Brand"
                                            options={brandOptions}
                                            value={selectedBrand}
                                            onChange={setSelectedBrand}
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
                                                disabled={!selectedBrand}
                                                submit
                                            >
                                                搜索产品
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
                                    <Button
                                        variant="primary"
                                        icon={ImportIcon}
                                        onClick={handleImport}
                                        disabled={selectedProducts.length === 0 || isImporting}
                                        loading={isImporting}
                                    >
                                        Import Selected Products ({selectedProducts.length.toString()})
                                    </Button>
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

                                <DataTable
                                    columnContentTypes={['text', 'text', 'text', 'text']}
                                    headings={['Product', 'Price', 'Stock Status', 'Categories']}
                                    rows={searchResultRows}
                                />
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                )}

                {/* 导入说明 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Import Instructions</Text>
                            <Banner tone="info">
                                <p>Products will be imported as drafts to Shopify, you can view and manage them in the product management page.</p>
                            </Banner>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Steps:</Text>
                                <ol style={{ paddingLeft: '20px' }}>
                                    <li>Select the brand to search</li>
                                    <li>Enter keywords (optional)</li>
                                    <li>Set product limit</li>
                                    <li>Click search products</li>
                                    <li>Select products to import</li>
                                    <li>Click import button</li>
                                </ol>
                            </BlockStack>

                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Notes:</Text>
                                <ul style={{ paddingLeft: '20px' }}>
                                    <li>Products will be imported as drafts</li>
                                    <li>Product images will be automatically validated</li>
                                    <li>Affiliate links will be saved in product metafields</li>
                                    <li>Duplicate products will be automatically updated instead of duplicated</li>
                                </ul>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 最近导入历史 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Recent Imports</Text>
                            <BlockStack gap="400">
                                <InlineStack align="space-between">
                                    <InlineStack gap="300" align="center">
                                        <Text as="span" variant="bodyMd">Dreo - 25 products</Text>
                                        <Badge tone="success">Success</Badge>
                                    </InlineStack>
                                    <Text as="span" variant="bodySm" tone="subdued">2 hours ago</Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <InlineStack gap="300" align="center">
                                        <Text as="span" variant="bodyMd">Canada Pet Care - 15 products</Text>
                                        <Badge tone="success">Success</Badge>
                                    </InlineStack>
                                    <Text as="span" variant="bodySm" tone="subdued">1 day ago</Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <InlineStack gap="300" align="center">
                                        <Text as="span" variant="bodyMd">Le Creuset - 8 products</Text>
                                        <Badge tone="critical">Failed</Badge>
                                    </InlineStack>
                                    <Text as="span" variant="bodySm" tone="subdued">2 days ago</Text>
                                </InlineStack>

                                <Button variant="plain" size="large">View Full History</Button>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default ImportPage; 