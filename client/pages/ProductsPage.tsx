import React, { useState, useCallback } from 'react';
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
} from '@shopify/polaris';
import { ImportIcon, ExportIcon, DeleteIcon } from '@shopify/polaris-icons';

interface ProductsPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

const ProductsPage: React.FC<ProductsPageProps> = ({ showToast, setIsLoading }) => {
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [availabilityFilter, setAvailabilityFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteModalActive, setDeleteModalActive] = useState(false);

    // 模拟产品数据
    const products = [
        {
            id: '1',
            title: 'Dreo Air Fryer',
            brand: 'Dreo',
            price: '$129.99',
            status: 'imported',
            availability: true,
            imageUrl: 'https://via.placeholder.com/50',
            sku: 'DREO-CJ-12345',
            lastUpdated: '2024-01-15',
        },
        {
            id: '2',
            title: 'Canada Pet Care',
            brand: 'Canada Pet Care',
            price: '$24.99',
            status: 'pending',
            availability: true,
            imageUrl: 'https://via.placeholder.com/50',
            sku: 'CPC-CJ-67890',
            lastUpdated: '2024-01-14',
        },
        {
            id: '3',
            title: 'Le Creuset',
            brand: 'Le Creuset',
            price: '$299.99',
            status: 'failed',
            availability: false,
            imageUrl: 'https://via.placeholder.com/50',
            sku: 'LC-PEPPERJAM-11111',
            lastUpdated: '2024-01-13',
        },
    ];

    const handleSelectionChange = useCallback((selection: string[]) => {
        setSelectedProducts(selection);
    }, []);

    const handleBulkImport = useCallback(async () => {
        setIsLoading(true);
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 2000));
            showToast(`Successfully imported ${selectedProducts.length} products to Shopify`);
            setSelectedProducts([]);
        } catch (error) {
            showToast('Batch import failed');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading]);

    const handleBulkDelete = useCallback(async () => {
        setIsLoading(true);
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast(`Successfully deleted ${selectedProducts.length} products`);
            setSelectedProducts([]);
            setDeleteModalActive(false);
        } catch (error) {
            showToast('Batch delete failed');
        } finally {
            setIsLoading(false);
        }
    }, [selectedProducts, showToast, setIsLoading]);

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

    const rows = products.map((product) => [
        <InlineStack gap="300" align="center">
            <Thumbnail source={product.imageUrl} alt={product.title} size="small" />
            <BlockStack gap="100">
                <Text as="span" variant="bodyMd" fontWeight="semibold">{product.title}</Text>
                <Text as="span" variant="bodySm" tone="subdued">{product.sku}</Text>
            </BlockStack>
        </InlineStack>,
        product.brand,
        product.price,
        getStatusBadge(product.status),
        getAvailabilityBadge(product.availability),
        product.lastUpdated,
        <ButtonGroup>
            <Button size="slim">查看</Button>
            <Button size="slim">编辑</Button>
            {product.status === 'pending' && (
                <Button size="slim" variant="primary">导入</Button>
            )}
        </ButtonGroup>
    ]);

    const filters = [
        {
            key: 'brand',
            label: 'Brand',
            filter: (
                <Select
                    label="Brand"
                    labelHidden
                    options={[
                        { label: 'All Brands', value: '' },
                        { label: 'Dreo', value: 'dreo' },
                        { label: 'Canada Pet Care', value: 'canada-pet-care' },
                        { label: 'Le Creuset', value: 'le-creuset' },
                    ]}
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
    if (brandFilter) appliedFilters.push({
        key: 'brand',
        label: `Brand: ${brandFilter}`,
        onRemove: () => setBrandFilter('')
    });
    if (statusFilter) appliedFilters.push({
        key: 'status',
        label: `Status: ${statusFilter}`,
        onRemove: () => setStatusFilter('')
    });
    if (availabilityFilter) appliedFilters.push({
        key: 'availability',
        label: `Stock: ${availabilityFilter}`,
        onRemove: () => setAvailabilityFilter('')
    });

    const handleFiltersQueryChange = useCallback((value: string) => {
        setSearchValue(value);
    }, []);

    const handleFiltersClearAll = useCallback(() => {
        setBrandFilter('');
        setStatusFilter('');
        setAvailabilityFilter('');
        setSearchValue('');
    }, []);

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

    return (
        <Page
            title="Product Management"
            subtitle={`Total ${products.length} products`}
            primaryAction={{
                content: 'Get New Products',
                primary: true,
                onAction: () => showToast('Redirect to import page'),
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


                        />
                        <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                            <Pagination
                                hasPrevious={currentPage > 1}
                                onPrevious={() => setCurrentPage(currentPage - 1)}
                                hasNext={currentPage < 10}
                                onNext={() => setCurrentPage(currentPage + 1)}
                                label={`Page ${currentPage}, Total 10 pages`}
                            />
                        </div>
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