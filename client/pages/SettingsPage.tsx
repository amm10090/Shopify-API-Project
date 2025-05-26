import React, { useState, useCallback } from 'react';
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
} from '@shopify/polaris';
import { SaveIcon, ConnectIcon } from '@shopify/polaris-icons';

interface SettingsPageProps {
    showToast: (message: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ showToast }) => {
    // API 设置
    const [cjApiToken, setCjApiToken] = useState('');
    const [cjCompanyId, setCjCompanyId] = useState('');
    const [pepperjamApiKey, setPepperjamApiKey] = useState('');

    // Shopify 设置
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

    const handleSaveApiSettings = useCallback(async () => {
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast('API settings saved');
        } catch (error) {
            showToast('Save failed');
        }
    }, [showToast]);

    const handleSaveShopifySettings = useCallback(async () => {
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast('Shopify settings saved');
        } catch (error) {
            showToast('Save failed');
        }
    }, [showToast]);

    const handleSaveImportSettings = useCallback(async () => {
        try {
            // 模拟API调用
            await new Promise(resolve => setTimeout(resolve, 1000));
            showToast('Import settings saved');
        } catch (error) {
            showToast('Save failed');
        }
    }, [showToast]);

    const handleTestConnection = useCallback(async (type: string) => {
        try {
            // 模拟连接测试
            await new Promise(resolve => setTimeout(resolve, 2000));
            showToast(`${type} connection test successful`);
        } catch (error) {
            showToast(`${type} connection test failed`);
        }
    }, [showToast]);

    return (
        <Page title="System Settings" subtitle="Configure API connections and import parameters">
            <Layout>
                {/* API 设置 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">API Settings</Text>
                            <Form onSubmit={handleSaveApiSettings}>
                                <FormLayout>
                                    <Text as="h3" variant="headingMd">CJ (Commission Junction) API</Text>
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
                                    <Button onClick={() => handleTestConnection('CJ API')}>
                                        Test CJ Connection
                                    </Button>

                                    <Divider />

                                    <Text as="h3" variant="headingMd">Pepperjam API</Text>
                                    <TextField
                                        label="API Key"
                                        value={pepperjamApiKey}
                                        onChange={setPepperjamApiKey}
                                        type="password"
                                        placeholder="Enter Pepperjam API Key"
                                        autoComplete="off"
                                    />
                                    <Button onClick={() => handleTestConnection('Pepperjam API')}>
                                        Test Pepperjam Connection
                                    </Button>

                                    <Button variant="primary" icon={SaveIcon} submit>
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
                            <Form onSubmit={handleSaveShopifySettings}>
                                <FormLayout>
                                    <Banner tone="info">
                                        <p>Configure Shopify connection to enable product import</p>
                                    </Banner>

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
                                        <Button onClick={() => handleTestConnection('Shopify')}>
                                            Test Shopify Connection
                                        </Button>
                                        <Button variant="primary" icon={SaveIcon} submit>
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
                            <Form onSubmit={handleSaveImportSettings}>
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
                                        helpText="Skip image validation after import"
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

                                    <Button variant="primary" icon={SaveIcon} submit>
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

                                <Button variant="primary">Save Notification Settings</Button>
                            </FormLayout>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                {/* 系统状态 */}
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text as="h2" variant="headingMd">System Status</Text>
                            <BlockStack gap="300">
                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">CJ API Connection</Text>
                                    <Badge tone="success">Normal</Badge>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Pepperjam API Connection</Text>
                                    <Badge tone="success">Normal</Badge>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Shopify Connection</Text>
                                    <Badge tone="success">Normal</Badge>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Database Connection</Text>
                                    <Badge tone="success">Normal</Badge>
                                </InlineStack>

                                <InlineStack align="space-between">
                                    <Text as="span" variant="bodyMd">Last Check Time</Text>
                                    <Text as="span" variant="bodySm" tone="subdued">2024-01-15 14:30</Text>
                                </InlineStack>
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