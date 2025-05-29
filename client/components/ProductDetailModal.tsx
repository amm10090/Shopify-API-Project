import React, { useState } from 'react';
import {
    Modal,
    BlockStack,
    InlineStack,
    Text,
    Badge,
    Button,
    Divider,
    Box,
    Thumbnail,
    Banner,
    List,
    Collapsible,
    Card,
    Spinner,
} from '@shopify/polaris';
import { ImportIcon, ExternalIcon, EditIcon, CodeIcon } from '@shopify/polaris-icons';
import { UnifiedProduct } from '@shared/types';
import { getProductRawData } from '../services/api';

interface ProductDetailModalProps {
    product: UnifiedProduct | null;
    open: boolean;
    onClose: () => void;
    onImport?: (productId: string) => void;
    onEdit?: (productId: string) => void;
    isImporting?: boolean;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
    product,
    open,
    onClose,
    onImport,
    onEdit,
    isImporting = false
}) => {
    const [imageError, setImageError] = useState(false);
    const [apiDataExpanded, setApiDataExpanded] = useState(false);
    const [apiData, setApiData] = useState(null);
    const [loadingApiData, setLoadingApiData] = useState(false);

    if (!product) return null;

    const handleImageError = () => {
        setImageError(true);
    };

    // 获取API源数据
    const fetchApiData = async () => {
        if (apiData) return; // 如果已经加载过数据，直接返回

        setLoadingApiData(true);
        try {
            const rawData = await getProductRawData(product.id);
            setApiData(rawData);
        } catch (error) {
            console.error('Error fetching API data:', error);
        } finally {
            setLoadingApiData(false);
        }
    };

    const handleApiDataToggle = () => {
        if (!apiDataExpanded && !apiData) {
            fetchApiData();
        }
        setApiDataExpanded(!apiDataExpanded);
    };

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

    const getAvailabilityBadge = (availability: boolean) => {
        return availability ? (
            <Badge tone="success">In Stock</Badge>
        ) : (
            <Badge tone="critical">Out of Stock</Badge>
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
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const primaryActions = [];
    const secondaryActions = [
        {
            content: 'Close',
            onAction: onClose,
        }
    ];

    // Add import action if product is pending and callback is provided
    if (product.importStatus === 'pending' && onImport) {
        primaryActions.push({
            content: 'Import to Shopify',
            loading: isImporting,
            onAction: () => onImport(product.id),
            disabled: !product.availability,
        });
    }

    // Add update action if product is imported and callback is provided
    if (product.importStatus === 'imported' && onImport) {
        primaryActions.push({
            content: 'Update Product',
            loading: isImporting,
            onAction: () => onImport(product.id),
        });
    }

    // Add edit action if callback is provided
    if (onEdit) {
        secondaryActions.unshift({
            content: 'Edit Product',
            onAction: () => onEdit(product.id),
        });
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={product.title}
            size="large"
            primaryAction={primaryActions[0]}
            secondaryActions={secondaryActions}
        >
            <Modal.Section>
                <BlockStack gap="500">
                    {/* Product Image */}
                    <Box>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            minHeight: '300px',
                            backgroundColor: '#f6f6f7',
                            borderRadius: '8px',
                            border: '1px solid #e1e3e5'
                        }}>
                            {product.imageUrl && !imageError ? (
                                <img
                                    src={product.imageUrl}
                                    alt={product.title}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '400px',
                                        objectFit: 'contain',
                                        borderRadius: '8px'
                                    }}
                                    onError={handleImageError}
                                />
                            ) : (
                                <div style={{
                                    color: '#8c9196',
                                    textAlign: 'center',
                                    padding: '40px'
                                }}>
                                    <Text as="p" variant="bodyMd">
                                        {imageError ? 'Image failed to load' : 'No image available'}
                                    </Text>
                                </div>
                            )}
                        </div>
                    </Box>

                    {/* Product Basic Info */}
                    <BlockStack gap="300">
                        <InlineStack align="space-between">
                            <BlockStack gap="200">
                                <Text as="h2" variant="headingLg">
                                    {product.title}
                                </Text>
                                <InlineStack gap="200">
                                    <Badge tone="info">{product.brandName}</Badge>
                                    <Badge>{product.sourceApi.toUpperCase()}</Badge>
                                </InlineStack>
                            </BlockStack>
                            <BlockStack gap="100" align="end">
                                <Text as="p" variant="headingXl" fontWeight="bold">
                                    {formatPrice(product.price, product.currency)}
                                </Text>
                                {product.salePrice && product.salePrice < product.price && (
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Sale: {formatPrice(product.salePrice, product.currency)}
                                    </Text>
                                )}
                            </BlockStack>
                        </InlineStack>

                        <InlineStack gap="200">
                            {getStatusBadge(product.importStatus)}
                            {getAvailabilityBadge(product.availability)}
                        </InlineStack>
                    </BlockStack>

                    <Divider />

                    {/* Product Details */}
                    <BlockStack gap="400">
                        {/* Description */}
                        {product.description && (
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Description</Text>
                                <Text as="p" variant="bodyMd">
                                    {product.description}
                                </Text>
                            </BlockStack>
                        )}

                        {/* Product Information */}
                        <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">Product Information</Text>
                            <InlineStack gap="400" wrap>
                                <BlockStack gap="100">
                                    <Text as="p" variant="bodySm" tone="subdued">SKU</Text>
                                    <Text as="p" variant="bodyMd">
                                        {product.sku || 'Not available'}
                                    </Text>
                                </BlockStack>
                                <BlockStack gap="100">
                                    <Text as="p" variant="bodySm" tone="subdued">Source</Text>
                                    <Text as="p" variant="bodyMd">
                                        {product.sourceApi.toUpperCase()}
                                    </Text>
                                </BlockStack>
                                <BlockStack gap="100">
                                    <Text as="p" variant="bodySm" tone="subdued">Last Updated</Text>
                                    <Text as="p" variant="bodyMd">
                                        {formatDate(product.lastUpdated)}
                                    </Text>
                                </BlockStack>
                            </InlineStack>
                        </BlockStack>

                        {/* Categories */}
                        {product.categories && product.categories.length > 0 && (
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Categories</Text>
                                <InlineStack gap="200" wrap>
                                    {product.categories.map((category, index) => (
                                        <Badge key={index} tone="info">
                                            {category}
                                        </Badge>
                                    ))}
                                </InlineStack>
                            </BlockStack>
                        )}

                        {/* Keywords Matched */}
                        {product.keywordsMatched && product.keywordsMatched.length > 0 && (
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingMd">Matched Keywords</Text>
                                <InlineStack gap="200" wrap>
                                    {product.keywordsMatched.map((keyword, index) => (
                                        <Badge key={index} tone="success" size="small">
                                            {keyword}
                                        </Badge>
                                    ))}
                                </InlineStack>
                            </BlockStack>
                        )}

                        {/* External Links */}
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingMd">Links</Text>
                            <InlineStack gap="200">
                                <Button
                                    variant="plain"
                                    icon={ExternalIcon}
                                    url={product.affiliateUrl}
                                    external
                                >
                                    View Original Product
                                </Button>
                                {product.shopifyProductId && (
                                    <Button
                                        variant="plain"
                                        icon={ExternalIcon}
                                        url={`/admin/products/${product.shopifyProductId}`}
                                        external
                                    >
                                        View in Shopify
                                    </Button>
                                )}
                            </InlineStack>
                        </BlockStack>

                        {/* Import Status Details */}
                        {product.importStatus === 'failed' && (
                            <Banner tone="critical">
                                <p><strong>Import Failed:</strong> This product could not be imported. Please try again or contact support.</p>
                            </Banner>
                        )}

                        {product.importStatus === 'imported' && (
                            <Banner tone="success">
                                <p>This product has been successfully imported to Shopify.</p>
                            </Banner>
                        )}

                        {product.importStatus === 'pending' && !product.availability && (
                            <Banner tone="warning">
                                <p>This product is out of stock and cannot be imported.</p>
                            </Banner>
                        )}
                    </BlockStack>

                    <Divider />

                    {/* API 源数据展开框 */}
                    <BlockStack gap="300">
                        <InlineStack align="space-between">
                            <Text as="h3" variant="headingMd">API Source Data</Text>
                            <Button
                                variant="plain"
                                icon={CodeIcon}
                                onClick={handleApiDataToggle}
                                loading={loadingApiData}
                            >
                                {apiDataExpanded ? 'Hide' : 'Show'} Raw Data
                            </Button>
                        </InlineStack>

                        <Collapsible
                            open={apiDataExpanded}
                            id="api-data-collapsible"
                            transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
                        >
                            <Card>
                                <Box padding="400">
                                    {loadingApiData ? (
                                        <div style={{ textAlign: 'center', padding: '20px' }}>
                                            <Spinner size="small" />
                                            <Text as="p" variant="bodyMd" tone="subdued">
                                                Loading API data...
                                            </Text>
                                        </div>
                                    ) : apiData ? (
                                        <BlockStack gap="300">
                                            <Text as="h4" variant="headingSm">
                                                Original {product.sourceApi.toUpperCase()} API Response
                                            </Text>
                                            <Box
                                                background="bg-surface-secondary"
                                                padding="300"
                                                borderRadius="200"
                                                borderWidth="025"
                                                borderColor="border"
                                            >
                                                <pre style={{
                                                    fontSize: '12px',
                                                    lineHeight: '1.4',
                                                    margin: 0,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    maxHeight: '400px',
                                                    overflow: 'auto',
                                                    fontFamily: 'Monaco, Consolas, "Lucida Console", monospace'
                                                }}>
                                                    {JSON.stringify(apiData, null, 2)}
                                                </pre>
                                            </Box>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                                This is the raw data returned from the {product.sourceApi.toUpperCase()} API for this product.
                                            </Text>
                                        </BlockStack>
                                    ) : (
                                        <Text as="p" variant="bodyMd" tone="subdued">
                                            No raw API data available for this product.
                                        </Text>
                                    )}
                                </Box>
                            </Card>
                        </Collapsible>
                    </BlockStack>
                </BlockStack>
            </Modal.Section>
        </Modal>
    );
}; 