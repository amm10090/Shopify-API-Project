import React, { useState, useEffect, useCallback } from 'react';
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
    Spinner,
    Banner,
} from '@shopify/polaris';
import {
    ProductIcon,
    CollectionIcon,
    ImportIcon,
    CheckCircleIcon,
    RefreshIcon,
} from '@shopify/polaris-icons';
import { dashboardApi } from '../services/api';

interface DashboardPageProps {
    showToast?: (message: string) => void;
    setIsLoading?: (loading: boolean) => void;
}

interface DashboardStats {
    totalProducts: number;
    importedProducts: number;
    pendingProducts: number;
    failedProducts: number;
    totalBrands: number;
    activeBrands: number;
    recentImports: number;
    importProgress: number;
}

interface RecentActivity {
    id: string;
    action: string;
    brand: string;
    count: number;
    status: string;
    time: string;
}

interface TopBrand {
    brandId: string;
    brandName: string;
    productCount: number;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ showToast, setIsLoading }) => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
    const [topBrands, setTopBrands] = useState<TopBrand[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [error, setError] = useState<string>('');

    // 获取仪表板数据
    const fetchDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            setError('');

            const response = await dashboardApi.getStats();

            if (response.success && response.data) {
                setStats(response.data.stats);
                setRecentActivity(response.data.recentActivity || []);
                setTopBrands(response.data.topBrands || []);
                setLastUpdated(response.data.lastUpdated);
            } else {
                setError('Failed to load dashboard data');
                showToast?.('Failed to load dashboard data');
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            setError('Error loading dashboard data');
            showToast?.('Error loading dashboard data');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // 组件挂载时获取数据
    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // 手动刷新数据
    const handleRefresh = useCallback(async () => {
        setIsLoading?.(true);
        await fetchDashboardData();
        setIsLoading?.(false);
        showToast?.('Dashboard data refreshed');
    }, [fetchDashboardData, setIsLoading, showToast]);

    // 如果正在加载且没有数据，显示加载状态
    if (loading && !stats) {
        return (
            <Page title="Dashboard" subtitle="Product Import System Overview">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <div style={{ padding: '60px', textAlign: 'center' }}>
                                <Spinner size="large" />
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    Loading dashboard data...
                                </Text>
                            </div>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    // 如果有错误且没有数据，显示错误状态
    if (error && !stats) {
        return (
            <Page title="Dashboard" subtitle="Product Import System Overview">
                <Layout>
                    <Layout.Section>
                        <Banner tone="critical">
                            <p>{error}</p>
                        </Banner>
                        <Card>
                            <div style={{ padding: '60px', textAlign: 'center' }}>
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    Unable to load dashboard data
                                </Text>
                                <div style={{ marginTop: '16px' }}>
                                    <Button onClick={handleRefresh}>
                                        Try Again
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    // 确保 stats 不为 null
    if (!stats) {
        return null;
    }

    return (
        <Page
            title="Dashboard"
            subtitle={`Product Import System Overview • Last updated: ${lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}`}
            secondaryActions={[
                {
                    content: 'Refresh',
                    icon: RefreshIcon,
                    onAction: handleRefresh,
                    loading: loading
                }
            ]}
        >
            <Layout>
                {error && (
                    <Layout.Section>
                        <Banner tone="warning">
                            <p>{error} - Data may be outdated</p>
                        </Banner>
                    </Layout.Section>
                )}

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
                                    <Text as="span">{stats.importProgress}% Completed</Text>
                                </InlineStack>
                                <ProgressBar progress={stats.importProgress} />
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