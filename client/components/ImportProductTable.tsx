import React from 'react';
import {
    Card,
    BlockStack,
    InlineStack,
    Text,
    Button,
    Badge,
    DataTable,
    Thumbnail,
    Checkbox,
    ProgressBar,
} from '@shopify/polaris';
import { ImportIcon, ViewIcon } from '@shopify/polaris-icons';
import { UnifiedProduct } from '@shared/types';
import { ImportTask } from '../utils/taskPersistence';

interface ImportProductTableProps {
    task: ImportTask;
    onProductSelection: (taskId: string, productId: string, selected: boolean) => void;
    onSelectAll: (taskId: string, selected: boolean) => void;
    onImport: (taskId: string) => void;
    onViewProduct: (product: UnifiedProduct) => void;
    onClose: () => void;
}

const ImportProductTable: React.FC<ImportProductTableProps> = ({
    task,
    onProductSelection,
    onSelectAll,
    onImport,
    onViewProduct,
    onClose,
}) => {
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

    const getTaskResultRows = () => {
        return task.searchResults.map((product) => [
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '80px', minWidth: '350px' }}>
                <Checkbox
                    label=""
                    labelHidden
                    checked={task.selectedProducts.includes(product.id)}
                    onChange={(checked) => onProductSelection(task.id, product.id, checked)}
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
                    {product.categories.length > 0 ? product.categories.slice(0, 3).join(', ') : 'No category'}
                </div>
            </div>,
            <div style={{ minHeight: '80px', display: 'flex', alignItems: 'center', minWidth: '80px' }}>
                <Button
                    size="slim"
                    variant="plain"
                    icon={ViewIcon}
                    onClick={() => onViewProduct(product)}
                >
                    View
                </Button>
            </div>
        ]);
    };

    if (task.searchResults.length === 0) {
        return null;
    }

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                        {task.brandName} - Search Results ({task.searchResults.length} products)
                    </Text>
                    <InlineStack gap="200">
                        <Button
                            variant="plain"
                            onClick={() => onSelectAll(task.id, task.selectedProducts.length !== task.searchResults.length)}
                        >
                            {task.selectedProducts.length === task.searchResults.length ? 'Deselect All' : 'Select All'}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={onClose}
                        >
                            Close Details
                        </Button>
                        <Button
                            variant="primary"
                            icon={ImportIcon}
                            onClick={() => onImport(task.id)}
                            disabled={task.selectedProducts.length === 0 || task.status === 'importing'}
                            loading={task.status === 'importing'}
                        >
                            Import Selected Products ({task.selectedProducts.length.toString()})
                        </Button>
                    </InlineStack>
                </InlineStack>

                {task.status === 'importing' && (
                    <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">Importing products...</Text>
                        <ProgressBar progress={task.importProgress} />
                        <Text as="span" variant="bodySm" tone="subdued">
                            {task.importProgress}% completed
                        </Text>
                    </BlockStack>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <DataTable
                        columnContentTypes={['text', 'numeric', 'text', 'text', 'text']}
                        headings={['Product', 'Price', 'Stock Status', 'Category', 'Actions']}
                        rows={getTaskResultRows()}
                        truncate
                    />
                </div>
            </BlockStack>
        </Card>
    );
};

export default ImportProductTable;