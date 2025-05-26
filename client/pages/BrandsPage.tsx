import React, { useState, useCallback } from 'react';
import {
    Page,
    Layout,
    Card,
    DataTable,
    Button,
    Badge,
    BlockStack,
    InlineStack,
    Text,
    Modal,
    Form,
    FormLayout,
    TextField,
    Select,
    Checkbox,
    TextContainer,
    ButtonGroup,
} from '@shopify/polaris';
import { PlusIcon, EditIcon, DeleteIcon } from '@shopify/polaris-icons';

interface BrandsPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

const BrandsPage: React.FC<BrandsPageProps> = ({ showToast, setIsLoading }) => {
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [createModalActive, setCreateModalActive] = useState(false);
    const [editModalActive, setEditModalActive] = useState(false);
    const [deleteModalActive, setDeleteModalActive] = useState(false);
    const [currentBrand, setCurrentBrand] = useState<any>(null);

    // 表单状态
    const [brandName, setBrandName] = useState('');
    const [apiType, setApiType] = useState('cj');
    const [apiId, setApiId] = useState('');
    const [isActive, setIsActive] = useState(true);

    // 模拟品牌数据
    const brands = [
        {
            id: '1',
            name: 'Dreo',
            apiType: 'CJ',
            apiId: '6088764',
            isActive: true,
            lastSync: '2024-01-15 10:30',
            productCount: 125,
            importedCount: 98,
        },
        {
            id: '2',
            name: 'Canada Pet Care',
            apiType: 'CJ',
            apiId: '4247933',
            isActive: true,
            lastSync: '2024-01-14 15:45',
            productCount: 89,
            importedCount: 67,
        },
        {
            id: '3',
            name: 'Le Creuset',
            apiType: 'PEPPERJAM',
            apiId: '6200',
            isActive: false,
            lastSync: '2024-01-10 09:15',
            productCount: 45,
            importedCount: 12,
        },
        {
            id: '4',
            name: 'BOMBAS',
            apiType: 'PEPPERJAM',
            apiId: '8171',
            isActive: true,
            lastSync: '2024-01-13 14:20',
            productCount: 78,
            importedCount: 56,
        },
    ];

    const resetForm = () => {
        setBrandName('');
        setApiType('cj');
        setApiId('');
        setIsActive(true);
        setCurrentBrand(null);
    };

    const handleCreateBrand = useCallback(async () => {
        setIsLoading(true);
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast(`Brand "${brandName}" created successfully`);
            setCreateModalActive(false);
            resetForm();
        } catch (error) {
            showToast('Failed to create brand');
        } finally {
            setIsLoading(false);
        }
    }, [brandName, showToast, setIsLoading]);

    const handleEditBrand = useCallback(async () => {
        setIsLoading(true);
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast(`Brand "${brandName}" updated successfully`);
            setEditModalActive(false);
            resetForm();
        } catch (error) {
            showToast('Failed to update brand');
        } finally {
            setIsLoading(false);
        }
    }, [brandName, showToast, setIsLoading]);

    const handleDeleteBrands = useCallback(async () => {
        setIsLoading(true);
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast(`Successfully deleted ${selectedBrands.length} brands`);
            setSelectedBrands([]);
            setDeleteModalActive(false);
        } catch (error) {
            showToast('Failed to delete brands');
        } finally {
            setIsLoading(false);
        }
    }, [selectedBrands, showToast, setIsLoading]);

    const handleSyncBrand = useCallback(async (brandId: string, brandName: string) => {
        setIsLoading(true);
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 2000));
            showToast(`Brand "${brandName}" synced successfully`);
        } catch (error) {
            showToast('Failed to sync brand');
        } finally {
            setIsLoading(false);
        }
    }, [showToast, setIsLoading]);

    const openEditModal = (brand: any) => {
        setCurrentBrand(brand);
        setBrandName(brand.name);
        setApiType(brand.apiType.toLowerCase());
        setApiId(brand.apiId);
        setIsActive(brand.isActive);
        setEditModalActive(true);
    };

    const getStatusBadge = (isActive: boolean) => {
        return isActive ?
            <Badge tone="success">Active</Badge> :
            <Badge tone="critical">Inactive</Badge>;
    };

    const getApiTypeBadge = (apiType: string) => {
        return apiType === 'CJ' ?
            <Badge tone="info">CJ</Badge> :
            <Badge tone="warning">Pepperjam</Badge>;
    };

    const rows = brands.map((brand) => [
        <BlockStack gap="100">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
            <Text as="span" variant="bodySm" tone="subdued">ID: {brand.apiId}</Text>
        </BlockStack>,
        getApiTypeBadge(brand.apiType),
        getStatusBadge(brand.isActive),
        <BlockStack gap="100">
            <Text as="span" variant="bodyMd">{brand.productCount} products</Text>
            <Text as="span" variant="bodySm" tone="subdued">{brand.importedCount} imported</Text>
        </BlockStack>,
        brand.lastSync,
        <ButtonGroup>
            <Button size="slim" onClick={() => openEditModal(brand)}>Edit</Button>
            <Button size="slim" onClick={() => handleSyncBrand(brand.id, brand.name)}>Sync</Button>
            <Button size="slim">View Products</Button>
        </ButtonGroup>
    ]);

    const bulkActions = [
        {
            content: 'Activate Brands',
            onAction: () => showToast('Batch activation feature under development'),
        },
        {
            content: 'Deactivate Brands',
            onAction: () => showToast('Batch deactivation feature under development'),
        },
        {
            content: 'Delete Brands',
            destructive: true,
            onAction: () => setDeleteModalActive(true),
        },
    ];

    return (
        <Page
            title="Brand Management"
            subtitle={`Total ${brands.length} brands`}
            primaryAction={{
                content: 'Add Brand',
                primary: true,
                icon: PlusIcon,
                onAction: () => setCreateModalActive(true),
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <DataTable
                            columnContentTypes={[
                                'text',
                                'text',
                                'text',
                                'text',
                                'text',
                                'text',
                            ]}
                            headings={[
                                'Brand Name',
                                'API Type',
                                'Status',
                                'Product Statistics',
                                'Last Sync',
                                'Actions',
                            ]}
                            rows={rows}
                        />
                    </Card>
                </Layout.Section>
            </Layout>

            {/* 创建品牌模态框 */}
            <Modal
                open={createModalActive}
                onClose={() => {
                    setCreateModalActive(false);
                    resetForm();
                }}
                title="Add New Brand"
                primaryAction={{
                    content: 'Create',
                    onAction: handleCreateBrand,
                    disabled: !brandName || !apiId,
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: () => {
                            setCreateModalActive(false);
                            resetForm();
                        },
                    },
                ]}
            >
                <Modal.Section>
                    <Form onSubmit={handleCreateBrand}>
                        <FormLayout>
                            <TextField
                                label="Brand Name"
                                value={brandName}
                                onChange={setBrandName}
                                placeholder="Enter brand name"
                                autoComplete="off"
                            />
                            <Select
                                label="API Type"
                                options={[
                                    { label: 'CJ (Commission Junction)', value: 'cj' },
                                    { label: 'Pepperjam', value: 'pepperjam' },
                                ]}
                                value={apiType}
                                onChange={setApiType}
                            />
                            <TextField
                                label="API ID"
                                value={apiId}
                                onChange={setApiId}
                                placeholder={apiType === 'cj' ? 'Enter Advertiser ID' : 'Enter Program ID'}
                                autoComplete="off"
                            />
                            <Checkbox
                                label="Activate Brand"
                                checked={isActive}
                                onChange={setIsActive}
                            />
                        </FormLayout>
                    </Form>
                </Modal.Section>
            </Modal>

            {/* 编辑品牌模态框 */}
            <Modal
                open={editModalActive}
                onClose={() => {
                    setEditModalActive(false);
                    resetForm();
                }}
                title="Edit Brand"
                primaryAction={{
                    content: 'Save',
                    onAction: handleEditBrand,
                    disabled: !brandName || !apiId,
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: () => {
                            setEditModalActive(false);
                            resetForm();
                        },
                    },
                ]}
            >
                <Modal.Section>
                    <Form onSubmit={handleEditBrand}>
                        <FormLayout>
                            <TextField
                                label="Brand Name"
                                value={brandName}
                                onChange={setBrandName}
                                placeholder="Enter brand name"
                                autoComplete="off"
                            />
                            <Select
                                label="API Type"
                                options={[
                                    { label: 'CJ (Commission Junction)', value: 'cj' },
                                    { label: 'Pepperjam', value: 'pepperjam' },
                                ]}
                                value={apiType}
                                onChange={setApiType}
                            />
                            <TextField
                                label="API ID"
                                value={apiId}
                                onChange={setApiId}
                                placeholder={apiType === 'cj' ? 'Enter Advertiser ID' : 'Enter Program ID'}
                                autoComplete="off"
                            />
                            <Checkbox
                                label="Activate Brand"
                                checked={isActive}
                                onChange={setIsActive}
                            />
                        </FormLayout>
                    </Form>
                </Modal.Section>
            </Modal>

            {/* 删除确认模态框 */}
            <Modal
                open={deleteModalActive}
                onClose={() => setDeleteModalActive(false)}
                title="Confirm Delete"
                primaryAction={{
                    content: 'Delete',
                    destructive: true,
                    onAction: handleDeleteBrands,
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
                        <p>Are you sure you want to delete the selected {selectedBrands.length} brands?</p>
                        <p>Deleting a brand will also delete all product data under it. This action cannot be undone.</p>
                    </TextContainer>
                </Modal.Section>
            </Modal>
        </Page>
    );
};

export default BrandsPage; 