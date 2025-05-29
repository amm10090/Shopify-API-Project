import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { logger } from '@server/utils/logger';
import { UnifiedProduct, ShopifyProduct } from '@shared/types/index';
import { CustomAppService } from '@server/services/CustomAppService';

export class ShopifyService {
    private shopify: any;
    private isCustomApp: boolean;

    constructor() {
        // 检查是否为自定义应用模式
        this.isCustomApp = CustomAppService.isCustomAppMode();

        // 检查必需的环境变量
        const requiredEnvVars: { [key: string]: string | undefined } = {};

        if (this.isCustomApp) {
            // 自定义应用需要的环境变量
            requiredEnvVars.SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
            requiredEnvVars.SHOPIFY_STORE_NAME = process.env.SHOPIFY_STORE_NAME;
        } else {
            // OAuth 应用需要的环境变量
            requiredEnvVars.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
            requiredEnvVars.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
        }

        for (const [key, value] of Object.entries(requiredEnvVars)) {
            if (!value) {
                throw new Error(`Missing required environment variable: ${key}`);
            }
        }

        if (this.isCustomApp) {
            // 为自定义应用创建 shopifyApi 实例
            this.shopify = shopifyApi({
                apiKey: process.env.SHOPIFY_API_KEY || 'dummy-key', // 自定义应用可能不需要，但API要求
                apiSecretKey: process.env.SHOPIFY_API_SECRET || 'dummy-secret',
                scopes: [
                    'read_products',
                    'write_products',
                    'read_inventory',
                    'write_inventory',
                    'read_product_listings',
                    'write_product_listings',
                    'read_collections',
                    'write_collections'
                ],
                hostName: process.env.SHOPIFY_HOST_NAME || 'localhost:3000',
                apiVersion: ApiVersion.July24,
                isEmbeddedApp: false, // 自定义应用不是嵌入式应用
            });

            logger.info('ShopifyService initialized for custom app mode');
        } else {
            // OAuth 应用配置
            this.shopify = shopifyApi({
                apiKey: process.env.SHOPIFY_API_KEY!,
                apiSecretKey: process.env.SHOPIFY_API_SECRET!,
                scopes: [
                    'read_products',
                    'write_products',
                    'read_inventory',
                    'write_inventory',
                    'read_product_listings',
                    'write_product_listings',
                    'read_collections',
                    'write_collections'
                ],
                hostName: process.env.SHOPIFY_HOST_NAME || 'localhost:3000',
                apiVersion: ApiVersion.July24,
                isEmbeddedApp: true,
            });

            logger.info('ShopifyService initialized for OAuth app mode');
        }

        logger.info('ShopifyService initialized successfully');
    }

    /**
     * 获取或创建 REST 客户端
     */
    private getRestClient(session: Session) {
        if (this.isCustomApp) {
            // 对于自定义应用，使用 REST 客户端的不同方式
            return new this.shopify.clients.Rest({ session });
        } else {
            // 对于 OAuth 应用，使用标准方式
            return new this.shopify.clients.Rest({ session });
        }
    }

