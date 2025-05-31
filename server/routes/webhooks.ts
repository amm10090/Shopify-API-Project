import { Router, Request, Response, NextFunction } from 'express';
import { shopifyApi } from '@shopify/shopify-api';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';
import crypto from 'crypto';
import express from 'express';

const router = Router();

// 用于存储已处理的webhook事件ID，防止重复处理
const processedWebhookIds = new Set<string>();
const WEBHOOK_ID_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时
const webhookTimestamps = new Map<string, number>();

/**
 * 清理过期的webhook ID缓存
 */
const cleanupWebhookCache = () => {
    const now = Date.now();
    for (const [webhookId, timestamp] of webhookTimestamps.entries()) {
        if (now - timestamp > WEBHOOK_ID_CACHE_TTL) {
            processedWebhookIds.delete(webhookId);
            webhookTimestamps.delete(webhookId);
        }
    }
};

// 定期清理缓存（每小时）
setInterval(cleanupWebhookCache, 60 * 60 * 1000);

/**
 * 中间件：捕获原始请求体用于webhook验证
 */
const captureRawBody = (req: Request, res: Response, next: NextFunction) => {
    let data = '';
    req.setEncoding('utf8');

    req.on('data', (chunk) => {
        data += chunk;
    });

    req.on('end', () => {
        (req as any).rawBody = data;
        try {
            req.body = JSON.parse(data);
        } catch (error) {
            logger.error('Error parsing webhook JSON:', error);
            res.status(400).json({ error: 'Invalid JSON' });
            return;
        }
        next();
    });
};

/**
 * 验证Shopify webhook签名
 */
const verifyWebhookSignature = (req: Request, res: Response, next: NextFunction) => {
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = (req as any).rawBody;
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET;

    if (!signature || !secret) {
        logger.error('Missing webhook signature or secret');
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    if (!rawBody) {
        logger.error('Missing raw body for webhook verification');
        res.status(400).json({ error: 'Bad request' });
        return;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody, 'utf8');
    const calculatedSignature = hmac.digest('base64');

    if (signature !== calculatedSignature) {
        logger.error('Invalid webhook signature', {
            received: signature,
            calculated: calculatedSignature,
            shop: req.get('X-Shopify-Shop-Domain')
        });
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    logger.info('Webhook signature verified successfully');
    next();
};

/**
 * 中间件：检查webhook重复和时间戳
 */
const checkWebhookDuplicate = (req: Request, res: Response, next: NextFunction) => {
    const webhookId = req.get('X-Shopify-Webhook-Id');
    const triggeredAt = req.get('X-Shopify-Triggered-At');
    const topic = req.get('X-Shopify-Topic');

    // 检查webhook ID
    if (!webhookId) {
        logger.warn('Missing webhook ID header');
        // 继续处理，但记录警告
        next();
        return;
    }

    // 检查是否已经处理过此webhook
    if (processedWebhookIds.has(webhookId)) {
        logger.info(`Duplicate webhook detected and ignored`, {
            webhookId,
            topic,
            shop: req.get('X-Shopify-Shop-Domain')
        });
        res.status(200).json({ received: true, message: 'Duplicate webhook ignored' });
        return;
    }

    // 验证时间戳，避免处理过期的webhook
    if (triggeredAt) {
        const triggeredTime = new Date(triggeredAt).getTime();
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24小时

        if (now - triggeredTime > maxAge) {
            logger.warn(`Webhook is too old, ignoring`, {
                webhookId,
                triggeredAt,
                ageHours: Math.round((now - triggeredTime) / (60 * 60 * 1000)),
                topic,
                shop: req.get('X-Shopify-Shop-Domain')
            });
            res.status(200).json({ received: true, message: 'Webhook too old, ignored' });
            return;
        }
    }

    // 标记此webhook为已处理
    processedWebhookIds.add(webhookId);
    webhookTimestamps.set(webhookId, Date.now());

    // 将webhook信息添加到请求对象
    (req as any).webhookMeta = {
        id: webhookId,
        triggeredAt,
        topic,
        shop: req.get('X-Shopify-Shop-Domain'),
        eventId: req.get('X-Shopify-Event-Id')
    };

    next();
};

/**
 * 应用卸载webhook
 */
router.post('/app/uninstalled', captureRawBody, verifyWebhookSignature, checkWebhookDuplicate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop_domain, shop_id } = req.body;
        const webhookMeta = (req as any).webhookMeta;
        const shopFromHeader = webhookMeta?.shop;

        // 使用header中的shop信息作为主要来源，body中的作为备选
        const shop = shopFromHeader || shop_domain;

        logger.info(`App uninstalled webhook received`, {
            shop: shop,
            shopId: shop_id,
            webhookId: webhookMeta?.id,
            eventId: webhookMeta?.eventId,
            triggeredAt: webhookMeta?.triggeredAt
        });

        // 停用所有该商店的会话
        if (shop) {
            const result = await prisma.shopifySession.updateMany({
                where: { shop: shop },
                data: { isActive: false }
            });

            logger.info(`Deactivated ${result.count} sessions for shop: ${shop}`);

            // 可选：清理相关品牌和产品数据
            // 注意：根据业务需求决定是否删除用户数据
            // 一般建议保留数据一段时间以防用户重新安装

            try {
                // 统计要清理的数据
                const brandCount = await prisma.brand.count({
                    where: {
                        products: {
                            some: {
                                // 如果有关联到这个shop的产品
                            }
                        }
                    }
                });

                const productCount = await prisma.product.count({
                    where: {
                        // 如果有shop关联字段，在这里添加条件
                    }
                });

                logger.info(`Shop ${shop} has ${brandCount} brands and ${productCount} products`);

            } catch (statsError) {
                logger.warn('Error getting cleanup stats:', statsError);
            }
        } else {
            logger.warn('No shop information provided in uninstall webhook');
        }

        res.status(200).json({ received: true, shop: shop });

    } catch (error) {
        logger.error('Error handling app uninstall webhook:', error);
        next(error);
    }
});

