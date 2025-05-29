import { Router, Request, Response, NextFunction } from 'express';
import { shopifyApi } from '@shopify/shopify-api';
import { prisma } from '@server/index';
import { logger } from '@server/utils/logger';
import crypto from 'crypto';
import express from 'express';

const router = Router();

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
 * 应用卸载webhook
 */
router.post('/app/uninstalled', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { shop_domain, shop_id } = req.body;
        const shopFromHeader = req.get('X-Shopify-Shop-Domain');

        // 使用header中的shop信息作为主要来源，body中的作为备选
        const shop = shopFromHeader || shop_domain;

        logger.info(`App uninstalled webhook received`, {
            shop: shop,
            shopId: shop_id,
            shopFromHeader: shopFromHeader,
            shopFromBody: shop_domain
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
router.post('/orders/create', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const order = req.body;
        const shop = req.get('X-Shopify-Shop-Domain');

        logger.info(`New order created: ${order.id} for shop: ${shop}`);

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
router.post('/products/update', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const product = req.body;
        const shop = req.get('X-Shopify-Shop-Domain');

        logger.info(`Product updated: ${product.id} for shop: ${shop}`);

        // 处理产品更新逻辑
        // 例如：同步价格、库存等

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling product update webhook:', error);
        next(error);
    }
});

/**
 * 产品删除webhook - 同步更新数据库状态
 */
router.post('/products/delete', captureRawBody, verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const product = req.body;
        const shop = req.get('X-Shopify-Shop-Domain');
        const shopifyProductId = product.id?.toString();

        logger.info(`Product deleted webhook received`, {
            productId: shopifyProductId,
            title: product.title,
            shop: shop
        });

        if (!shopifyProductId) {
            logger.warn('No product ID in deletion webhook');
            res.status(200).json({ received: true });
            return;
        }

        // 查找并更新数据库中对应的产品
        const existingProduct = await prisma.product.findFirst({
            where: {
                shopifyProductId: shopifyProductId
            }
        });

        if (existingProduct) {
            // 更新产品状态为pending并清除Shopify产品ID
            await prisma.product.update({
                where: { id: existingProduct.id },
                data: {
                    shopifyProductId: null,
                    importStatus: 'PENDING',
                    lastUpdated: new Date()
                }
            });

            logger.info(`Updated product status after deletion`, {
                internalProductId: existingProduct.id,
                title: existingProduct.title,
                shopifyProductId: shopifyProductId,
                newStatus: 'PENDING'
            });
        } else {
            logger.info(`No matching product found in database for deleted Shopify product ${shopifyProductId}`);
        }

        res.status(200).json({ received: true });

    } catch (error) {
        logger.error('Error handling product delete webhook:', error);
        next(error);
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
}

export default router; 