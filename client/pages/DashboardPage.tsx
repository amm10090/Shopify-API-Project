import React from 'react';
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    InlineStack,
    Badge,
    ProgressBar,
    Button,
    Icon,
    Grid,
} from '@shopify/polaris';
import {
    ProductIcon,
    CollectionIcon,
    ImportIcon,
    CheckCircleIcon,
} from '@shopify/polaris-icons';

interface DashboardPageProps { }

const DashboardPage: React.FC<DashboardPageProps> = () => {
    // 模拟数据，实际应该从API获取
    const stats = {
        totalProducts: 1250,
        importedProducts: 980,
        pendingProducts: 200,
        failedProducts: 70,
        activeBrands: 8,
        totalBrands: 12,
        recentImports: 5,
    };

    const importProgress = (stats.importedProducts / stats.totalProducts) * 100;

    const recentActivity = [
        {
            id: '1',
            action: 'Imported Products',
            brand: 'Dreo',
            count: 25,
            status: 'success',
            time: '2 hours ago',
        },
        {
            id: '2',
            action: 'Sync Failed',
            brand: 'Canada Pet Care',
            count: 3,
            status: 'error',
            time: '4 hours ago',
        },
        {
            id: '3',
            action: 'Brand Activated',
            brand: 'Le Creuset',
            count: 1,
            status: 'info',
            time: '6 hours ago',
        },
    ];

    return (
        <Page title="Dashboard" subtitle="Product Import System Overview">
            <Layout>
                {/* 统计卡片 */}
                <Layout.Section>
                    <Grid>
                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between">
                                        <BlockStack gap="200">
                                            <Text as="h3" variant="headingMd">Total Products</Text>
                                            <Text as="p" variant="headingLg">{stats.totalProducts.toLocaleString()}</Text>
                                        </BlockStack>
                                        <Icon source={ProductIcon} />
                                    </InlineStack>
                                </BlockStack>
                            </Card>
                        </Grid.Cell>

                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between">
                                        <BlockStack gap="200">
                                            <Text as="h3" variant="headingMd">Active Brands</Text>
                                            <Text as="p" variant="headingLg">{stats.activeBrands}/{stats.totalBrands}</Text>
                                        </BlockStack>
                                        <Icon source={CollectionIcon} />
                                    </InlineStack>
                                </BlockStack>
                            </Card>
                        </Grid.Cell>

                        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 4, xl: 4 }}>
                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between">
                                        <BlockStack gap="200">
                                            <Text as="h3" variant="headingMd">Recent Imports</Text>
                                            <Text as="p" variant="headingLg">{stats.recentImports}</Text>
                                        </BlockStack>
                                        <Icon source={ImportIcon} />
                                    </InlineStack>
                                </BlockStack>
                            </Card>
                        </Grid.Cell>
                    </Grid>
                </Layout.Section>

                {/* 导入进度 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Import Progress</Text>
                            <BlockStack gap="400">
                                <InlineStack align="space-between">
                                    <Text as="h3" variant="headingMd">Product Import Status</Text>
                                    <Text as="span">{Math.round(importProgress)}% Completed</Text>
                                </InlineStack>
                                <ProgressBar progress={importProgress} />
                                <Grid>
                                    <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
                                        <BlockStack gap="200">
                                            <Badge tone="success">Imported</Badge>
                                            <Text as="p" variant="headingLg">{stats.importedProducts.toLocaleString()}</Text>
                                        </BlockStack>
                                    </Grid.Cell>
                                    <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
                                        <BlockStack gap="200">
                                            <Badge tone="attention">Pending</Badge>
                                            <Text as="p" variant="headingLg">{stats.pendingProducts.toLocaleString()}</Text>
                                        </BlockStack>
                                    </Grid.Cell>
                                    <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 4, xl: 4 }}>
                                        <BlockStack gap="200">
                                            <Badge tone="critical">Failed</Badge>
                                            <Text as="p" variant="headingLg">{stats.failedProducts.toLocaleString()}</Text>
                                        </BlockStack>
                                    </Grid.Cell>
                                </Grid>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 最近活动 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Recent Activity</Text>
                            <BlockStack gap="400">
                                {recentActivity.map((activity) => (
                                    <InlineStack key={activity.id} align="space-between">
                                        <InlineStack gap="300" align="center">
                                            <Icon
                                                source={activity.status === 'success' ? CheckCircleIcon : ImportIcon}
                                                tone={activity.status === 'success' ? 'success' : activity.status === 'error' ? 'critical' : 'base'}
                                            />
                                            <BlockStack gap="100">
                                                <Text as="span" variant="bodyMd" fontWeight="semibold">{activity.action}</Text>
                                                <Text as="span" variant="bodySm" tone="subdued">
                                                    {activity.brand} • {activity.count} items
                                                </Text>
                                            </BlockStack>
                                        </InlineStack>
                                        <Text as="span" variant="bodySm" tone="subdued">{activity.time}</Text>
                                    </InlineStack>
                                ))}
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>



                {/* 快速操作 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Quick Actions</Text>
                            <BlockStack gap="200">
                                <Button variant="primary" size="large">
                                    Start New Import
                                </Button>
                                <Button size="large">
                                    View All Products
                                </Button>
                                <Button size="large">
                                    Manage Brands
                                </Button>
                                <Button size="large">
                                        View Import History
                                </Button>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default DashboardPage; 