/**
 * 订单创建webhook（示例）
 */
router.post('/orders/create', captureRawBody, verifyWebhookSignature, checkWebhookDuplicate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const order = req.body;
        const webhookMeta = (req as any).webhookMeta;

        logger.info(`New order created: ${order.id} for shop: ${webhookMeta?.shop}`, {
            orderId: order.id,
            webhookId: webhookMeta?.id,
            eventId: webhookMeta?.eventId,
            triggeredAt: webhookMeta?.triggeredAt
        });

        // 处理订单创建逻辑
        // 例如：更新库存、发送通知等

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling order create webhook:', error);
        next(error);
    }
});

/**
 * 产品更新webhook（示例）
 */
router.post('/products/update', captureRawBody, verifyWebhookSignature, checkWebhookDuplicate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const product = req.body;
        const webhookMeta = (req as any).webhookMeta;

        logger.info(`Product updated: ${product.id} for shop: ${webhookMeta?.shop}`, {
            productId: product.id,
            productTitle: product.title,
            webhookId: webhookMeta?.id,
            eventId: webhookMeta?.eventId,
            triggeredAt: webhookMeta?.triggeredAt
        });

        // 检查产品是否在我们的数据库中
        const existingProduct = await prisma.product.findFirst({
            where: {
                shopifyProductId: product.id?.toString()
            }
        });

        if (existingProduct) {
            // 同步更新本地数据库中的产品信息
            try {
                await prisma.product.update({
                    where: { id: existingProduct.id },
                    data: {
                        title: product.title || existingProduct.title,
                        // 只同步基本信息，避免覆盖联盟营销特定的数据
                        lastUpdated: new Date()
                    }
                });

                logger.info(`Synced product update from Shopify`, {
                    internalProductId: existingProduct.id,
                    shopifyProductId: product.id,
                    title: product.title
                });
            } catch (updateError) {
                logger.error('Error syncing product update:', updateError);
            }
        }

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling product update webhook:', error);
        next(error);
    }
});

