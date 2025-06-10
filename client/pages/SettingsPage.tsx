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
    DataTable,
    Modal,
    TextContainer,
    Icon,
} from '@shopify/polaris';
import { SaveIcon, ConnectIcon, DeleteIcon, ReplayIcon, CheckCircleIcon, AlertCircleIcon } from '@shopify/polaris-icons';
import { settingsApi, shopifyApi, webhookApi } from '../services/api';

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
        strictImageValidation: boolean;
        defaultInventoryQuantity: number;
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

interface WebhookStatus {
    shop: string;
    totalWebhooks: number;
    requiredWebhooks: number;
    configuredRequired: number;
    missingRequired: number;
    extraWebhooks: number;
    isValid: boolean;
    lastChecked: string;
    webhookDetails: Array<{
        topic: string;
        configured: boolean;
        webhook: any | null;
        required: boolean;
    }>;
    extraWebhookDetails: any[];
    issues: string[];
}

interface Webhook {
    id: string;
    topic: string;
    address: string;
    format: string;
    createdAt: string;
    updatedAt: string;
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
    const [strictImageValidation, setStrictImageValidation] = useState(true);
    const [defaultInventoryQuantity, setDefaultInventoryQuantity] = useState('99');
    const [autoImportEnabled, setAutoImportEnabled] = useState(false);
    const [importSchedule, setImportSchedule] = useState('daily');

    // 通知设置
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [notificationEmail, setNotificationEmail] = useState('');

