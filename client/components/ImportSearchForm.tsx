import React from 'react';
import {
    Card,
    Form,
    FormLayout,
    TextField,
    Select,
    Button,
    BlockStack,
    InlineStack,
    Text,
    Badge,
    Banner,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { Brand } from '@shared/types';

interface ImportSearchFormProps {
    brands: Brand[];
    selectedBrand: string;
    keywords: string;
    productLimit: string;
    onBrandChange: (value: string) => void;
    onKeywordsChange: (value: string) => void;
    onLimitChange: (value: string) => void;
    onSubmit: () => void;
    isLoading?: boolean;
}

const ImportSearchForm: React.FC<ImportSearchFormProps> = ({
    brands,
    selectedBrand,
    keywords,
    productLimit,
    onBrandChange,
    onKeywordsChange,
    onLimitChange,
    onSubmit,
    isLoading = false,
}) => {
    const brandOptions = [
        { label: 'Select Brand', value: '' },
        ...brands.map(brand => ({
            label: `${brand.name} (${brand.apiType.toUpperCase()})`,
            value: brand.id
        }))
    ];

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        onSubmit();
    };

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">Start New Search Task</Text>
                    <Badge tone="info">Multi-threaded Concurrent Import</Badge>
                </InlineStack>

                {brands.length === 0 && (
                    <Banner tone="warning">
                        <p>No active brands found. Please add and activate brands in the Brand Management page first.</p>
                    </Banner>
                )}

                <Form onSubmit={handleSubmit}>
                    <FormLayout>
                        <FormLayout.Group>
                            <Select
                                label="Select Brand"
                                options={brandOptions}
                                value={selectedBrand}
                                onChange={onBrandChange}
                                disabled={brands.length === 0 || isLoading}
                            />
                            <TextField
                                label="Keywords"
                                value={keywords}
                                onChange={onKeywordsChange}
                                placeholder="Enter search keywords (optional)"
                                helpText="Separate multiple keywords with commas"
                                autoComplete="off"
                                disabled={isLoading}
                            />
                        </FormLayout.Group>
                        <FormLayout.Group>
                            <TextField
                                label="Product Limit"
                                type="number"
                                value={productLimit}
                                onChange={onLimitChange}
                                min="1"
                                max="200"
                                helpText="此设置控制从API抓取的产品数量。抓取的产品会保存到数据库，然后可以在产品管理页面查看（分页显示）"
                                autoComplete="off"
                                disabled={isLoading}
                            />
                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <Button
                                    variant="primary"
                                    icon={SearchIcon}
                                    disabled={!selectedBrand || brands.length === 0 || isLoading}
                                    submit
                                    loading={isLoading}
                                >
                                    Start Search Task
                                </Button>
                            </div>
                        </FormLayout.Group>
                    </FormLayout>
                </Form>
            </BlockStack>
        </Card>
    );
};

export default ImportSearchForm;