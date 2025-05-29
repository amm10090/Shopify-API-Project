import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { logger } from '@server/utils/logger';
import { UnifiedProduct, ShopifyProduct } from '@shared/types/index';

export class ShopifyService {
    private shopify: any;

    constructor() {
        // 检查必需的环境变量
        const requiredEnvVars = {
            SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
            SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET
        };

        for (const [key, value] of Object.entries(requiredEnvVars)) {
            if (!value) {
                throw new Error(`Missing required environment variable: ${key}`);
            }
        }

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

        logger.info('ShopifyService initialized successfully');
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

            // 使用 REST API 查找现有集合
            const collectionsResponse = await this.shopify.rest.CustomCollection.all({
                session,
                limit: 250
            });

            let existingCollection = collectionsResponse.data.find((coll: any) => coll.handle === handle);
            if (!existingCollection) {
                existingCollection = collectionsResponse.data.find((coll: any) => coll.title === title);
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
                    await existingCollection.save({ update: true });
                    logger.info(`Updated collection: ${existingCollection.title} (ID: ${existingCollection.id})`);
                }

                return existingCollection;
            }

            // 创建新集合
            const collection = new this.shopify.rest.CustomCollection({ session });
            collection.title = title;
            collection.handle = handle;
            collection.body_html = bodyHtml;
            collection.published = published;
            if (published) {
                collection.published_at = new Date().toISOString();
            }

            await collection.save();
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
            const collect = new this.shopify.rest.Collect({ session });
            collect.product_id = productId;
            collect.collection_id = collectionId;

            await collect.save();
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
            if (!this.shopify || !this.shopify.rest) {
                throw new Error('Shopify API instance not properly initialized');
            }

            if (!this.shopify.rest.Product) {
                throw new Error('Shopify Product API not available');
            }

            logger.info(`Searching for product with SKU: ${sku} in shop: ${session.shop}`);

            const products = await this.shopify.rest.Product.all({
                session,
                limit: 250
            });

            if (!products || !products.data) {
                logger.warn(`No products data returned for shop: ${session.shop}`);
                return null;
            }

            for (const product of products.data) {
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
                hasRestAPI: !!this.shopify?.rest,
                hasProductAPI: !!this.shopify?.rest?.Product
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

            const product = new this.shopify.rest.Product({ session });
            product.title = unifiedProduct.title;
            product.body_html = unifiedProduct.description;
            product.vendor = unifiedProduct.brandName;
            product.product_type = unifiedProduct.categories[0] || '';

            if (status === 'draft') {
                product.published_at = null;
                product.published_scope = 'web';
            } else if (status === 'active') {
                product.published_at = new Date().toISOString();
                product.published_scope = 'web';
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

            product.variants = [variantData];

            // 添加图片
            if (unifiedProduct.imageUrl) {
                product.images = [{ src: unifiedProduct.imageUrl }];
            }

            await product.save();
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

            const product = await this.shopify.rest.Product.find({
                session,
                id: productId
            });

            if (!product) {
                throw new Error(`Product with ID ${productId} not found`);
            }

            // 更新产品信息
            let changed = false;

            if (product.title !== unifiedProduct.title) {
                product.title = unifiedProduct.title;
                changed = true;
            }

            if (product.body_html !== unifiedProduct.description) {
                product.body_html = unifiedProduct.description;
                changed = true;
            }

            if (product.vendor !== unifiedProduct.brandName) {
                product.vendor = unifiedProduct.brandName;
                changed = true;
            }

            // 更新变体价格
            if (product.variants && product.variants[0]) {
                const variant = product.variants[0];
                const targetPrice = unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price
                    ? unifiedProduct.salePrice.toString()
                    : unifiedProduct.price.toString();

                if (variant.price !== targetPrice) {
                    variant.price = targetPrice;
                    changed = true;
                }

                if (unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price) {
                    if (variant.compare_at_price !== unifiedProduct.price.toString()) {
                        variant.compare_at_price = unifiedProduct.price.toString();
                        changed = true;
                    }
                } else {
                    if (variant.compare_at_price) {
                        variant.compare_at_price = null;
                        changed = true;
                    }
                }
            }

            // 更新图片
            if (unifiedProduct.imageUrl) {
                const currentImageSrc = product.images && product.images[0] ? product.images[0].src : null;
                if (currentImageSrc !== unifiedProduct.imageUrl) {
                    product.images = [{ src: unifiedProduct.imageUrl }];
                    changed = true;
                }
            }

            if (changed) {
                await product.save({ update: true });
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
            // 查找现有元字段
            const metafields = await this.shopify.rest.Metafield.all({
                session,
                metafield: {
                    owner_id: productId,
                    owner_resource: 'product'
                }
            });

            const existingMetafield = metafields.data.find(
                (mf: any) => mf.namespace === namespace && mf.key === key
            );

            if (existingMetafield) {
                // 更新现有元字段
                existingMetafield.value = value;
                existingMetafield.type = valueType;
                await existingMetafield.save({ update: true });
                logger.info(`Updated metafield for product ${productId}: ${namespace}.${key}`);
                return existingMetafield;
            } else {
                // 创建新元字段
                const metafield = new this.shopify.rest.Metafield({ session });
                metafield.namespace = namespace;
                metafield.key = key;
                metafield.value = value;
                metafield.type = valueType;
                metafield.owner_id = productId;
                metafield.owner_resource = 'product';

                await metafield.save();
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
            const locations = await this.shopify.rest.Location.all({
                session
            });

            if (locations.data.length > 0) {
                const locationId = locations.data[0].id;

                await this.shopify.rest.InventoryLevel.set({
                    session,
                    location_id: locationId,
                    inventory_item_id: inventoryItemId,
                    available: quantity
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
            const product = await this.shopify.rest.Product.find({
                session,
                id: productId
            });

            if (!product) {
                logger.error(`Product ${productId} not found for status update`);
                return false;
            }

            const currentPublishedAt = product.published_at;
            let changed = false;

            if (status === 'active') {
                if (!currentPublishedAt) {
                    product.published_at = new Date().toISOString();
                    product.published_scope = 'web';
                    changed = true;
                }
            } else if (status === 'draft') {
                if (currentPublishedAt) {
                    product.published_at = null;
                    changed = true;
                }
            }

            if (changed) {
                await product.save({ update: true });
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
            const product = await this.shopify.rest.Product.find({
                session,
                id: productId
            });

            if (!product) {
                logger.error(`Product ${productId} not found for deletion`);
                return false;
            }

            await this.shopify.rest.Product.delete({
                session,
                id: productId
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