    /**
     * 创建或获取产品集合
     */
    async getOrCreateCollection(
        session: Session,
        title: string,
        handle?: string,
        published: boolean = false,
        bodyHtml: string = ''
    ): Promise<any> {
        try {
            // 生成handle
            if (!handle) {
                handle = title.toLowerCase()
                    .replace(/[^a-z0-9-]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                if (!handle) {
                    handle = `collection-${Date.now()}`;
                }
            }

            // 使用 REST 客户端查找现有集合
            const client = this.getRestClient(session);

            const collectionsResponse = await client.get({
                path: 'custom_collections',
                query: { limit: '250' }
            });

            const collections = collectionsResponse.body?.custom_collections || [];

            let existingCollection = collections.find((coll: any) => coll.handle === handle);
            if (!existingCollection) {
                existingCollection = collections.find((coll: any) => coll.title === title);
            }

            if (existingCollection) {
                // 检查是否需要更新
                let needsUpdate = false;
                const currentPublished = !!existingCollection.published_at;

                if (currentPublished !== published) {
                    existingCollection.published = published;
                    if (published) {
                        existingCollection.published_at = new Date().toISOString();
                    } else {
                        existingCollection.published_at = null;
                    }
                    needsUpdate = true;
                }

                if (bodyHtml && existingCollection.body_html !== bodyHtml) {
                    existingCollection.body_html = bodyHtml;
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    await client.put({
                        path: `custom_collections/${existingCollection.id}`,
                        data: { custom_collection: existingCollection }
                    });
                    logger.info(`Updated collection: ${existingCollection.title} (ID: ${existingCollection.id})`);
                }

                return existingCollection;
            }

            // 创建新集合
            const collectionData: any = {
                title,
                handle,
                body_html: bodyHtml,
                published
            };

            if (published) {
                collectionData.published_at = new Date().toISOString();
            }

            const response = await client.post({
                path: 'custom_collections',
                data: { custom_collection: collectionData }
            });

            const collection = response.body?.custom_collection;
            logger.info(`Created collection: ${collection.title} (ID: ${collection.id})`);
            return collection;

        } catch (error) {
            logger.error(`Error managing collection '${title}':`, error);
            throw error;
        }
    }

    /**
     * 添加产品到集合
     */
    async addProductToCollection(session: Session, productId: string, collectionId: string): Promise<any> {
        try {
            const client = this.getRestClient(session);

            const response = await client.post({
                path: 'collects',
                data: {
                    collect: {
                        product_id: productId,
                        collection_id: collectionId
                    }
                }
            });

            const collect = response.body?.collect;
            logger.info(`Added product ${productId} to collection ${collectionId}`);
            return collect;

        } catch (error) {
            // 检查是否是重复错误
            if (error instanceof Error && error.message.includes('already exists')) {
                logger.info(`Product ${productId} already in collection ${collectionId}`);
                return null;
            }
            logger.error(`Error adding product ${productId} to collection ${collectionId}:`, error);
            throw error;
        }
    }

    /**
     * 根据SKU查找产品
     */
    async getProductBySku(session: Session, sku: string): Promise<any> {
        try {
            // 验证session和必要的参数
            if (!session) {
                throw new Error('Session is required');
            }

            if (!session.accessToken) {
                throw new Error('Session access token is missing');
            }

            if (!sku) {
                throw new Error('SKU is required');
            }

            // 验证shopify实例
            if (!this.shopify) {
                throw new Error('Shopify API instance not properly initialized');
            }

            logger.info(`Searching for product with SKU: ${sku} in shop: ${session.shop}`);

            // 使用 REST 客户端而不是直接检查 this.shopify.rest.Product
            const client = this.getRestClient(session);

            // 使用 REST 客户端获取产品列表
            const response = await client.get({
                path: 'products',
                query: { limit: '250' }
            });

            const products = response.body?.products || [];

            if (!products || products.length === 0) {
                logger.warn(`No products found in shop: ${session.shop}`);
                return null;
            }

            for (const product of products) {
                if (!product.variants) {
                    continue;
                }

                for (const variant of product.variants) {
                    if (variant.sku === sku) {
                        logger.info(`Found product by SKU '${sku}': ${product.title} (ID: ${product.id})`);
                        return product;
                    }
                }
            }

            logger.info(`No product found with SKU '${sku}' in shop: ${session.shop}`);
            return null;

        } catch (error) {
            logger.error(`Error finding product by SKU '${sku}':`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                shop: session?.shop,
                hasAccessToken: !!session?.accessToken,
                hasShopifyInstance: !!this.shopify,
                isCustomApp: this.isCustomApp
            });
            throw error;
        }
    }