/**
 * 产品删除webhook - 同步更新数据库状态（改进版本）
 */
router.post('/products/delete', captureRawBody, verifyWebhookSignature, checkWebhookDuplicate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const product = req.body;
        const webhookMeta = (req as any).webhookMeta;
        const shopifyProductId = product.id?.toString();

        logger.info(`Product deleted webhook received`, {
            productId: shopifyProductId,
            title: product.title,
            shop: webhookMeta?.shop,
            webhookId: webhookMeta?.id,
            eventId: webhookMeta?.eventId,
            triggeredAt: webhookMeta?.triggeredAt
        });

        if (!shopifyProductId) {
            logger.warn('No product ID in deletion webhook', {
                webhookId: webhookMeta?.id,
                eventId: webhookMeta?.eventId,
                payload: product
            });
            res.status(200).json({ received: true, warning: 'No product ID provided' });
            return;
        }

        // 查找并更新数据库中对应的产品
        const existingProducts = await prisma.product.findMany({
            where: {
                shopifyProductId: shopifyProductId
            },
            include: {
                brand: true
            }
        });

        logger.info(`Found ${existingProducts.length} products with Shopify ID: ${shopifyProductId}`);

        if (existingProducts.length > 0) {
            let successCount = 0;
            let errorCount = 0;

            for (const existingProduct of existingProducts) {
                try {
                    // 在事务中进行更新，确保数据一致性
                    await prisma.$transaction(async (tx) => {
                        // 更新产品状态为pending并清除Shopify产品ID
                        await tx.product.update({
                            where: { id: existingProduct.id },
                            data: {
                                shopifyProductId: null,
                                importStatus: 'PENDING',
                                lastUpdated: new Date()
                            }
                        });
                    });

                    successCount++;

                    logger.info(`Successfully updated product status after Shopify deletion`, {
                        internalProductId: existingProduct.id,
                        title: existingProduct.title,
                        brandName: existingProduct.brand?.name,
                        shopifyProductId: shopifyProductId,
                        newStatus: 'PENDING',
                        webhookId: webhookMeta?.id,
                        eventId: webhookMeta?.eventId
                    });

                } catch (updateError) {
                    errorCount++;
                    logger.error('Error updating product after deletion webhook:', {
                        error: updateError,
                        productId: existingProduct.id,
                        shopifyProductId,
                        webhookId: webhookMeta?.id
                    });
                }
            }

            // 返回处理结果
            res.status(200).json({
                received: true,
                processed: existingProducts.length,
                successful: successCount,
                failed: errorCount,
                message: `Updated ${successCount} products, ${errorCount} failed`
            });

        } else {
            logger.info(`No matching product found in database for deleted Shopify product`, {
                shopifyProductId,
                webhookId: webhookMeta?.id,
                eventId: webhookMeta?.eventId,
                shop: webhookMeta?.shop
            });

            res.status(200).json({
                received: true,
                message: 'No matching products found in database'
            });
        }

    } catch (error) {
        logger.error('Error handling product delete webhook:', {
            error: error,
            webhookId: (req as any).webhookMeta?.id,
            eventId: (req as any).webhookMeta?.eventId,
            stack: error instanceof Error ? error.stack : undefined
        });

        // 即使处理失败，也要返回成功，避免Shopify重试
        res.status(200).json({
            received: true,
            error: 'Processing failed but webhook acknowledged'
        });
    }
});

/**
 * GDPR合规webhook：客户数据请求
 */
router.post('/customers/data_request', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop_id, shop_domain, customer, orders_requested } = req.body;
        const shop = req.get('X-Shopify-Shop-Domain') || shop_domain;

        logger.info(`Customer data request webhook received`, {
            shop: shop,
            shopId: shop_id,
            customerId: customer?.id,
            ordersRequested: orders_requested
        });

        // 处理客户数据请求
        // 根据GDPR要求，您需要在30天内提供客户数据
        // 这里可以实现将客户数据发送到指定邮箱的逻辑

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling customer data request webhook:', error);
        next(error);
    }
});

/**
 * GDPR合规webhook：客户数据删除
 */