    // Webhook管理状态
    const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null);
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [webhookLoading, setWebhookLoading] = useState(false);
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);
    const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);

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

                // 填充系统设置表单字段
                setDefaultProductLimit(settingsResponse.data.system.defaultProductLimit.toString());
                setSkipImageValidation(settingsResponse.data.system.skipImageValidation);
                setStrictImageValidation(settingsResponse.data.system.strictImageValidation ?? true);
                setDefaultInventoryQuantity(settingsResponse.data.system.defaultInventoryQuantity?.toString() || '99');

                // 注意：出于安全考虑，API密钥等敏感信息不会从后端返回
                // 用户需要重新输入这些信息来更新它们
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

    // Get webhook status
    const fetchWebhookStatus = useCallback(async () => {
        try {
            setWebhookLoading(true);
            const [statusResponse, listResponse] = await Promise.all([
                webhookApi.getWebhookStatus(),
                webhookApi.listWebhooks()
            ]);

            if (statusResponse.success) {
                setWebhookStatus(statusResponse.data);
            }

            if (listResponse.success) {
                setWebhooks(listResponse.data.webhooks || []);
            }
        } catch (error) {
            console.error('Error fetching webhook status:', error);
            showToast('Failed to load webhook status');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast]);

    // 组件挂载时获取设置
    useEffect(() => {
        fetchSettings();
        fetchWebhookStatus();
    }, [fetchSettings, fetchWebhookStatus]);

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

    // 保存设置
    const handleSaveSettings = useCallback(async (settingsType: string) => {
        setSavingSettings(true);
        try {
            let settingsData: any = {};

            // 根据设置类型构建要保存的数据
            switch (settingsType) {
                case 'API':
                    settingsData = {
                        cjApiToken: cjApiToken || undefined,
                        cjCompanyId: cjCompanyId || undefined,
                        pepperjamApiKey: pepperjamApiKey || undefined
                    };
                    break;
                case 'Shopify':
                    settingsData = {
                        shopifyStoreUrl: shopifyStoreUrl || undefined,
                        shopifyAccessToken: shopifyAccessToken || undefined
                    };
                    break;
                case 'Import':
                    settingsData = {
                        defaultProductLimit: parseInt(defaultProductLimit) || 50,
                        skipImageValidation: skipImageValidation,
                        strictImageValidation: strictImageValidation,
                        defaultInventoryQuantity: parseInt(defaultInventoryQuantity) || 99,
                        autoImportEnabled: autoImportEnabled,
                        importSchedule: importSchedule
                    };
                    break;
                case 'Notification':
                    settingsData = {
                        emailNotifications: emailNotifications,
                        notificationEmail: notificationEmail || undefined
                    };
                    break;
                default:
                    throw new Error(`Unknown settings type: ${settingsType}`);
            }

            // 调用后端 API 保存设置
            const response = await settingsApi.saveSettings(settingsData);

            if (response.success) {
                showToast(`${settingsType} settings saved successfully`);
                // 重新获取设置以更新状态
                await fetchSettings();
            } else {
                throw new Error(response.error || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast(`Failed to save ${settingsType} settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSavingSettings(false);
        }
    }, [
        cjApiToken,
        cjCompanyId,
        pepperjamApiKey,
        shopifyStoreUrl,
        shopifyAccessToken,
        defaultProductLimit,
        skipImageValidation,
        strictImageValidation,
        defaultInventoryQuantity,
        autoImportEnabled,
        importSchedule,
        emailNotifications,
        notificationEmail,
        showToast,
        fetchSettings
    ]);

    // Webhook Management Functions
    const handleRegisterWebhooks = useCallback(async () => {
        try {
            setWebhookLoading(true);
            const response = await webhookApi.registerWebhooks();

            if (response.success) {
                const { successful, failed } = response.data;
                showToast(`Webhook registration completed: ${successful} successful, ${failed} failed`);
                await fetchWebhookStatus();
            } else {
                showToast(`Webhook registration failed: ${response.error}`);
            }
        } catch (error) {
            console.error('Error registering webhooks:', error);
            showToast('Webhook registration failed');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast, fetchWebhookStatus]);

    const handleValidateWebhooks = useCallback(async () => {
        try {
            setWebhookLoading(true);
            const response = await webhookApi.validateWebhooks();

            if (response.success) {
                const { isValid, missingWebhooks, issues } = response.data;
                if (isValid) {
                    showToast('Webhook configuration validation passed');
                } else {
                    showToast(`Issues found: ${missingWebhooks.length} missing webhooks, ${issues.length} configuration problems`);
                }
                await fetchWebhookStatus();
            } else {
                showToast(`Webhook validation failed: ${response.error}`);
            }
        } catch (error) {
            console.error('Error validating webhooks:', error);
            showToast('Webhook validation failed');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast, fetchWebhookStatus]);

    const handleRepairWebhooks = useCallback(async () => {
        try {
            setWebhookLoading(true);
            const response = await webhookApi.repairWebhooks();

            if (response.success) {
                const { repaired, errors } = response.data;
                if (errors.length === 0) {
                    showToast(`Successfully repaired ${repaired.length} webhooks`);
                } else {
                    showToast(`Repaired ${repaired.length} webhooks, ${errors.length} failed`);
                }
                await fetchWebhookStatus();
            } else {
                showToast(`Webhook repair failed: ${response.error}`);
            }
        } catch (error) {
            console.error('Error repairing webhooks:', error);
            showToast('Webhook repair failed');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast, fetchWebhookStatus]);

    const handleDeleteWebhook = useCallback(async (webhookId: string) => {
        try {
            setWebhookLoading(true);
            const response = await webhookApi.deleteWebhook(webhookId);

            if (response.success) {
                showToast('Webhook deleted successfully');
                await fetchWebhookStatus();
                setWebhookModalOpen(false);
                setSelectedWebhook(null);
            } else {
                showToast(`Webhook deletion failed: ${response.error}`);
            }
        } catch (error) {
            console.error('Error deleting webhook:', error);
            showToast('Webhook deletion failed');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast, fetchWebhookStatus]);

    const handleRunDiagnostics = useCallback(async () => {
        try {
            setWebhookLoading(true);
            const response = await fetch('/api/webhook-management/diagnose', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                const { summary, checks } = result.data;
                let message = `Diagnostics completed: ${summary.passed} passed, ${summary.failed} failed, ${summary.warnings} warnings`;

                // Show detailed results
                const failedChecks = checks.filter((c: any) => c.status === 'fail');
                if (failedChecks.length > 0) {
                    message += `\n\nFailed checks:\n${failedChecks.map((c: any) => `- ${c.check}: ${c.message}`).join('\n')}`;
                }

                showToast(message);
                console.log('Webhook diagnostics results:', result.data);
            } else {
                showToast(`Diagnostics failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Error running diagnostics:', error);
            showToast('Diagnostics failed');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast]);

    const handleForceSyncProducts = useCallback(async () => {
        try {
            setWebhookLoading(true);
            const response = await fetch('/api/webhook-management/force-sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const result = await response.json();

            if (result.success) {
                const { checked, deleted, stillExists, errors } = result.data;
                let message = `Force sync completed: ${checked} checked, ${deleted} marked as deleted, ${stillExists} still exist`;

                if (errors.length > 0) {
                    message += `, ${errors.length} errors`;
                }

                showToast(message);
                console.log('Force sync results:', result.data);

                // Refresh webhook status after sync
                await fetchWebhookStatus();
            } else {
                showToast(`Force sync failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Error in force sync:', error);
            showToast('Force sync failed');
        } finally {
            setWebhookLoading(false);
        }
    }, [showToast, fetchWebhookStatus]);

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

    // 全局状态同步
    const handleGlobalStatusSync = useCallback(async () => {
        setSavingSettings(true);
        try {
            const response = await shopifyApi.syncProductStatus();

            if (response.success) {
                const { checked, stillExists, deleted, updated } = response.data;
                showToast(`Status sync completed: ${checked} checked, ${stillExists} still exist, ${deleted} marked as deleted`);
                // 重新获取设置以更新状态
                await fetchSettings();
            } else {
                throw new Error(response.error || 'Failed to sync product statuses');
            }
        } catch (error) {
            console.error('Error syncing product statuses:', error);
            showToast(`Failed to sync product statuses: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setSavingSettings(false);
        }
    }, [showToast, fetchSettings]);

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

                                    <Banner tone="info">
                                        <p>For security reasons, existing API credentials are not displayed. Enter new credentials to update them.</p>
                                    </Banner>

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

                                    <TextField
                                        label="Default Inventory Quantity"
                                        type="number"
                                        value={defaultInventoryQuantity}
                                        onChange={setDefaultInventoryQuantity}
                                        min="0"
                                        max="999999"
                                        helpText="Default inventory quantity for imported products"
                                        autoComplete="off"
                                    />

                                    <Checkbox
                                        label="Skip Image Validation"
                                        checked={skipImageValidation}
                                        onChange={setSkipImageValidation}
                                        helpText="Skip all image validation during import (fastest but may import broken images)"
                                    />

                                    {!skipImageValidation && (
                                        <Checkbox
                                            label="Strict Image Validation"
                                            checked={strictImageValidation}
                                            onChange={setStrictImageValidation}
                                            helpText="Enable strict image validation to filter out 404 and invalid images (slower but more reliable)"
                                        />
                                    )}

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

                {/* Webhook Management */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text as="h2" variant="headingMd">Webhook Management</Text>
                                <InlineStack gap="200">
                                    <Button
                                        variant="plain"
                                        onClick={fetchWebhookStatus}
                                        loading={webhookLoading}
                                    >
                                        Refresh Status
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="slim"
                                        onClick={handleRegisterWebhooks}
                                        loading={webhookLoading}
                                    >
                                        Register Webhooks
                                    </Button>
                                </InlineStack>
                            </InlineStack>

                            {webhookStatus && (
                                <BlockStack gap="300">
                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Webhook Status</Text>
                                        <Badge tone={webhookStatus.isValid ? 'success' : 'critical'}>
                                            {webhookStatus.isValid ? 'Configuration Valid' : 'Needs Repair'}
                                        </Badge>
                                    </InlineStack>

                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Configured/Required</Text>
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            {webhookStatus.configuredRequired}/{webhookStatus.requiredWebhooks}
                                        </Text>
                                    </InlineStack>

                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Missing Webhooks</Text>
                                        <Text as="span" variant="bodySm" tone={webhookStatus.missingRequired > 0 ? 'critical' : 'success'}>
                                            {webhookStatus.missingRequired}
                                        </Text>
                                    </InlineStack>

                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Extra Webhooks</Text>
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            {webhookStatus.extraWebhooks}
                                        </Text>
                                    </InlineStack>

                                    <InlineStack align="space-between">
                                        <Text as="span" variant="bodyMd">Last Checked</Text>
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            {new Date(webhookStatus.lastChecked).toLocaleString()}
                                        </Text>
                                    </InlineStack>

                                    {!webhookStatus.isValid && (
                                        <Banner tone="warning">
                                            <BlockStack gap="200">
                                                <Text as="p" variant="bodyMd">
                                                    Webhook configuration issues detected. Please click the repair button to auto-fix.
                                                </Text>
                                                {webhookStatus.issues.length > 0 && (
                                                    <List type="bullet">
                                                        {webhookStatus.issues.map((issue, index) => (
                                                            <List.Item key={index}>{issue}</List.Item>
                                                        ))}
                                                    </List>
                                                )}
                                            </BlockStack>
                                        </Banner>
                                    )}

                                    <InlineStack gap="200">
                                        <Button
                                            onClick={handleValidateWebhooks}
                                            loading={webhookLoading}
                                            icon={CheckCircleIcon}
                                        >
                                            Validate Configuration
                                        </Button>
                                        {!webhookStatus.isValid && (
                                            <Button
                                                onClick={handleRepairWebhooks}
                                                loading={webhookLoading}
                                                tone="critical"
                                                icon={ReplayIcon}
                                            >
                                                Repair Configuration
                                            </Button>
                                        )}
                                        <Button
                                            onClick={handleRunDiagnostics}
                                            loading={webhookLoading}
                                            variant="secondary"
                                        >
                                            Run Diagnostics
                                        </Button>
                                        <Button
                                            onClick={handleForceSyncProducts}
                                            loading={webhookLoading}
                                            variant="secondary"
                                        >
                                            Force Sync Products
                                        </Button>
                                    </InlineStack>

                                    {/* Webhook Details Table */}
                                    {webhookStatus.webhookDetails && webhookStatus.webhookDetails.length > 0 && (
                                        <BlockStack gap="200">
                                            <Text as="h3" variant="headingMd">Required Webhooks</Text>
                                            <DataTable
                                                columnContentTypes={['text', 'text', 'text', 'text']}
                                                headings={['Topic', 'Status', 'Address', 'Actions']}
                                                rows={webhookStatus.webhookDetails.map((detail) => [
                                                    detail.topic,
                                                    detail.configured ? 'Configured' : 'Not Configured',
                                                    detail.webhook?.address || '-',
                                                    detail.configured && detail.webhook ? (
                                                        <Button
                                                            size="slim"
                                                            onClick={() => {
                                                                setSelectedWebhook(detail.webhook);
                                                                setWebhookModalOpen(true);
                                                            }}
                                                        >
                                                            View Details
                                                        </Button>
                                                    ) : (
                                                        <Text as="span" variant="bodySm" tone="subdued">-</Text>
                                                    )
                                                ])}
                                            />
                                        </BlockStack>
                                    )}

                                    {/* Extra Webhooks */}
                                    {webhookStatus.extraWebhookDetails && webhookStatus.extraWebhookDetails.length > 0 && (
                                        <BlockStack gap="200">
                                            <Text as="h3" variant="headingMd">Extra Webhooks</Text>
                                            <DataTable
                                                columnContentTypes={['text', 'text', 'text', 'text']}
                                                headings={['Topic', 'Format', 'Address', 'Actions']}
                                                rows={webhookStatus.extraWebhookDetails.map((webhook) => [
                                                    webhook.topic,
                                                    webhook.format,
                                                    webhook.address,
                                                    <Button
                                                        size="slim"
                                                        onClick={() => {
                                                            setSelectedWebhook(webhook);
                                                            setWebhookModalOpen(true);
                                                        }}
                                                    >
                                                        Manage
                                                    </Button>
                                                ])}
                                            />
                                        </BlockStack>
                                    )}
                                </BlockStack>
                            )}

                            {!webhookStatus && !webhookLoading && (
                                <Banner tone="info">
                                    <p>Click "Refresh Status" to check webhook configuration</p>
                                </Banner>
                            )}

                            {webhookLoading && (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <Spinner size="small" />
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                        Checking webhook status...
                                    </Text>
                                </div>
                            )}
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 系统状态 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between">
                                <Text as="h2" variant="headingMd">System Status</Text>
                                <InlineStack gap="200">
                                    <Button variant="plain" onClick={fetchSettings}>
                                        Refresh Status
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="slim"
                                        onClick={handleGlobalStatusSync}
                                        loading={savingSettings}
                                    >
                                        Sync All Product Status
                                    </Button>
                                </InlineStack>
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

            {/* Webhook Details Modal */}
            <Modal
                open={webhookModalOpen}
                onClose={() => {
                    setWebhookModalOpen(false);
                    setSelectedWebhook(null);
                }}
                title="Webhook Details"
                primaryAction={{
                    content: 'Delete',
                    destructive: true,
                    onAction: () => selectedWebhook && handleDeleteWebhook(selectedWebhook.id),
                    loading: webhookLoading
                }}
                secondaryActions={[
                    {
                        content: 'Close',
                        onAction: () => {
                            setWebhookModalOpen(false);
                            setSelectedWebhook(null);
                        }
                    }
                ]}
            >
                {selectedWebhook && (
                    <Modal.Section>
                        <BlockStack gap="400">
                            <TextContainer>
                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">ID:</Text>
                                    <Text as="span" variant="bodySm" tone="subdued">{selectedWebhook.id}</Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Topic:</Text>
                                    <Text as="span" variant="bodySm">{selectedWebhook.topic}</Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Format:</Text>
                                    <Text as="span" variant="bodySm">{selectedWebhook.format}</Text>
                                </InlineStack>

                                <BlockStack gap="100">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Callback URL:</Text>
                                    <Text as="span" variant="bodySm" tone="subdued" breakWord>
                                        {selectedWebhook.address}
                                    </Text>
                                </BlockStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Created At:</Text>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                        {new Date(selectedWebhook.createdAt).toLocaleString()}
                                    </Text>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd" fontWeight="semibold">Updated At:</Text>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                        {new Date(selectedWebhook.updatedAt).toLocaleString()}
                                    </Text>
                                </InlineStack>
                            </TextContainer>

                            <Banner tone="warning">
                                <p>Deleting this webhook will stop receiving related event notifications. Please confirm you really need to delete it.</p>
                            </Banner>
                        </BlockStack>
                    </Modal.Section>
                )}
            </Modal>
        </Page>
    );
};

export default SettingsPage; 