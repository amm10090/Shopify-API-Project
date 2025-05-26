import React, { useState, useCallback, useEffect } from 'react';
import {
    Page,
    Layout,
    Card,
    Form,
    FormLayout,
    TextField,
    Button,
    BlockStack,
    InlineStack,
    Text,
    Banner,
    Checkbox,
    Select,
    Divider,
    Badge,
    List,
    Spinner,
} from '@shopify/polaris';
import { SaveIcon, ConnectIcon } from '@shopify/polaris-icons';
import { settingsApi } from '../services/api';

interface SettingsPageProps {
    showToast: (message: string) => void;
}

interface SystemSettings {
    cj: {
        configured: boolean;
        companyId: string | null;
        apiEndpoint: string;
    };
    pepperjam: {
        configured: boolean;
        apiEndpoint: string;
    };
    shopify: {
        configured: boolean;
        storeName: string | null;
        apiVersion: string;
    };
    system: {
        defaultProductLimit: number;
        skipImageValidation: boolean;
        logLevel: string;
        nodeEnv: string;
    };
}

interface SystemStatus {
    database: string;
    cj: string;
    pepperjam: string;
    shopify: string;
    lastCheck: string;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ showToast }) => {
    // 加载状态
    const [loading, setLoading] = useState(true);
    const [testingConnection, setTestingConnection] = useState<string>('');
    const [savingSettings, setSavingSettings] = useState(false);

    // 系统设置和状态
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [status, setStatus] = useState<SystemStatus | null>(null);

    // API 设置表单
    const [cjApiToken, setCjApiToken] = useState('');
    const [cjCompanyId, setCjCompanyId] = useState('');
    const [pepperjamApiKey, setPepperjamApiKey] = useState('');

    // Shopify 设置表单
    const [shopifyStoreUrl, setShopifyStoreUrl] = useState('');
    const [shopifyAccessToken, setShopifyAccessToken] = useState('');

    // 导入设置
    const [defaultProductLimit, setDefaultProductLimit] = useState('50');
    const [skipImageValidation, setSkipImageValidation] = useState(false);
    const [autoImportEnabled, setAutoImportEnabled] = useState(false);
    const [importSchedule, setImportSchedule] = useState('daily');

    // 通知设置
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [notificationEmail, setNotificationEmail] = useState('');

    // 获取当前设置
    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const [settingsResponse, statusResponse] = await Promise.all([
                settingsApi.getSettings(),
                settingsApi.getStatus()
            ]);

            if (settingsResponse.success && settingsResponse.data) {
                setSettings(settingsResponse.data);
                setDefaultProductLimit(settingsResponse.data.system.defaultProductLimit.toString());
                setSkipImageValidation(settingsResponse.data.system.skipImageValidation);
            }

            if (statusResponse.success && statusResponse.data) {
                setStatus(statusResponse.data);
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            showToast('Failed to load settings');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    // 组件挂载时获取设置
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // 测试 CJ API 连接
    const handleTestCjConnection = useCallback(async () => {
        if (!cjApiToken || !cjCompanyId) {
            showToast('Please enter CJ API Token and Company ID');
            return;
        }

        setTestingConnection('cj');
        try {
            const response = await settingsApi.testCjConnection({
                apiToken: cjApiToken,
                companyId: cjCompanyId
            });

            if (response.success) {
                showToast(`CJ API connection successful! Found ${response.data?.totalProducts || 0} products.`);
            } else {
                showToast(`CJ API connection failed: ${response.error}`);
            }
        } catch (error) {
            showToast('CJ API connection test failed');
        } finally {
            setTestingConnection('');
        }
    }, [cjApiToken, cjCompanyId, showToast]);

    // 测试 Pepperjam API 连接
    const handleTestPepperjamConnection = useCallback(async () => {
        if (!pepperjamApiKey) {
            showToast('Please enter Pepperjam API Key');
            return;
        }

        setTestingConnection('pepperjam');
        try {
            const response = await settingsApi.testPepperjamConnection({
                apiKey: pepperjamApiKey
            });

            if (response.success) {
                showToast(`Pepperjam API connection successful! Found ${response.data?.totalResults || 0} total results.`);
            } else {
                showToast(`Pepperjam API connection failed: ${response.error}`);
            }
        } catch (error) {
            showToast('Pepperjam API connection test failed');
        } finally {
            setTestingConnection('');
        }
    }, [pepperjamApiKey, showToast]);

    // 测试 Shopify 连接
    const handleTestShopifyConnection = useCallback(async () => {
        if (!shopifyStoreUrl || !shopifyAccessToken) {
            showToast('Please enter Shopify Store URL and Access Token');
            return;
        }

        setTestingConnection('shopify');
        try {
            const response = await settingsApi.testShopifyConnection({
                storeUrl: shopifyStoreUrl,
                accessToken: shopifyAccessToken
            });

            if (response.success) {
                showToast(`Shopify connection successful! Connected to ${response.data?.shopName || 'store'}.`);
            } else {
                showToast(`Shopify connection failed: ${response.error}`);
            }
        } catch (error) {
            showToast('Shopify connection test failed');
        } finally {
            setTestingConnection('');
        }
    }, [shopifyStoreUrl, shopifyAccessToken, showToast]);

    // 保存设置（这里只是模拟，实际需要后端支持）
    const handleSaveSettings = useCallback(async (settingsType: string) => {
        setSavingSettings(true);
        try {
            // 模拟保存操作
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast(`${settingsType} settings saved successfully`);
            
            // 重新获取设置以更新状态
            await fetchSettings();
        } catch (error) {
            showToast(`Failed to save ${settingsType} settings`);
        } finally {
            setSavingSettings(false);
        }
    }, [showToast, fetchSettings]);

    // 获取状态徽章
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'connected':
            case 'configured':
                return <Badge tone="success">Connected</Badge>;
            case 'disconnected':
            case 'not_configured':
                return <Badge tone="critical">Not Connected</Badge>;
            default:
                return <Badge tone="attention">Unknown</Badge>;
        }
    };

    if (loading) {
        return (
            <Page title="System Settings" subtitle="Configure API connections and import parameters">
                <Layout>
                    <Layout.Section>
                        <Card>
                            <div style={{ padding: '60px', textAlign: 'center' }}>
                                <Spinner size="large" />
                                <Text as="p" variant="bodyMd" tone="subdued">
                                    Loading settings...
                                </Text>
                            </div>
                        </Card>
                    </Layout.Section>
                </Layout>
            </Page>
        );
    }

    return (
        <Page title="System Settings" subtitle="Configure API connections and import parameters">
            <Layout>
                {/* API 设置 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">API Settings</Text>
                            
                            {/* CJ API 设置 */}
                            <Form onSubmit={() => handleSaveSettings('API')}>
                                <FormLayout>
                                    <Text as="h3" variant="headingMd">CJ (Commission Junction) API</Text>
                                    
                                    {settings?.cj.configured && (
                                        <Banner tone="success">
                                            <p>CJ API is currently configured with Company ID: {settings.cj.companyId}</p>
                                        </Banner>
                                    )}
                                    
                                    <FormLayout.Group>
                                        <TextField
                                            label="API Token"
                                            value={cjApiToken}
                                            onChange={setCjApiToken}
                                            type="password"
                                            placeholder="Enter CJ API Token"
                                            autoComplete="off"
                                        />
                                        <TextField
                                            label="Company ID"
                                            value={cjCompanyId}
                                            onChange={setCjCompanyId}
                                            placeholder="Enter Company ID"
                                            autoComplete="off"
                                        />
                                    </FormLayout.Group>
                                    
                                    <Button 
                                        onClick={handleTestCjConnection}
                                        loading={testingConnection === 'cj'}
                                        disabled={!cjApiToken || !cjCompanyId}
                                    >
                                        Test CJ Connection
                                    </Button>

                                    <Divider />

                                    {/* Pepperjam API 设置 */}
                                    <Text as="h3" variant="headingMd">Pepperjam API</Text>
                                    
                                    {settings?.pepperjam.configured && (
                                        <Banner tone="success">
                                            <p>Pepperjam API is currently configured</p>
                                        </Banner>
                                    )}
                                    
                                    <TextField
                                        label="API Key"
                                        value={pepperjamApiKey}
                                        onChange={setPepperjamApiKey}
                                        type="password"
                                        placeholder="Enter Pepperjam API Key"
                                        autoComplete="off"
                                    />
                                    
                                    <Button 
                                        onClick={handleTestPepperjamConnection}
                                        loading={testingConnection === 'pepperjam'}
                                        disabled={!pepperjamApiKey}
                                    >
                                        Test Pepperjam Connection
                                    </Button>

                                    <Button 
                                        variant="primary" 
                                        icon={SaveIcon} 
                                        loading={savingSettings}
                                        onClick={() => handleSaveSettings('API')}
                                    >
                                        Save API Settings
                                    </Button>
                                </FormLayout>
                            </Form>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* Shopify 设置 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Shopify Settings</Text>
                            <Form onSubmit={() => handleSaveSettings('Shopify')}>
                                <FormLayout>
                                    <Banner tone="info">
                                        <p>Configure Shopify connection to enable product import</p>
                                    </Banner>

                                    {settings?.shopify.configured && (
                                        <Banner tone="success">
                                            <p>Shopify is currently configured for store: {settings.shopify.storeName}</p>
                                        </Banner>
                                    )}

                                    <TextField
                                        label="Store URL"
                                        value={shopifyStoreUrl}
                                        onChange={setShopifyStoreUrl}
                                        placeholder="your-store.myshopify.com"
                                        helpText="Enter your Shopify store domain"
                                        autoComplete="off"
                                    />

                                    <TextField
                                        label="Access Token"
                                        value={shopifyAccessToken}
                                        onChange={setShopifyAccessToken}
                                        type="password"
                                        placeholder="Enter Shopify Access Token"
                                        helpText="Get from Shopify app settings"
                                        autoComplete="off"
                                    />

                                    <InlineStack gap="300">
                                        <Button 
                                            onClick={handleTestShopifyConnection}
                                            loading={testingConnection === 'shopify'}
                                            disabled={!shopifyStoreUrl || !shopifyAccessToken}
                                        >
                                            Test Shopify Connection
                                        </Button>
                                        <Button 
                                            variant="primary" 
                                            icon={SaveIcon}
                                            loading={savingSettings}
                                            onClick={() => handleSaveSettings('Shopify')}
                                        >
                                            Save Shopify Settings
                                        </Button>
                                    </InlineStack>
                                </FormLayout>
                            </Form>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 导入设置 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Import Settings</Text>
                            <Form onSubmit={() => handleSaveSettings('Import')}>
                                <FormLayout>
                                    <TextField
                                        label="Default Product Limit"
                                        type="number"
                                        value={defaultProductLimit}
                                        onChange={setDefaultProductLimit}
                                        min="1"
                                        max="500"
                                        helpText="Default number of products to import"
                                        autoComplete="off"
                                    />

                                    <Checkbox
                                        label="Skip Image Validation"
                                        checked={skipImageValidation}
                                        onChange={setSkipImageValidation}
                                        helpText="Skip image validation during import (faster but may import invalid images)"
                                    />

                                    <Checkbox
                                        label="Enable Auto Import"
                                        checked={autoImportEnabled}
                                        onChange={setAutoImportEnabled}
                                        helpText="Automatically fetch and update products from API"
                                    />

                                    {autoImportEnabled && (
                                        <Select
                                            label="Import Frequency"
                                            options={[
                                                { label: 'Daily', value: 'daily' },
                                                { label: 'Weekly', value: 'weekly' },
                                                { label: 'Monthly', value: 'monthly' },
                                            ]}
                                            value={importSchedule}
                                            onChange={setImportSchedule}
                                        />
                                    )}

                                    <Button 
                                        variant="primary" 
                                        icon={SaveIcon}
                                        loading={savingSettings}
                                        onClick={() => handleSaveSettings('Import')}
                                    >
                                        Save Import Settings
                                    </Button>
                                </FormLayout>
                            </Form>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 通知设置 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Notification Settings</Text>
                            <FormLayout>
                                <Checkbox
                                    label="Enable Email Notifications"
                                    checked={emailNotifications}
                                    onChange={setEmailNotifications}
                                    helpText="Receive import status and error notifications"
                                />

                                {emailNotifications && (
                                    <TextField
                                        label="Notification Email"
                                        type="email"
                                        value={notificationEmail}
                                        onChange={setNotificationEmail}
                                        placeholder="your-email@example.com"
                                        autoComplete="email"
                                    />
                                )}

                                <Button 
                                    variant="primary"
                                    loading={savingSettings}
                                    onClick={() => handleSaveSettings('Notification')}
                                >
                                    Save Notification Settings
                                </Button>
                            </FormLayout>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 系统状态 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text as="h2" variant="headingMd">System Status</Text>
                                <Button variant="plain" onClick={fetchSettings}>
                                    Refresh Status
                                </Button>
                            </InlineStack>
                            
                            <BlockStack gap="300">
                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Database Connection</Text>
                                    {status && getStatusBadge(status.database)}
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">CJ API Configuration</Text>
                                    {status && getStatusBadge(status.cj)}
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Pepperjam API Configuration</Text>
                                    {status && getStatusBadge(status.pepperjam)}
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Shopify Configuration</Text>
                                    {status && getStatusBadge(status.shopify)}
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Last Check Time</Text>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                        {status ? new Date(status.lastCheck).toLocaleString() : 'Never'}
                                    </Text>
                                </InlineStack>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 系统信息 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">System Information</Text>
                            <BlockStack gap="300">
                                {settings && (
                                    <>
                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">Environment</Text>
                                            <Badge tone={settings.system.nodeEnv === 'production' ? 'success' : 'attention'}>
                                                {settings.system.nodeEnv}
                                            </Badge>
                                        </InlineStack>

                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">Log Level</Text>
                                            <Text as="span" variant="bodySm" tone="subdued">
                                                {settings.system.logLevel}
                                            </Text>
                                        </InlineStack>

                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">CJ API Endpoint</Text>
                                            <Text as="span" variant="bodySm" tone="subdued">
                                                {settings.cj.apiEndpoint}
                                            </Text>
                                        </InlineStack>

                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">Pepperjam API Endpoint</Text>
                                            <Text as="span" variant="bodySm" tone="subdued">
                                                {settings.pepperjam.apiEndpoint}
                                            </Text>
                                        </InlineStack>

                                        <InlineStack align="space-between">
                                            <Text as="span" variant="bodyMd">Shopify API Version</Text>
                                            <Text as="span" variant="bodySm" tone="subdued">
                                                {settings.shopify.apiVersion}
                                            </Text>
                                        </InlineStack>
                                    </>
                                )}
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 帮助信息 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">Help Information</Text>
                            <BlockStack gap="400">
                                <Text as="h3" variant="headingMd">Get API Credentials:</Text>

                                <BlockStack gap="200">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">CJ API:</Text>
                                    <List type="bullet">
                                        <List.Item>Login to CJ Affiliate account</List.Item>
                                        <List.Item>Go to Account → Web Services</List.Item>
                                        <List.Item>Generate or get API Token</List.Item>
                                        <List.Item>Record your Company ID</List.Item>
                                    </List>
                                </BlockStack>

                                <BlockStack gap="200">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Pepperjam API:</Text>
                                    <List type="bullet">
                                        <List.Item>Login to Pepperjam account</List.Item>
                                        <List.Item>Go to Tools → API</List.Item>
                                        <List.Item>Generate API Key</List.Item>
                                    </List>
                                </BlockStack>

                                <BlockStack gap="200">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Shopify Access Token:</Text>
                                    <List type="bullet">
                                        <List.Item>Create a private app in Shopify admin</List.Item>
                                        <List.Item>Enable Admin API permissions</List.Item>
                                        <List.Item>Copy the generated Access Token</List.Item>
                                    </List>
                                </BlockStack>
                            </BlockStack>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
};

export default SettingsPage; 