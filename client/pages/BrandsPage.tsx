import React, { useState, useCallback, useEffect } from 'react';
import {
    Page,
    Layout,
    Card,
    IndexTable,
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
    Spinner,
    EmptyState,
} from '@shopify/polaris';
import { PlusIcon, EditIcon, DeleteIcon } from '@shopify/polaris-icons';
import { brandApi } from '../services/api';
import { Brand } from '@shared/types';

interface BrandsPageProps {
    showToast: (message: string) => void;
    setIsLoading: (loading: boolean) => void;
}

const BrandsPage: React.FC<BrandsPageProps> = ({ showToast, setIsLoading }) => {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [createModalActive, setCreateModalActive] = useState(false);
    const [editModalActive, setEditModalActive] = useState(false);
    const [deleteModalActive, setDeleteModalActive] = useState(false);
    const [currentBrand, setCurrentBrand] = useState<Brand | null>(null);

    // 表单状态
    const [brandName, setBrandName] = useState('');
    const [apiType, setApiType] = useState('cj');
    const [apiId, setApiId] = useState('');
    const [isActive, setIsActive] = useState(true);

    // 获取品牌列表
    const fetchBrands = useCallback(async () => {
        try {
            setLoading(true);
            const response = await brandApi.getBrands();
            if (response.success && response.data) {
                setBrands(response.data);
            } else {
                showToast('Failed to fetch brands');
            }
        } catch (error) {
            console.error('Error fetching brands:', error);
            showToast('Failed to fetch brands');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // 组件挂载时获取数据
    useEffect(() => {
        fetchBrands();
    }, [fetchBrands]);

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
            const response = await brandApi.createBrand({
                name: brandName,
                apiType: apiType as 'cj' | 'pepperjam',
                apiId,
                isActive
            });

            if (response.success) {
                showToast(`Brand "${brandName}" created successfully`);
                setCreateModalActive(false);
                resetForm();
                fetchBrands(); // 刷新列表
            } else {
                showToast(response.error || 'Failed to create brand');
            }
        } catch (error) {
            console.error('Error creating brand:', error);
            showToast('Failed to create brand');
        } finally {
            setIsLoading(false);
        }
    }, [brandName, apiType, apiId, isActive, showToast, setIsLoading, fetchBrands]);

    const handleEditBrand = useCallback(async () => {
        if (!currentBrand) return;

        setIsLoading(true);
        try {
            const response = await brandApi.updateBrand(currentBrand.id, {
                name: brandName,
                apiType: apiType as 'cj' | 'pepperjam',
                apiId,
                isActive
            });

            if (response.success) {
                showToast(`Brand "${brandName}" updated successfully`);
                setEditModalActive(false);
                resetForm();
                fetchBrands(); // 刷新列表
            } else {
                showToast(response.error || 'Failed to update brand');
            }
        } catch (error) {
            console.error('Error updating brand:', error);
            showToast('Failed to update brand');
        } finally {
            setIsLoading(false);
        }
    }, [currentBrand, brandName, apiType, apiId, isActive, showToast, setIsLoading, fetchBrands]);

    const handleDeleteBrands = useCallback(async () => {
        setIsLoading(true);
        try {
            const deletePromises = selectedBrands.map(brandId => brandApi.deleteBrand(brandId));
            const results = await Promise.allSettled(deletePromises);

            const successCount = results.filter(result =>
                result.status === 'fulfilled' && result.value.success
            ).length;

            if (successCount > 0) {
                showToast(`Successfully deleted ${successCount} brand(s)`);
                fetchBrands(); // 刷新列表
            }

            if (successCount < selectedBrands.length) {
                showToast(`Failed to delete ${selectedBrands.length - successCount} brand(s)`);
            }

            setSelectedBrands([]);
            setDeleteModalActive(false);
        } catch (error) {
            console.error('Error deleting brands:', error);
            showToast('Failed to delete brands');
        } finally {
            setIsLoading(false);
        }
    }, [selectedBrands, showToast, setIsLoading, fetchBrands]);

    const handleSyncBrand = useCallback(async (brandId: string, brandName: string) => {
        setIsLoading(true);
        try {
            const response = await brandApi.updateSyncTime(brandId);
            if (response.success) {
                showToast(`Brand "${brandName}" synced successfully`);
                fetchBrands(); // 刷新列表以显示新的同步时间
            } else {
                showToast('Failed to sync brand');
            }
        } catch (error) {
            console.error('Error syncing brand:', error);
            showToast('Failed to sync brand');
        } finally {
            setIsLoading(false);
        }
    }, [showToast, setIsLoading, fetchBrands]);

    const openEditModal = (brand: Brand) => {
        setCurrentBrand(brand);
        setBrandName(brand.name);
        setApiType(brand.apiType);
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
        return apiType.toUpperCase() === 'CJ' ?
            <Badge tone="info">CJ</Badge> :
            <Badge tone="warning">Pepperjam</Badge>;
    };

    const formatDate = (date: Date | string) => {
        const d = new Date(date);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    };

    if (loading) {
        return (
            <Page title="Brand Management">
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

    if (brands.length === 0) {
        return (
            <Page
                title="Brand Management"
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
                            <EmptyState
                                heading="No brands found"
                                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                            >
                                <p>Get started by adding your first brand to sync products from CJ or Pepperjam APIs.</p>
                            </EmptyState>
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
            </Page>
        );
    }

    const rowMarkup = brands.map((brand, index) => (
        <IndexTable.Row
            id={brand.id}
            key={brand.id}
            selected={selectedBrands.includes(brand.id)}
            position={index}
        >
            <IndexTable.Cell>
                <BlockStack gap="100">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{brand.name}</Text>
                    <Text as="span" variant="bodySm" tone="subdued">ID: {brand.apiId}</Text>
                </BlockStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
                {getApiTypeBadge(brand.apiType)}
            </IndexTable.Cell>
            <IndexTable.Cell>
                {getStatusBadge(brand.isActive)}
            </IndexTable.Cell>
            <IndexTable.Cell>
                <BlockStack gap="100">
                    <Text as="span" variant="bodyMd">-- products</Text>
                    <Text as="span" variant="bodySm" tone="subdued">-- imported</Text>
                </BlockStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
                {formatDate(brand.lastSync)}
            </IndexTable.Cell>
            <IndexTable.Cell>
                <ButtonGroup>
                    <Button size="slim" onClick={() => openEditModal(brand)}>Edit</Button>
                    <Button size="slim" onClick={() => handleSyncBrand(brand.id, brand.name)}>Sync</Button>
                    <Button size="slim">View Products</Button>
                </ButtonGroup>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    const promotedBulkActions = [
        {
            content: 'Delete Brands',
            destructive: true,
            onAction: () => setDeleteModalActive(true),
        },
    ];

    const resourceName = {
        singular: 'brand',
        plural: 'brands',
    };

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
                        <IndexTable
                            resourceName={resourceName}
                            itemCount={brands.length}
                            headings={[
                                { title: 'Brand Name' },
                                { title: 'API Type' },
                                { title: 'Status' },
                                { title: 'Product Statistics' },
                                { title: 'Last Sync' },
                                { title: 'Actions' },
                            ]}
                            promotedBulkActions={promotedBulkActions}
                            selectedItemsCount={
                                selectedBrands.length === brands.length ? 'All' : selectedBrands.length
                            }
                            onSelectionChange={(selectionType, toggleType, selection) => {
                                if (selectionType === 'all') {
                                    setSelectedBrands(toggleType ? brands.map(brand => brand.id) : []);
                                } else if (selectionType === 'page') {
                                    setSelectedBrands(toggleType ? brands.map(brand => brand.id) : []);
                                } else if (typeof selection === 'string') {
                                    if (toggleType) {
                                        setSelectedBrands(prev => [...prev, selection]);
                                    } else {
                                        setSelectedBrands(prev => prev.filter(id => id !== selection));
                                    }
                                }
                            }}
                        >
                            {rowMarkup}
                        </IndexTable>
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