    /**
     * 创建新产品
     */
    async createProduct(session: Session, unifiedProduct: UnifiedProduct, status: string = 'draft'): Promise<any> {
        try {
            logger.info(`Creating Shopify product: SKU='${unifiedProduct.sku}', Title='${unifiedProduct.title}'`);

            const client = this.getRestClient(session);

            const productData: any = {
                title: unifiedProduct.title,
                body_html: unifiedProduct.description,
                vendor: unifiedProduct.brandName,
                product_type: unifiedProduct.categories[0] || ''
            };

            if (status === 'draft') {
                productData.published_at = null;
                productData.published_scope = 'web';
            } else if (status === 'active') {
                productData.published_at = new Date().toISOString();
                productData.published_scope = 'web';
            }

            // 创建变体
            const variantData: any = {
                option1: 'Default Title',
                price: unifiedProduct.price.toString(),
                sku: unifiedProduct.sku,
                inventory_management: 'shopify',
                inventory_policy: 'deny'
            };

            if (unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price) {
                variantData.compare_at_price = unifiedProduct.price.toString();
                variantData.price = unifiedProduct.salePrice.toString();
            }

            productData.variants = [variantData];

            // 添加图片
            if (unifiedProduct.imageUrl) {
                productData.images = [{ src: unifiedProduct.imageUrl }];
            }

            const response = await client.post({
                path: 'products',
                data: { product: productData }
            });

            const product = response.body?.product;
            logger.info(`Created product: ${product.title} (ID: ${product.id})`);

            // 设置库存
            if (unifiedProduct.availability && product.variants && product.variants[0]) {
                await this.setInventory(session, product.variants[0].inventory_item_id, 99);
            }

            return product;

        } catch (error) {
            logger.error(`Error creating product '${unifiedProduct.title}':`, error);
            throw error;
        }
    }

    /**
     * 更新产品
     */
    async updateProduct(session: Session, productId: string, unifiedProduct: UnifiedProduct): Promise<any> {
        try {
            logger.info(`Updating Shopify product ID: ${productId}`);

            const client = this.getRestClient(session);

            // 获取现有产品
            const getResponse = await client.get({
                path: `products/${productId}`
            });

            const product = getResponse.body?.product;

            if (!product) {
                throw new Error(`Product with ID ${productId} not found`);
            }

            // 更新产品信息
            let changed = false;
            const updateData: any = {};

            if (product.title !== unifiedProduct.title) {
                updateData.title = unifiedProduct.title;
                changed = true;
            }

            if (product.body_html !== unifiedProduct.description) {
                updateData.body_html = unifiedProduct.description;
                changed = true;
            }

            if (product.vendor !== unifiedProduct.brandName) {
                updateData.vendor = unifiedProduct.brandName;
                changed = true;
            }

            // 更新变体价格
            if (product.variants && product.variants[0]) {
                const variant = product.variants[0];
                const targetPrice = unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price
                    ? unifiedProduct.salePrice.toString()
                    : unifiedProduct.price.toString();

                const variantUpdateData: any = {};
                let variantChanged = false;

                if (variant.price !== targetPrice) {
                    variantUpdateData.price = targetPrice;
                    variantChanged = true;
                }

                if (unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price) {
                    if (variant.compare_at_price !== unifiedProduct.price.toString()) {
                        variantUpdateData.compare_at_price = unifiedProduct.price.toString();
                        variantChanged = true;
                    }
                } else {
                    if (variant.compare_at_price) {
                        variantUpdateData.compare_at_price = null;
                        variantChanged = true;
                    }
                }

                if (variantChanged) {
                    await client.put({
                        path: `variants/${variant.id}`,
                        data: { variant: variantUpdateData }
                    });
                    changed = true;
                }
            }

            // 更新图片
            if (unifiedProduct.imageUrl) {
                const currentImageSrc = product.images && product.images[0] ? product.images[0].src : null;
                if (currentImageSrc !== unifiedProduct.imageUrl) {
                    updateData.images = [{ src: unifiedProduct.imageUrl }];
                    changed = true;
                }
            }

            if (changed && Object.keys(updateData).length > 0) {
                await client.put({
                    path: `products/${productId}`,
                    data: { product: updateData }
                });
                logger.info(`Updated product: ${product.title} (ID: ${product.id})`);
            } else {
                logger.info(`No changes needed for product: ${product.title} (ID: ${product.id})`);
            }

            return product;

        } catch (error) {
            logger.error(`Error updating product ${productId}:`, error);
            throw error;
        }
    }

