import { Session } from '@shopify/shopify-api';
import { logger } from '@server/utils/logger';
import { getShopifyApi } from '@server/config/shopify';

interface WebhookRegistrationResult {
    success: boolean;
    topic: string;
    endpoint: string;
    message: string;
    details?: any;
}

export class WebhookService {
    private shopify: any;

    constructor() {
        this.shopify = getShopifyApi();
    }

    /**
     * 注册必要的webhooks
     */
    async registerWebhooks(session: Session): Promise<WebhookRegistrationResult[]> {
        const results: WebhookRegistrationResult[] = [];

        // 获取应用URL
        const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';

        // Define webhooks to register
        const webhooksToRegister = [
            {
                topic: 'products/delete',
                endpoint: `${appUrl}/api/webhooks/products/delete`,
                description: 'Product deletion webhook - Updates local status when products are deleted in Shopify'
            },
            {
                topic: 'products/update',
                endpoint: `${appUrl}/api/webhooks/products/update`,
                description: 'Product update webhook - Syncs basic product information'
            },
            {
                topic: 'app/uninstalled',
                endpoint: `${appUrl}/api/webhooks/app/uninstalled`,
                description: 'App uninstall webhook - Cleans up application data'
            }
        ];

        logger.info(`Starting webhook registration for shop: ${session.shop}`, {
            shop: session.shop,
            appUrl: appUrl,
            webhookCount: webhooksToRegister.length
        });

        for (const webhook of webhooksToRegister) {
            try {
                logger.info(`Registering webhook: ${webhook.topic}`, {
                    topic: webhook.topic,
                    endpoint: webhook.endpoint,
                    shop: session.shop
                });

                // 检查webhook是否已存在
                const existingWebhooks = await this.listWebhooks(session);
                const existingWebhook = existingWebhooks.find(w =>
                    w.topic === webhook.topic && w.address === webhook.endpoint
                );

                if (existingWebhook) {
                    logger.info(`Webhook already exists, skipping registration`, {
                        topic: webhook.topic,
                        webhookId: existingWebhook.id,
                        shop: session.shop
                    });

                    results.push({
                        success: true,
                        topic: webhook.topic,
                        endpoint: webhook.endpoint,
                        message: 'Webhook already exists',
                        details: { webhookId: existingWebhook.id }
                    });
                    continue;
                }

                // 使用现代化的GraphQL API注册webhook
                const mutation = `
                    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
                        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
                            webhookSubscription {
                                id
                                callbackUrl
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `;

                const variables = {
                    topic: webhook.topic.toUpperCase().replace('/', '_'),
                    webhookSubscription: {
                        callbackUrl: webhook.endpoint,
                        format: 'JSON'
                    }
                };

                const client = new this.shopify.clients.Graphql({ session });

                // 使用现代化的request方法替代过时的query方法
                const response = await client.request(mutation, { variables });

                if (response.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
                    const errors = response.data.webhookSubscriptionCreate.userErrors;
                    logger.error(`Failed to register webhook: ${webhook.topic}`, {
                        topic: webhook.topic,
                        errors: errors,
                        shop: session.shop
                    });

                    results.push({
                        success: false,
                        topic: webhook.topic,
                        endpoint: webhook.endpoint,
                        message: `Registration failed: ${errors.map((e: any) => e.message).join(', ')}`,
                        details: { errors }
                    });
                } else if (response.data?.webhookSubscriptionCreate?.webhookSubscription) {
                    const webhookSubscription = response.data.webhookSubscriptionCreate.webhookSubscription;
                    logger.info(`Successfully registered webhook: ${webhook.topic}`, {
                        topic: webhook.topic,
                        webhookId: webhookSubscription.id,
                        callbackUrl: webhookSubscription.callbackUrl,
                        shop: session.shop
                    });

                    results.push({
                        success: true,
                        topic: webhook.topic,
                        endpoint: webhook.endpoint,
                        message: 'Successfully registered',
                        details: {
                            webhookId: webhookSubscription.id,
                            callbackUrl: webhookSubscription.callbackUrl
                        }
                    });
                } else {
                    logger.error(`Unexpected response when registering webhook: ${webhook.topic}`, {
                        topic: webhook.topic,
                        response: response.data,
                        shop: session.shop
                    });

                    results.push({
                        success: false,
                        topic: webhook.topic,
                        endpoint: webhook.endpoint,
                        message: 'Unexpected response from Shopify API',
                        details: { response: response.data }
                    });
                }

            } catch (error) {
                logger.error(`Error registering webhook: ${webhook.topic}`, {
                    topic: webhook.topic,
                    error: error instanceof Error ? error.message : error,
                    shop: session.shop
                });

                results.push({
                    success: false,
                    topic: webhook.topic,
                    endpoint: webhook.endpoint,
                    message: `Registration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    details: { error }
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        logger.info(`Webhook registration completed for shop: ${session.shop}`, {
            shop: session.shop,
            total: results.length,
            success: successCount,
            failures: failureCount,
            results: results.map(r => ({
                topic: r.topic,
                success: r.success,
                message: r.message
            }))
        });

        return results;
    }

    /**
     * 列出现有的webhooks
     */
    async listWebhooks(session: Session): Promise<any[]> {
        try {
            const query = `
                query {
                    webhookSubscriptions(first: 50) {
                        edges {
                            node {
                                id
                                callbackUrl
                                topic
                                format
                                createdAt
                                updatedAt
                            }
                        }
                    }
                }
            `;

            const client = new this.shopify.clients.Graphql({ session });

            // 使用现代化的request方法替代过时的query方法
            const response = await client.request(query);

            if (response.data?.webhookSubscriptions?.edges) {
                return response.data.webhookSubscriptions.edges.map((edge: any) => ({
                    id: edge.node.id,
                    topic: edge.node.topic.toLowerCase().replace('_', '/'),
                    address: edge.node.callbackUrl,
                    format: edge.node.format,
                    createdAt: edge.node.createdAt,
                    updatedAt: edge.node.updatedAt
                }));
            }

            return [];
        } catch (error) {
            logger.error('Error listing webhooks:', {
                error: error instanceof Error ? error.message : error,
                shop: session.shop
            });
            return [];
        }
    }

    /**
     * 删除webhook
     */
    async deleteWebhook(session: Session, webhookId: string): Promise<boolean> {
        try {
            const mutation = `
                mutation webhookSubscriptionDelete($id: ID!) {
                    webhookSubscriptionDelete(id: $id) {
                        deletedWebhookSubscriptionId
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

            const variables = { id: webhookId };

            const client = new this.shopify.clients.Graphql({ session });

            // 使用现代化的request方法替代过时的query方法
            const response = await client.request(mutation, { variables });

            if (response.data?.webhookSubscriptionDelete?.userErrors?.length > 0) {
                const errors = response.data.webhookSubscriptionDelete.userErrors;
                logger.error(`Failed to delete webhook: ${webhookId}`, {
                    webhookId,
                    errors,
                    shop: session.shop
                });
                return false;
            }

            logger.info(`Successfully deleted webhook: ${webhookId}`, {
                webhookId,
                deletedId: response.data?.webhookSubscriptionDelete?.deletedWebhookSubscriptionId,
                shop: session.shop
            });

            return true;
        } catch (error) {
            logger.error(`Error deleting webhook: ${webhookId}`, {
                webhookId,
                error: error instanceof Error ? error.message : error,
                shop: session.shop
            });
            return false;
        }
    }

    /**
     * 验证webhook配置是否正确
     */
    async validateWebhookConfiguration(session: Session): Promise<{
        isValid: boolean;
        missingWebhooks: string[];
        issues: string[];
    }> {
        const requiredWebhooks = ['products/delete', 'products/update', 'app/uninstalled'];
        const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';

        const existingWebhooks = await this.listWebhooks(session);
        const missingWebhooks: string[] = [];
        const issues: string[] = [];

        for (const requiredTopic of requiredWebhooks) {
            const expectedEndpoint = `${appUrl}/api/webhooks/${requiredTopic}`;
            const webhook = existingWebhooks.find(w => w.topic === requiredTopic);

            if (!webhook) {
                missingWebhooks.push(requiredTopic);
            } else if (webhook.address !== expectedEndpoint) {
                issues.push(`Webhook ${requiredTopic} has incorrect endpoint: ${webhook.address} (expected: ${expectedEndpoint})`);
            }
        }

        const isValid = missingWebhooks.length === 0 && issues.length === 0;

        logger.info(`Webhook configuration validation completed`, {
            shop: session.shop,
            isValid,
            requiredWebhooks: requiredWebhooks.length,
            existingWebhooks: existingWebhooks.length,
            missingWebhooks,
            issues
        });

        return {
            isValid,
            missingWebhooks,
            issues
        };
    }

    /**
     * 修复webhook配置
     */
    async repairWebhookConfiguration(session: Session): Promise<{
        success: boolean;
        repaired: string[];
        errors: string[];
    }> {
        const validation = await this.validateWebhookConfiguration(session);
        const repaired: string[] = [];
        const errors: string[] = [];

        if (validation.isValid) {
            return { success: true, repaired, errors };
        }

        // 注册缺失的webhooks
        if (validation.missingWebhooks.length > 0) {
            logger.info(`Repairing missing webhooks`, {
                shop: session.shop,
                missingWebhooks: validation.missingWebhooks
            });

            const registrationResults = await this.registerWebhooks(session);

            for (const result of registrationResults) {
                if (validation.missingWebhooks.includes(result.topic)) {
                    if (result.success) {
                        repaired.push(result.topic);
                    } else {
                        errors.push(`Failed to repair ${result.topic}: ${result.message}`);
                    }
                }
            }
        }

        const success = errors.length === 0;

        logger.info(`Webhook configuration repair completed`, {
            shop: session.shop,
            success,
            repaired,
            errors
        });

        return { success, repaired, errors };
    }
} 