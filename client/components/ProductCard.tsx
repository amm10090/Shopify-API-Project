import React, { useState } from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Badge,
    Thumbnail,
    Checkbox,
    Tooltip,
} from '@shopify/polaris';
import { ImportIcon, ViewIcon } from '@shopify/polaris-icons';
import { UnifiedProduct } from '@shared/types';

interface ProductCardProps {
    product: UnifiedProduct;
    onImport: (productId: string) => void;
    onSelect: (productId: string, selected: boolean) => void;
    onViewDetails?: (product: UnifiedProduct) => void;
    isSelected: boolean;
    isImporting?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
    product,
    onImport,
    onSelect,
    onViewDetails,
    isSelected,
    isImporting = false
}) => {
    const [importing, setImporting] = useState(false);

    const handleImport = async () => {
        setImporting(true);
        try {
            await onImport(product.id);
        } finally {
            setImporting(false);
        }
    };

    const handleSelect = (checked: boolean) => {
        onSelect(product.id, checked);
    };

    // 获取状态徽章
    const getStatusBadge = () => {
        switch (product.importStatus) {
            case 'imported':
                return <Badge tone="success">已导入</Badge>;
            case 'pending':
                return <Badge tone="attention">待导入</Badge>;
            case 'failed':
                return <Badge tone="critical">导入失败</Badge>;
            default:
                return <Badge>未知状态</Badge>;
        }
    };

    // 获取库存状态徽章
    const getAvailabilityBadge = () => {
        return product.availability ? (
            <Badge tone="success">有库存</Badge>
        ) : (
            <Badge tone="critical">缺货</Badge>
        );
    };

    // 格式化价格
    const formatPrice = (price: number, currency: string = 'USD') => {
        if (currency === 'USD') {
            return `$${price.toFixed(2)}`;
        }
        return `${price.toFixed(2)} ${currency}`;
    };

    // 截断文本
    const truncateText = (text: string, maxLength: number) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    };

    return (
        <Card>
            <div style={{ position: 'relative' }}>
                {/* 选择框 */}
                <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    zIndex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '4px',
                    padding: '4px'
                }}>
                    <Checkbox
                        label=""
                        labelHidden
                        checked={isSelected}
                        onChange={handleSelect}
                        ariaDescribedBy={`select-product-${product.id}`}
                    />
                </div>

                {/* 产品图片 */}
                <div style={{
                    height: '200px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#f6f6f7',
                    borderRadius: '8px 8px 0 0'
                }}>
                    {product.imageUrl ? (
                        <img
                            src={product.imageUrl}
                            alt={product.title}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain'
                            }}
                            onError={(e) => {
                                // 图片加载失败时显示占位符
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = `
                                    <div style="color: #8c9196; text-align: center; padding: 20px;">
                                        <p>图片加载失败</p>
                                    </div>
                                `;
                            }}
                        />
                    ) : (
                        <div style={{ color: '#8c9196', textAlign: 'center', padding: '20px' }}>
                            <p>暂无图片</p>
                        </div>
                    )}
                </div>

                {/* 产品信息 */}
                <div style={{ padding: '16px' }}>
                    <BlockStack gap="300">
                        {/* 标题和品牌 */}
                        <BlockStack gap="100">
                            <Tooltip content={product.title}>
                                <Text as="h3" variant="headingSm" fontWeight="semibold">
                                    {truncateText(product.title, 50)}
                                </Text>
                            </Tooltip>
                            <Text as="p" variant="bodySm" tone="subdued">
                                {product.brandName} • {product.sourceApi.toUpperCase()}
                            </Text>
                        </BlockStack>

                        {/* 价格 */}
                        <InlineStack align="space-between">
                            <BlockStack gap="100">
                                <Text as="p" variant="headingMd" fontWeight="bold">
                                    {formatPrice(product.price, product.currency)}
                                </Text>
                                {product.salePrice && product.salePrice < product.price && (
                                    <Text as="p" variant="bodySm" tone="subdued">
                                        <s>{formatPrice(product.salePrice, product.currency)}</s>
                                    </Text>
                                )}
                            </BlockStack>
                        </InlineStack>

                        {/* 状态徽章 */}
                        <InlineStack gap="200">
                            {getStatusBadge()}
                            {getAvailabilityBadge()}
                        </InlineStack>

                        {/* 分类 */}
                        {product.categories && product.categories.length > 0 && (
                            <Text as="p" variant="bodySm" tone="subdued">
                                分类: {product.categories.slice(0, 2).join(', ')}
                                {product.categories.length > 2 && '...'}
                            </Text>
                        )}

                        {/* 关键词匹配 */}
                        {product.keywordsMatched && product.keywordsMatched.length > 0 && (
                            <BlockStack gap="100">
                                <Text as="p" variant="bodySm" tone="subdued">
                                    匹配关键词:
                                </Text>
                                <InlineStack gap="100" wrap>
                                    {product.keywordsMatched.slice(0, 3).map((keyword, index) => (
                                        <Badge key={index} tone="info" size="small">
                                            {keyword}
                                        </Badge>
                                    ))}
                                    {product.keywordsMatched.length > 3 && (
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            +{product.keywordsMatched.length - 3} more
                                        </Text>
                                    )}
                                </InlineStack>
                            </BlockStack>
                        )}

                        {/* SKU */}
                        {product.sku && (
                            <Text as="p" variant="bodySm" tone="subdued">
                                SKU: {product.sku}
                            </Text>
                        )}

                        {/* 操作按钮 */}
                        <InlineStack gap="200">
                            {onViewDetails && (
                                <Button
                                    variant="plain"
                                    size="slim"
                                    icon={ViewIcon}
                                    onClick={() => onViewDetails(product)}
                                >
                                    View Details
                                </Button>
                            )}

                            {product.importStatus === 'pending' && (
                                <Button
                                    variant="primary"
                                    size="slim"
                                    icon={ImportIcon}
                                    loading={importing || isImporting}
                                    onClick={handleImport}
                                    disabled={!product.availability}
                                >
                                    Import
                                </Button>
                            )}

                            {product.importStatus === 'imported' && (
                                <>
                                    <Button
                                        variant="secondary"
                                        size="slim"
                                        loading={importing || isImporting}
                                        onClick={handleImport}
                                    >
                                        Update Product
                                    </Button>
                                    <Button
                                        variant="plain"
                                        size="slim"
                                        icon={ViewIcon}
                                        url={product.shopifyProductId ?
                                            `/admin/products/${product.shopifyProductId}` :
                                            undefined
                                        }
                                        external={!!product.shopifyProductId}
                                    >
                                        View in Shopify
                                    </Button>
                                </>
                            )}

                            <Button
                                variant="plain"
                                size="slim"
                                url={product.affiliateUrl}
                                external
                            >
                                Original Link
                            </Button>
                        </InlineStack>

                        {/* 最后更新时间 */}
                        <Text as="p" variant="bodySm" tone="subdued">
                            更新: {new Date(product.lastUpdated).toLocaleDateString('zh-CN')}
                        </Text>
                    </BlockStack>
                </div>
            </div>
        </Card>
    );
}; 