    /**
     * 设置产品元字段
     */
    async setProductMetafield(
        session: Session,
        productId: string,
        namespace: string,
        key: string,
        value: any,
        valueType: string
    ): Promise<any> {
        try {
            const client = this.getRestClient(session);

            // 查找现有元字段
            const metafieldsResponse = await client.get({
                path: `products/${productId}/metafields`
            });

            const metafields = metafieldsResponse.body?.metafields || [];

            const existingMetafield = metafields.find(
                (mf: any) => mf.namespace === namespace && mf.key === key
            );

            if (existingMetafield) {
                // 更新现有元字段
                const response = await client.put({
                    path: `metafields/${existingMetafield.id}`,
                    data: {
                        metafield: {
                            value: value,
                            type: valueType
                        }
                    }
                });

                const metafield = response.body?.metafield;
                logger.info(`Updated metafield for product ${productId}: ${namespace}.${key}`);
                return metafield;
            } else {
                // 创建新元字段
                const response = await client.post({
                    path: `products/${productId}/metafields`,
                    data: {
                        metafield: {
                            namespace: namespace,
                            key: key,
                            value: value,
                            type: valueType
                        }
                    }
                });

                const metafield = response.body?.metafield;
                logger.info(`Created metafield for product ${productId}: ${namespace}.${key}`);
                return metafield;
            }

        } catch (error) {
            logger.error(`Error setting metafield for product ${productId}:`, error);
            throw error;
        }
    }

    /**
     * 设置库存
     */
    private async setInventory(session: Session, inventoryItemId: string, quantity: number): Promise<void> {
        try {
            const client = this.getRestClient(session);

            // 获取位置列表
            const locationsResponse = await client.get({
                path: 'locations'
            });

            const locations = locationsResponse.body?.locations || [];

            if (locations.length > 0) {
                const locationId = locations[0].id;

                await client.post({
                    path: 'inventory_levels/set',
                    data: {
                        location_id: locationId,
                        inventory_item_id: inventoryItemId,
                        available: quantity
                    }
                });

                logger.info(`Set inventory for item ${inventoryItemId} to ${quantity} at location ${locationId}`);
            }

        } catch (error) {
            logger.error(`Error setting inventory for item ${inventoryItemId}:`, error);
        }
    }

    /**
     * 设置产品状态
     */
    async setProductStatus(session: Session, productId: string, status: 'active' | 'draft'): Promise<boolean> {
        try {
            const client = this.getRestClient(session);

            // 获取现有产品
            const getResponse = await client.get({
                path: `products/${productId}`
            });

            const product = getResponse.body?.product;

            if (!product) {
                logger.error(`Product ${productId} not found for status update`);
                return false;
            }

            const currentPublishedAt = product.published_at;
            let changed = false;
            const updateData: any = {};

            if (status === 'active') {
                if (!currentPublishedAt) {
                    updateData.published_at = new Date().toISOString();
                    updateData.published_scope = 'web';
                    changed = true;
                }
            } else if (status === 'draft') {
                if (currentPublishedAt) {
                    updateData.published_at = null;
                    changed = true;
                }
            }

            if (changed) {
                await client.put({
                    path: `products/${productId}`,
                    data: { product: updateData }
                });
                logger.info(`Set product ${productId} status to '${status}'`);
            } else {
                logger.info(`Product ${productId} already has status '${status}'`);
            }

            return true;

        } catch (error) {
            logger.error(`Error setting product ${productId} status:`, error);
            return false;
        }
    }

    /**
     * 删除产品
     */
    async deleteProduct(session: Session, productId: string): Promise<boolean> {
        try {
            const client = this.getRestClient(session);

            // 检查产品是否存在
            const getResponse = await client.get({
                path: `products/${productId}`
            });

            const product = getResponse.body?.product;

            if (!product) {
                logger.error(`Product ${productId} not found for deletion`);
                return false;
            }

            await client.delete({
                path: `products/${productId}`
            });

            logger.info(`Deleted product ${productId}`);
            return true;

        } catch (error) {
            logger.error(`Error deleting product ${productId}:`, error);
            return false;
        }
    }

    /**
     * 获取Shopify API实例（用于其他操作）
     */
    getShopifyApi() {
        return this.shopify;
    }
} 