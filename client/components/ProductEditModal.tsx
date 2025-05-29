import React, { useState, useEffect } from 'react';
import {
    Modal,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Form,
    FormLayout,
    TextField,
    Select,
    Checkbox,
    Badge,
    Banner,
    Box,
    Thumbnail,
} from '@shopify/polaris';
import { SaveIcon, ExternalIcon } from '@shopify/polaris-icons';
import { UnifiedProduct } from '@shared/types';
import { getShopifyProductAdminUrlSync, isValidShopifyProductId } from '../utils/shopify';

interface ProductEditModalProps {
    product: UnifiedProduct | null;
    open: boolean;
    onClose: () => void;
    onSave: (productId: string, updates: Partial<UnifiedProduct>) => void;
    isLoading?: boolean;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({
    product,
    open,
    onClose,
    onSave,
    isLoading = false
}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [imageUrl, setImageUrl] = useState('');
    const [availability, setAvailability] = useState(true);
    const [categories, setCategories] = useState('');
    const [sku, setSku] = useState('');

    // 当产品改变时重置表单
    useEffect(() => {
        if (product) {
            setTitle(product.title || '');
            setDescription(product.description || '');
            setPrice(product.price?.toString() || '');
            setSalePrice(product.salePrice?.toString() || '');
            setCurrency(product.currency || 'USD');
            setImageUrl(product.imageUrl || '');
            setAvailability(product.availability ?? true);
            setCategories(product.categories?.join(', ') || '');
            setSku(product.sku || '');
        }
    }, [product]);

    const handleSave = () => {
        if (!product) return;

        const updates: Partial<UnifiedProduct> = {
            title: title.trim(),
            description: description.trim(),
            price: parseFloat(price) || 0,
            salePrice: salePrice ? parseFloat(salePrice) : undefined,
            currency,
            imageUrl: imageUrl.trim(),
            availability,
            categories: categories.split(',').map(cat => cat.trim()).filter(Boolean),
            sku: sku.trim(),
        };

        onSave(product.id, updates);
    };

    const handleClose = () => {
        onClose();
    };

    if (!product) return null;

    const getStatusBadge = (status: string) => {
        const statusConfig = {
            imported: { tone: 'success' as const, label: 'Imported' },
            pending: { tone: 'attention' as const, label: 'Pending' },
            failed: { tone: 'critical' as const, label: 'Failed' },
        };

        const config = statusConfig[status as keyof typeof statusConfig] ||
            { tone: 'info' as const, label: 'Unknown' };

        return <Badge tone={config.tone}>{config.label}</Badge>;
    };

    const currencyOptions = [
        { label: 'USD ($)', value: 'USD' },
        { label: 'EUR (€)', value: 'EUR' },
        { label: 'GBP (£)', value: 'GBP' },
        { label: 'CAD (C$)', value: 'CAD' },
        { label: 'AUD (A$)', value: 'AUD' },
        { label: 'JPY (¥)', value: 'JPY' },
    ];

    const primaryActions = [
        {
            content: 'Save Changes',
            primary: true,
            loading: isLoading,
            onAction: handleSave,
            disabled: !title.trim() || !price || parseFloat(price) <= 0,
        }
    ];

    const secondaryActions = [
        {
            content: 'Cancel',
            onAction: handleClose,
        }
    ];

    // 如果产品已导入到Shopify，添加跳转到Shopify的按钮
    if (product.importStatus === 'imported' && isValidShopifyProductId(product.shopifyProductId)) {
        secondaryActions.unshift({
            content: 'Edit in Shopify',
            onAction: () => {
                // 使用标准的Shopify管理后台URL
                const shopifyUrl = getShopifyProductAdminUrlSync(product.shopifyProductId!);
                window.open(shopifyUrl, '_blank');
            },
        });
    }

    return (
        <Modal
            open={open}
            onClose={handleClose}
            title={`Edit Product: ${product.title}`}
            size="large"
            primaryAction={primaryActions[0]}
            secondaryActions={secondaryActions}
        >
            <Modal.Section>
                <BlockStack gap="500">
                    {/* 产品状态信息 */}
                    <Box>
                        <InlineStack align="space-between">
                            <BlockStack gap="200">
                                <InlineStack gap="200">
                                    <Badge tone="info">{product.brandName}</Badge>
                                    <Badge>{product.sourceApi.toUpperCase()}</Badge>
                                    {getStatusBadge(product.importStatus)}
                                </InlineStack>
                                <Text as="p" variant="bodySm" tone="subdued">
                                    Source ID: {product.sourceProductId}
                                </Text>
                                {product.shopifyProductId && (
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        Shopify ID: {product.shopifyProductId}
                                    </Text>
                                )}
                            </BlockStack>
                            {imageUrl && (
                                <Thumbnail
                                    source={imageUrl}
                                    alt={title}
                                    size="large"
                                />
                            )}
                        </InlineStack>
                    </Box>

                    {/* 导入状态提示 */}
                    {product.importStatus === 'imported' && (
                        <Banner tone="info">
                            <p>This product has been imported to Shopify. Changes made here will only update the local database. To modify the Shopify product, use "Edit in Shopify" button.</p>
                        </Banner>
                    )}

                    {product.importStatus === 'failed' && (
                        <Banner tone="critical">
                            <p>This product failed to import to Shopify. You can edit the details here and try importing again.</p>
                        </Banner>
                    )}

                    <Form onSubmit={handleSave}>
                        <FormLayout>
                            {/* 基本信息 */}
                            <FormLayout.Group>
                                <TextField
                                    label="Product Title"
                                    value={title}
                                    onChange={setTitle}
                                    placeholder="Enter product title"
                                    autoComplete="off"
                                    requiredIndicator
                                />
                                <TextField
                                    label="SKU"
                                    value={sku}
                                    onChange={setSku}
                                    placeholder="Enter SKU"
                                    autoComplete="off"
                                />
                            </FormLayout.Group>

                            <TextField
                                label="Description"
                                value={description}
                                onChange={setDescription}
                                placeholder="Enter product description"
                                multiline
                                autoComplete="off"
                            />

                            {/* 价格信息 */}
                            <FormLayout.Group>
                                <TextField
                                    label="Price"
                                    value={price}
                                    onChange={setPrice}
                                    placeholder="0.00"
                                    type="number"
                                    step={0.01}
                                    min="0"
                                    autoComplete="off"
                                    requiredIndicator
                                />
                                <TextField
                                    label="Sale Price (Optional)"
                                    value={salePrice}
                                    onChange={setSalePrice}
                                    placeholder="0.00"
                                    type="number"
                                    step={0.01}
                                    min="0"
                                    autoComplete="off"
                                    helpText="Leave empty if no sale price"
                                />
                            </FormLayout.Group>

                            <FormLayout.Group>
                                <Select
                                    label="Currency"
                                    options={currencyOptions}
                                    value={currency}
                                    onChange={setCurrency}
                                />
                                <div>
                                    <Checkbox
                                        label="In Stock"
                                        checked={availability}
                                        onChange={setAvailability}
                                        helpText="Check if product is available for purchase"
                                    />
                                </div>
                            </FormLayout.Group>

                            <TextField
                                label="Image URL"
                                value={imageUrl}
                                onChange={setImageUrl}
                                placeholder="https://example.com/image.jpg"
                                autoComplete="off"
                                helpText="Enter the URL of the product image"
                            />

                            <TextField
                                label="Categories"
                                value={categories}
                                onChange={setCategories}
                                placeholder="Category 1, Category 2, Category 3"
                                autoComplete="off"
                                helpText="Enter categories separated by commas"
                            />

                            {/* 只读字段 */}
                            <FormLayout.Group>
                                <TextField
                                    label="Source API"
                                    value={product.sourceApi.toUpperCase()}
                                    disabled
                                    autoComplete="off"
                                />
                                <TextField
                                    label="Brand"
                                    value={product.brandName}
                                    disabled
                                    autoComplete="off"
                                />
                            </FormLayout.Group>

                            <TextField
                                label="Affiliate URL"
                                value={product.affiliateUrl}
                                disabled
                                autoComplete="off"
                                helpText="This field cannot be edited as it's provided by the affiliate API"
                            />
                        </FormLayout>
                    </Form>
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}; 