router.post('/customers/redact', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop_id, shop_domain, customer } = req.body;
        const shop = req.get('X-Shopify-Shop-Domain') || shop_domain;

        logger.info(`Customer data redaction webhook received`, {
            shop: shop,
            shopId: shop_id,
            customerId: customer?.id,
            customerEmail: customer?.email
        });

        // 处理客户数据删除
        // 删除所有与该客户相关的个人数据
        // 保留必要的业务记录（如订单ID），但删除个人身份信息

        if (customer?.id) {
            try {
                // 这里添加删除客户相关数据的逻辑
                // 例如：删除客户信息、订单中的个人数据等
                logger.info(`Customer data redacted for customer ${customer.id} from shop ${shop}`);
            } catch (redactError) {
                logger.error('Error redacting customer data:', redactError);
            }
        }

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling customer redaction webhook:', error);
        next(error);
    }
});

/**
 * GDPR合规webhook：商店数据删除
 */
router.post('/shop/redact', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop_id, shop_domain } = req.body;
        const shop = req.get('X-Shopify-Shop-Domain') || shop_domain;

        logger.info(`Shop data redaction webhook received`, {
            shop: shop,
            shopId: shop_id
        });

        // 处理商店数据删除（当商店被删除时）
        // 删除所有与该商店相关的数据
        if (shop) {
            try {
                // 删除会话数据
                await prisma.shopifySession.deleteMany({
                    where: { shop: shop }
                });

                // 可选：删除品牌和产品数据
                // 注意：根据业务需求决定是否删除

                logger.info(`Shop data redacted for shop: ${shop}`);
            } catch (redactError) {
                logger.error('Error redacting shop data:', redactError);
            }
        }

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling shop redaction webhook:', error);
        next(error);
    }
});

/**
 * 测试webhook端点（仅用于调试）
 */
if (process.env.NODE_ENV !== 'production') {
    router.post('/test', express.json(), (req: Request, res: Response) => {
        logger.info('Test webhook received:', req.body);
        res.json({
            success: true,
            message: 'Test webhook received',
            body: req.body,
            headers: {
                'X-Shopify-Shop-Domain': req.get('X-Shopify-Shop-Domain'),
                'X-Shopify-Hmac-Sha256': req.get('X-Shopify-Hmac-Sha256')
            }
        });
    });

    // 添加产品删除测试端点
    router.post('/test/products/delete', express.json(), async (req: Request, res: Response) => {
        try {
            const { productId } = req.body;

            if (!productId) {
                res.status(400).json({ error: 'Product ID required' });
                return;
            }

            logger.info(`Testing product deletion webhook for product: ${productId}`);

            // 模拟Shopify产品删除webhook
            const mockWebhookPayload = {
                id: productId,
                title: `Test Product ${productId}`,
                handle: `test-product-${productId}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 查找现有产品
            const existingProducts = await prisma.product.findMany({
                where: {
                    shopifyProductId: productId.toString()
                },
                include: {
                    brand: true
                }
            });

            if (existingProducts.length === 0) {
                res.json({
                    success: false,
                    message: `No products found with Shopify ID: ${productId}`,
                    payload: mockWebhookPayload
                });
                return;
            }

            // 执行删除操作
            let successCount = 0;
            for (const product of existingProducts) {
                try {
                    await prisma.product.update({
                        where: { id: product.id },
                        data: {
                            shopifyProductId: null,
                            importStatus: 'PENDING',
                            lastUpdated: new Date()
                        }
                    });
                    successCount++;
                } catch (error) {
                    logger.error(`Error updating product ${product.id}:`, error);
                }
            }

            res.json({
                success: true,
                message: `Test webhook processed successfully`,
                payload: mockWebhookPayload,
                results: {
                    found: existingProducts.length,
                    updated: successCount,
                    products: existingProducts.map(p => ({
                        id: p.id,
                        title: p.title,
                        brand: p.brand?.name
                    }))
                }
            });

        } catch (error) {
            logger.error('Error in test webhook:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}

export default router; 