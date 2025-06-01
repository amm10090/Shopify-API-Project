import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { logger } from '@server/utils/logger';
import { UnifiedProduct, ShopifyProduct } from '@shared/types/index';
import { CustomAppService } from '@server/services/CustomAppService';
import { getShopifyApi } from '@server/config/shopify';

export class ShopifyService {
    private shopify: any;
    private isCustomApp: boolean;
    private useGraphQL: boolean;

    constructor() {
        this.isCustomApp = process.env.SHOPIFY_APP_TYPE === 'custom';
        this.useGraphQL = process.env.SHOPIFY_USE_GRAPHQL !== 'false'; // 默认启用GraphQL

        // 验证必需的环境变量
        const requiredVars = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET'];
        if (this.isCustomApp) {
            requiredVars.push('SHOPIFY_ACCESS_TOKEN', 'SHOPIFY_STORE_NAME');
        }

        for (const key of requiredVars) {
            if (!process.env[key]) {
                throw new Error(`Missing required environment variable: ${key}`);
            }
        }

        // 使用单例的Shopify API实例
        this.shopify = getShopifyApi();

        logger.info(`ShopifyService initialized for ${this.isCustomApp ? 'custom' : 'OAuth'} app mode`);
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
     * 根据SKU查找产品（智能选择API）
     */
    /**
     * 通过SKU查找产品（智能选择API）- 遵循Shopify最佳实践
     */
    async getProductBySku(session: Session, sku: string): Promise<any> {
        // 优先使用GraphQL避免弃用警告
        if (this.useGraphQL) {
            try {
                logger.debug(`Searching product by SKU with GraphQL API: ${sku}`);
                return await this.getProductBySkuWithGraphQL(session, sku);
            } catch (error) {
                logger.warn(`GraphQL product search failed, falling back to REST API:`, error);
                return this.getProductBySkuRest(session, sku);
            }
        }

        logger.debug(`Searching product by SKU with REST API: ${sku}`);
        return this.getProductBySkuRest(session, sku);
    }

    /**
     * 根据SKU查找产品（REST API版本）
     */
    async getProductBySkuRest(session: Session, sku: string): Promise<any> {
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
     * 创建新产品（智能选择API）
     */
    /**
     * 创建产品（智能选择API）- 遵循Shopify最佳实践
     */
    async createProduct(session: Session, unifiedProduct: UnifiedProduct, status: string = 'draft'): Promise<any> {
        // 确保状态始终为draft，除非明确指定为其他值
        status = status || 'draft';

        // 优先使用GraphQL API避免弃用警告
        if (this.useGraphQL) {
            try {
                logger.info(`Creating product with GraphQL API (best practice mode): ${unifiedProduct.title}`);
                return await this.createProductWithGraphQL(session, unifiedProduct, status);
            } catch (error) {
                logger.warn(`GraphQL product creation failed, falling back to REST API:`, error);
                // 如果GraphQL失败，回退到REST API
                return this.createProductRest(session, unifiedProduct, status);
            }
        }

        // 使用REST API
        logger.info(`Creating product with REST API: ${unifiedProduct.title}`);
        return this.createProductRest(session, unifiedProduct, status);
    }

    /**
     * 创建新产品（REST API版本）
     */
    async createProductRest(session: Session, unifiedProduct: UnifiedProduct, status: string = 'draft'): Promise<any> {
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

            // 改进的图片处理逻辑 - 优先创建产品，图片问题不阻止产品创建
            let imageValidated = false;
            let finalImageUrl = unifiedProduct.imageUrl;

            if (unifiedProduct.imageUrl) {
                logger.info(`Preparing to add image to product: ${unifiedProduct.imageUrl}`);

                // 检测并修复图片格式问题 - 使用增强的检测逻辑
                const optimizedImageUrl = await this.detectAndFixImageFormat(unifiedProduct.imageUrl);

                if (optimizedImageUrl !== unifiedProduct.imageUrl) {
                    logger.info(`Using format-optimized image URL: ${optimizedImageUrl}`);
                    finalImageUrl = optimizedImageUrl;
                }

                // 验证最终的图片URL
                if (this.isValidImageUrlFormat(finalImageUrl)) {
                    try {
                        // 对于代理URL，跳过可访问性测试（因为代理服务会处理）
                        const isProxyUrl = finalImageUrl.includes('/api/shopify/image-proxy');

                        if (isProxyUrl) {
                            // 代理URL直接认为有效
                            productData.images = [{
                                src: finalImageUrl,
                                alt: unifiedProduct.title
                            }];
                            imageValidated = true;
                            logger.info(`Proxy URL validated and will be included in product creation: ${finalImageUrl}`);
                        } else {
                            // 非代理URL测试可访问性
                            const imageAccessible = await this.testImageAccess(finalImageUrl);

                            if (imageAccessible) {
                                // 先尝试在产品创建时包含图片
                                productData.images = [{
                                    src: finalImageUrl,
                                    alt: unifiedProduct.title
                                }];
                                imageValidated = true;
                                logger.info(`Image URL validated and will be included in product creation: ${finalImageUrl}`);
                            } else {
                                logger.warn(`Image URL not accessible, will use proxy service: ${finalImageUrl}`);
                                // 如果原URL不可访问，强制使用代理服务
                                finalImageUrl = this.generateProxyUrl(unifiedProduct.imageUrl, true);
                                productData.images = [{
                                    src: finalImageUrl,
                                    alt: unifiedProduct.title
                                }];
                                imageValidated = true;
                                logger.info(`Using proxy service for product creation: ${finalImageUrl}`);
                            }
                        }
                    } catch (imageError) {
                        logger.warn(`Error testing image access, using proxy service:`, imageError);
                        // 出错时使用代理服务
                        finalImageUrl = this.generateProxyUrl(unifiedProduct.imageUrl, true);
                        productData.images = [{
                            src: finalImageUrl,
                            alt: unifiedProduct.title
                        }];
                        imageValidated = true;
                        logger.info(`Error fallback: using proxy service for product creation: ${finalImageUrl}`);
                    }
                } else {
                    logger.warn(`Invalid image URL format, using proxy service: ${finalImageUrl}`);
                    // 格式无效时使用代理服务
                    finalImageUrl = this.generateProxyUrl(unifiedProduct.imageUrl, true);
                    productData.images = [{
                        src: finalImageUrl,
                        alt: unifiedProduct.title
                    }];
                    imageValidated = true;
                    logger.info(`Format fix: using proxy service for product creation: ${finalImageUrl}`);
                }
            } else {
                logger.info(`No image URL provided for product: ${unifiedProduct.title}`);
            }

            const response = await client.post({
                path: 'products',
                data: { product: productData }
            });

            const product = response.body?.product;
            logger.info(`Created product: ${product.title} (ID: ${product.id})`);

            // 智能图片处理：根据创建结果和验证状态决定后续操作
            if (product && unifiedProduct.imageUrl) {
                const hasImages = product.images && product.images.length > 0;

                if (!hasImages) {
                    // 产品创建时没有包含图片，尝试单独添加
                    logger.info(`Product created without image, attempting to add separately for product ${product.id}`);

                    // 使用处理过的图片URL（如果有的话）
                    const imageUrlToUse = finalImageUrl || unifiedProduct.imageUrl;
                    const imageAdded = await this.addImageToProduct(session, product.id, imageUrlToUse, unifiedProduct.title);

                    if (imageAdded) {
                        logger.info(`Successfully added image separately to product ${product.id}`);
                    } else {
                        logger.warn(`Failed to add image to product ${product.id}. Product created successfully but without image.`);
                        // 这里可以选择记录需要手动处理的产品列表
                    }
                } else if (imageValidated) {
                    logger.info(`Product ${product.id} created successfully with ${product.images.length} image(s)`);
                } else {
                    // 意外情况：产品有图片但我们没有验证通过，记录一下
                    logger.info(`Product ${product.id} unexpectedly has ${product.images.length} image(s) despite validation issues`);
                }
            }

            // 设置库存
            if (product.variants && product.variants[0]) {
                const defaultQuantity = parseInt(process.env.SHOPIFY_DEFAULT_PRODUCT_INVENTORY || '99');
                const targetQuantity = unifiedProduct.availability === false ? 0 : defaultQuantity;

                logger.info(`Setting inventory for new product ${product.id} - availability: ${unifiedProduct.availability}, target quantity: ${targetQuantity}`);
                await this.setInventory(session, product.variants[0].inventory_item_id, targetQuantity);
            } else {
                logger.info(`Skipping inventory setup - no variants found for product ${product.id}`);
            }

            return product;

        } catch (error) {
            logger.error(`Error creating product '${unifiedProduct.title}':`, error);
            throw error;
        }
    }

    /**
     * 验证图片URL格式
     */
    private isValidImageUrlFormat(url: string): boolean {
        if (!url) return false;

        // 基本URL格式检查
        const urlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
        if (!urlPattern.test(url)) {
            // 如果不符合标准图片扩展名，检查是否是已知的图片服务
            const imageServicePatterns = [
                /feedonomics\.com/i,
                /images\.unsplash\.com/i,
                /shopify\.com/i,
                /amazonaws\.com/i,
                /cloudinary\.com/i,
                /imagekit\.io/i
            ];

            return imageServicePatterns.some(pattern => pattern.test(url));
        }

        return true;
    }

    /**
     * 测试图片URL是否可访问（包含格式检测）
     */
    private async testImageAccess(url: string, timeout: number = 5000): Promise<boolean> {
        try {
            // 首先尝试格式检测和修复
            const optimizedUrl = await this.detectAndFixImageFormat(url);

            // 尝试多种User-Agent来提高兼容性
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Shopify-Product-Importer/1.0',
                'Mozilla/5.0 (compatible; Shopify/1.0; +https://shopify.com/)'
            ];

            // 测试原始URL和优化后的URL
            const urlsToTest = [optimizedUrl];
            if (optimizedUrl !== url) {
                urlsToTest.push(url); // 如果优化后不同，也测试原始URL
            }

            for (const testUrl of urlsToTest) {
                for (const userAgent of userAgents) {
                    try {
                        const response = await fetch(testUrl, {
                            method: 'HEAD',
                            signal: AbortSignal.timeout(timeout),
                            headers: {
                                'User-Agent': userAgent,
                                'Accept': 'image/*,*/*;q=0.8',
                                'Accept-Encoding': 'gzip, deflate, br',
                                'Cache-Control': 'no-cache'
                            }
                        });

                        if (response.ok) {
                            const contentType = response.headers.get('content-type')?.toLowerCase() || '';
                            const isValidImage = (
                                contentType.startsWith('image/') ||
                                contentType.includes('octet-stream') ||
                                contentType === '' // 某些服务器不返回Content-Type
                            );

                            if (isValidImage) {
                                logger.debug(`Image URL accessible with User-Agent "${userAgent}": ${testUrl} (${contentType})`);
                                return true;
                            }
                        }
                    } catch (agentError) {
                        // 尝试下一个User-Agent
                        continue;
                    }
                }
            }

            // 如果HEAD请求都失败，尝试GET请求的前几个字节
            for (const testUrl of urlsToTest) {
                try {
                    const response = await fetch(testUrl, {
                        method: 'GET',
                        signal: AbortSignal.timeout(timeout),
                        headers: {
                            'User-Agent': userAgents[0],
                            'Range': 'bytes=0-1023', // 只获取前1KB
                            'Accept': 'image/*,*/*;q=0.8'
                        }
                    });

                    if (response.ok) {
                        const contentType = response.headers.get('content-type')?.toLowerCase() || '';
                        if (contentType.startsWith('image/')) {
                            logger.debug(`Image URL accessible via GET request: ${testUrl} (${contentType})`);
                            return true;
                        }
                    }
                } catch (getError) {
                    logger.debug(`GET request failed for image: ${testUrl}`);
                    continue;
                }
            }

            logger.warn(`Image URL not accessible with any method: ${url}`);
            return false;
        } catch (error) {
            logger.warn(`Image URL access test failed: ${url}`, error);
            return false;
        }
    }

    /**
     * 单独为产品添加图片（智能选择API）
     */
    private async addImageToProduct(session: Session, productId: string, imageUrl: string, altText: string): Promise<boolean> {
        // 优先使用GraphQL避免弃用警告
        if (this.useGraphQL) {
            return this.addImageToProductWithGraphQL(session, productId, imageUrl, altText);
        }

        return this.addImageToProductRest(session, productId, imageUrl, altText);
    }

    /**
     * 使用GraphQL为产品添加图片（遵循Shopify最佳实践）
     */
    private async addImageToProductWithGraphQL(session: Session, productId: string, imageUrl: string, altText: string): Promise<boolean> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            // 首先尝试检测和修复图片格式
            const optimizedImageUrl = await this.detectAndFixImageFormat(imageUrl);
            logger.info(`Using optimized image URL for GraphQL: ${optimizedImageUrl}`);

            // 使用现代化的productCreateMedia mutation，避免弃用警告
            const mutation = `
                mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                    productCreateMedia(productId: $productId, media: $media) {
                        media {
                            id
                            alt
                            mediaContentType
                            status
                            ... on MediaImage {
                                image {
                                    url
                                    width
                                    height
                                }
                            }
                        }
                        mediaUserErrors {
                            field
                            message
                            code
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

            // 准备多个URL变体来尝试
            const urlsToTry = [optimizedImageUrl];

            // 如果优化后的URL不同，也尝试原始URL
            if (optimizedImageUrl !== imageUrl) {
                urlsToTry.push(imageUrl);
            }

            // 添加图片代理URL作为备选
            const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
            const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(imageUrl)}&format=jpg&fix=true`;
            urlsToTry.push(proxyUrl);

            let lastError: Error | null = null;

            // 尝试每个URL变体
            for (const tryUrl of urlsToTry) {
                try {
                    logger.info(`Attempting to add image with URL: ${tryUrl}`);

                    const variables = {
                        productId: `gid://shopify/Product/${productId}`,
                        media: [{
                            originalSource: this.encodeImageUrl(tryUrl),
                            alt: altText,
                            mediaContentType: 'IMAGE'
                        }]
                    };

                    const response = await client.request(mutation, { variables });

                    // 检查GraphQL错误
                    if (response.data?.productCreateMedia?.mediaUserErrors?.length > 0) {
                        const errors = response.data.productCreateMedia.mediaUserErrors;
                        const errorMessages = errors.map((e: any) => `${e.field?.join('.')}: ${e.message} (${e.code})`);

                        // 检查是否是格式相关的错误
                        const hasFormatError = errors.some((e: any) =>
                            e.message?.toLowerCase().includes('format') ||
                            e.message?.toLowerCase().includes('extension') ||
                            e.message?.toLowerCase().includes('file type') ||
                            e.code === 'INVALID_IMAGE_FORMAT'
                        );

                        if (hasFormatError) {
                            logger.warn(`Format error with URL ${tryUrl}, trying next variant: ${errorMessages.join(', ')}`);
                            lastError = new Error(`Format error: ${errorMessages.join(', ')}`);
                            continue; // 尝试下一个URL
                        } else {
                            throw new Error(`Image creation failed: ${errorMessages.join(', ')}`);
                        }
                    }

                    if (response.data?.productCreateMedia?.userErrors?.length > 0) {
                        const errors = response.data.productCreateMedia.userErrors;
                        const errorMessages = errors.map((e: any) => `${e.field?.join('.')}: ${e.message}`);
                        logger.warn(`GraphQL userErrors with URL ${tryUrl}: ${errorMessages.join(', ')}`);
                        lastError = new Error(`User errors: ${errorMessages.join(', ')}`);
                        continue; // 尝试下一个URL
                    }

                    // 检查是否成功创建了媒体
                    const media = response.data?.productCreateMedia?.media;
                    if (media && media.length > 0) {
                        const createdMedia = media[0];
                        logger.info(`Successfully added image to product ${productId} using GraphQL Media API. Media ID: ${createdMedia.id}, Status: ${createdMedia.status}, URL: ${tryUrl}`);
                        return true;
                    } else {
                        logger.warn(`GraphQL image creation returned no media for URL ${tryUrl}`);
                        lastError = new Error('No media created');
                        continue;
                    }

                } catch (urlError) {
                    logger.warn(`GraphQL image creation failed for URL ${tryUrl}:`, urlError);
                    lastError = urlError instanceof Error ? urlError : new Error(String(urlError));
                    continue;
                }
            }

            // 所有URL都失败了
            logger.error(`All GraphQL image creation attempts failed for product ${productId}. Last error:`, lastError);
            throw lastError || new Error('All URL variants failed');

        } catch (error) {
            logger.error(`Error adding image to product ${productId} with GraphQL:`, error);
            // 回退到REST API
            logger.info(`Falling back to REST API for product ${productId} image`);
            return this.addImageToProductRest(session, productId, imageUrl, altText);
        }
    }

    /**
     * 使用REST API为产品添加图片
     */
    private async addImageToProductRest(session: Session, productId: string, imageUrl: string, altText: string): Promise<boolean> {
        try {
            const client = this.getRestClient(session);

            // 首先检测和优化图片URL
            const optimizedImageUrl = await this.detectAndFixImageFormat(imageUrl);
            logger.info(`Using optimized image URL for REST API: ${optimizedImageUrl}`);

            // 准备要尝试的URL列表（包括代理服务）
            const urlsToTry = [optimizedImageUrl];

            if (optimizedImageUrl !== imageUrl) {
                urlsToTry.push(imageUrl); // 原始URL作为备选
            }

            // 添加图片代理URL作为最后的备选
            const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
            const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(imageUrl)}&format=jpg&fix=true`;
            urlsToTry.push(proxyUrl);

            let lastError: any = null;

            // 尝试每个URL
            for (const tryUrl of urlsToTry) {
                try {
                    logger.info(`REST API: Attempting to add image with URL: ${tryUrl.substring(0, 100)}...`);

                    const response = await client.post({
                        path: `products/${productId}/images`,
                        data: {
                            image: {
                                src: tryUrl,
                                alt: altText
                            }
                        }
                    });

                    if (response.body?.image) {
                        logger.info(`Successfully added image to product ${productId} via REST API: ${tryUrl.substring(0, 100)}...`);
                        return true;
                    }

                } catch (shopifyError: any) {
                    lastError = shopifyError;

                    // 分析Shopify的具体错误
                    const errorMessage = shopifyError.message || '';
                    const errorBody = shopifyError.response?.body || {};
                    const statusCode = shopifyError.response?.code || shopifyError.response?.status;

                    // 检查是否是格式相关的错误
                    const isFormatError = (
                        errorMessage.includes('not a valid image file type') ||
                        errorMessage.includes('file type') ||
                        errorMessage.includes('format') ||
                        errorMessage.includes('extension') ||
                        errorBody.errors?.image?.some((err: string) =>
                            err.includes('not a valid image file type') ||
                            err.includes('format') ||
                            err.includes('extension')
                        )
                    );

                    const isNetworkError = (
                        statusCode === 422 ||
                        errorMessage.includes('invalid') ||
                        errorMessage.includes('could not be downloaded') ||
                        errorMessage.includes('unreachable')
                    );

                    if (isFormatError || isNetworkError) {
                        logger.warn(`Shopify rejected image URL (${statusCode}): ${tryUrl.substring(0, 100)}... - ${errorMessage}`);

                        // 如果是格式错误或网络错误，尝试下一个URL
                        continue;
                    } else {
                        // 其他类型的错误，记录但继续尝试
                        logger.warn(`Unexpected error with URL ${tryUrl.substring(0, 100)}...: ${errorMessage}`);
                        continue;
                    }
                }
            }

            // 所有URL都失败了
            if (lastError) {
                const errorMessage = lastError.message || '';
                const errorBody = lastError.response?.body || {};

                logger.error(`All REST API image URLs failed for product ${productId}. Last error: ${errorMessage}`, {
                    productId,
                    originalUrl: imageUrl,
                    attemptedUrls: urlsToTry.length,
                    lastErrorBody: errorBody
                });

                // 检查是否所有错误都是格式相关的
                const allFormatErrors = urlsToTry.every((_, index) => {
                    // 这里简化处理，假设如果最后一个错误是格式错误，那么可能都是格式问题
                    return errorMessage.includes('not a valid image file type') ||
                        errorMessage.includes('format') ||
                        errorMessage.includes('extension');
                });

                if (allFormatErrors) {
                    logger.warn(`All image format variants failed for product ${productId}. This image may not be compatible with Shopify.`);
                } else {
                    logger.warn(`Network or other issues prevented image upload for product ${productId}.`);
                }
            } else {
                logger.warn(`Failed to add image to product ${productId}: all URLs returned no response`);
            }

            return false; // 图片添加失败，但不影响产品创建

        } catch (error) {
            logger.error(`Error in REST API addImageToProduct for product ${productId}:`, error);
            return false;
        }
    }

    /**
     * 生成备用图片URL尝试列表（使用高级格式检测）
     */
    private generateAlternativeImageUrls(originalUrl: string): string[] {
        const alternatives: string[] = [];

        try {
            // 1. 首先使用高级备用URL生成
            const advancedAlternatives = this.generateAdvancedAlternativeImageUrls(originalUrl);
            alternatives.push(...advancedAlternatives);

            // 2. 添加传统的URL编码处理
            const encodedUrl = this.encodeImageUrl(originalUrl);
            if (encodedUrl !== originalUrl && !alternatives.includes(encodedUrl)) {
                alternatives.push(encodedUrl);
                logger.info(`Generated URL-encoded alternative: ${encodedUrl}`);
            }

            // 3. 添加时间戳参数（用于绕过缓存）
            const withTimestamp = `${encodedUrl || originalUrl}${(encodedUrl || originalUrl).includes('?') ? '&' : '?'}t=${Date.now()}`;
            if (!alternatives.includes(withTimestamp)) {
                alternatives.push(withTimestamp);
            }

            // 4. 如果URL没有明确的图片扩展名，尝试添加
            if (!originalUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
                const jpgVariant = `${encodedUrl || originalUrl}.jpg`;
                const pngVariant = `${encodedUrl || originalUrl}.png`;

                if (!alternatives.includes(jpgVariant)) {
                    alternatives.push(jpgVariant);
                }
                if (!alternatives.includes(pngVariant)) {
                    alternatives.push(pngVariant);
                }
            }

            // 5. 尝试转换为HTTPS
            try {
                const url = new URL(encodedUrl || originalUrl);
                if (url.protocol === 'http:') {
                    const httpsUrl = (encodedUrl || originalUrl).replace('http://', 'https://');
                    if (!alternatives.includes(httpsUrl)) {
                        alternatives.push(httpsUrl);
                    }
                }
            } catch (urlError) {
                logger.debug(`URL parsing failed for HTTPS conversion: ${originalUrl}`);
            }

            // 6. 使用图片代理服务（作为最后的尝试）
            const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
            const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(originalUrl)}&format=jpg&fix=true`;
            if (!alternatives.includes(proxyUrl)) {
                alternatives.push(proxyUrl);
            }

        } catch (error) {
            logger.debug(`Error generating alternatives for: ${originalUrl}`, error);

            // 回退到基本的URL编码
            try {
                const basicEncoded = this.encodeImageUrl(originalUrl);
                if (basicEncoded !== originalUrl) {
                    alternatives.push(basicEncoded);
                }
            } catch (e) {
                logger.debug(`Failed to encode URL: ${originalUrl}`);
            }
        }

        // 去重并限制尝试次数
        const uniqueAlternatives = [...new Set(alternatives)].slice(0, 10);
        logger.info(`Generated ${uniqueAlternatives.length} alternative URLs for image: ${originalUrl}`);

        return uniqueAlternatives;
    }

    /**
     * 正确编码图片URL，处理空格和特殊字符
     */
    private encodeImageUrl(url: string): string {
        try {
            // 检查URL是否包含需要编码的字符
            if (!/[\s<>"{}|\\^`\[\]]/.test(url)) {
                return url; // URL已经是安全的
            }

            // 分解URL为各个部分
            const urlObj = new URL(url);

            // 编码路径部分，但保留斜杠
            const pathParts = urlObj.pathname.split('/');
            const encodedParts = pathParts.map(part => {
                // 跳过空字符串（斜杠分割产生的）
                if (!part) return part;

                // 对每个路径段进行编码，但避免重复编码
                try {
                    // 如果部分已经编码，先解码再重新编码
                    const decoded = decodeURIComponent(part);
                    return encodeURIComponent(decoded);
                } catch (e) {
                    // 如果解码失败，直接编码
                    return encodeURIComponent(part);
                }
            });

            // 重建路径
            urlObj.pathname = encodedParts.join('/');

            const encodedUrl = urlObj.toString();
            logger.debug(`URL encoding: '${url}' -> '${encodedUrl}'`);
            return encodedUrl;

        } catch (error) {
            logger.warn(`Failed to encode URL '${url}':`, error);

            // 回退到简单的空格编码
            return url.replace(/\s+/g, '%20');
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

                // 检查并更新库存
                await this.checkAndUpdateInventory(session, variant, unifiedProduct.availability);
            }

            // 改进的图片更新逻辑
            if (unifiedProduct.imageUrl) {
                const currentImageSrc = product.images && product.images[0] ? product.images[0].src : null;
                if (currentImageSrc !== unifiedProduct.imageUrl) {
                    logger.info(`Updating product image from '${currentImageSrc}' to '${unifiedProduct.imageUrl}'`);

                    // 验证新图片URL
                    if (this.isValidImageUrlFormat(unifiedProduct.imageUrl)) {
                        try {
                            const imageAccessible = await this.testImageAccess(unifiedProduct.imageUrl);

                            if (imageAccessible) {
                                updateData.images = [{
                                    src: unifiedProduct.imageUrl,
                                    alt: unifiedProduct.title
                                }];
                                changed = true;
                                logger.info(`Image URL validated and will be updated: ${unifiedProduct.imageUrl}`);
                            } else {
                                logger.warn(`New image URL not accessible, keeping existing image: ${unifiedProduct.imageUrl}`);
                            }
                        } catch (imageError) {
                            logger.warn(`Error testing new image access, keeping existing image:`, imageError);
                        }
                    } else {
                        logger.warn(`Invalid new image URL format, keeping existing image: ${unifiedProduct.imageUrl}`);
                    }
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

        } catch (error: any) {
            // 检查是否是 404 错误
            if (error.response?.code === 404 || error.message?.includes('404') || error.message?.includes('Not Found')) {
                const productNotFoundError = new Error(`Product with ID ${productId} not found in Shopify store`);
                (productNotFoundError as any).code = 'PRODUCT_NOT_FOUND';
                (productNotFoundError as any).productId = productId;
                throw productNotFoundError;
            }

            logger.error(`Error updating product ${productId}:`, error);
            throw error;
        }
    }

    /**
     * 检查并更新库存，根据availability状态设置合适的库存数量
     */
    private async checkAndUpdateInventory(session: Session, variant: any, availability?: boolean): Promise<void> {
        try {
            if (!variant.inventory_item_id) {
                logger.warn(`Variant ${variant.id} has no inventory_item_id, skipping inventory check`);
                return;
            }

            const client = this.getRestClient(session);
            const defaultInventoryQuantity = parseInt(process.env.SHOPIFY_DEFAULT_PRODUCT_INVENTORY || '99');

            logger.info(`Checking inventory for variant ${variant.id}, availability: ${availability}, default quantity: ${defaultInventoryQuantity}`);

            // 获取当前库存级别
            const inventoryResponse = await client.get({
                path: `inventory_levels?inventory_item_ids=${variant.inventory_item_id}`
            });

            const inventoryLevels = inventoryResponse.body?.inventory_levels || [];

            if (inventoryLevels.length === 0) {
                const targetQuantity = availability === false ? 0 : defaultInventoryQuantity;
                logger.info(`No inventory levels found for variant ${variant.id}, setting to ${targetQuantity} based on availability: ${availability}`);
                await this.setInventory(session, variant.inventory_item_id, targetQuantity);
                return;
            }

            // 计算总库存
            let totalInventory = 0;
            for (const level of inventoryLevels) {
                if (level.available !== null && level.available !== undefined) {
                    totalInventory += level.available;
                }
            }

            logger.info(`Current total inventory for variant ${variant.id}: ${totalInventory}, availability: ${availability}`);

            // 根据availability状态决定库存设置策略
            if (availability === false) {
                // 产品缺货，将库存设为0
                if (totalInventory > 0) {
                    logger.info(`Product marked as out of stock, setting inventory to 0 (was ${totalInventory})`);
                    await this.setInventory(session, variant.inventory_item_id, 0);
                } else {
                    logger.info(`Product already has 0 inventory, no change needed`);
                }
            } else if (availability === true) {
                // 产品有库存，确保库存不为0
                if (totalInventory === 0) {
                    logger.info(`Product marked as in stock but has 0 inventory, setting to default quantity: ${defaultInventoryQuantity}`);
                    await this.setInventory(session, variant.inventory_item_id, defaultInventoryQuantity);
                } else if (totalInventory < defaultInventoryQuantity) {
                    logger.info(`Product has low inventory (${totalInventory}), updating to default quantity: ${defaultInventoryQuantity}`);
                    await this.setInventory(session, variant.inventory_item_id, defaultInventoryQuantity);
                } else {
                    logger.info(`Product has sufficient inventory (${totalInventory}), no change needed`);
                }
            } else {
                // availability未指定，只检查是否低于默认值（保持原有逻辑）
                if (totalInventory < defaultInventoryQuantity) {
                    logger.info(`Current inventory (${totalInventory}) is below default (${defaultInventoryQuantity}), updating...`);
                    await this.setInventory(session, variant.inventory_item_id, defaultInventoryQuantity);
                } else {
                    logger.info(`Current inventory (${totalInventory}) is above or equal to default (${defaultInventoryQuantity}), no update needed`);
                }
            }

        } catch (error) {
            logger.error(`Error checking/updating inventory for variant ${variant.id}:`, error);
            // 不抛出错误，避免影响产品更新流程
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

            logger.info(`Setting inventory for item ${inventoryItemId} to ${quantity} (from env: ${process.env.SHOPIFY_DEFAULT_PRODUCT_INVENTORY})`);

            // 获取位置列表
            const locationsResponse = await client.get({
                path: 'locations'
            });

            const locations = locationsResponse.body?.locations || [];
            logger.info(`Found ${locations.length} locations:`, locations.map((loc: any) => ({ id: loc.id, name: loc.name, active: loc.active, legacy: loc.legacy })));

            if (locations.length > 0) {
                // 优先选择非履行服务的主要位置
                let targetLocation = locations.find((location: any) =>
                    location.active &&
                    !location.legacy &&
                    location.name !== 'Fulfillment Service'
                );

                // 如果没有找到非履行服务位置，则使用第一个活跃位置
                if (!targetLocation) {
                    targetLocation = locations.find((location: any) => location.active);
                }

                // 如果还是没有找到，使用第一个位置
                if (!targetLocation) {
                    targetLocation = locations[0];
                }

                const locationId = targetLocation.id;
                logger.info(`Using location: ${targetLocation.name} (ID: ${locationId})`);

                await client.post({
                    path: 'inventory_levels/set',
                    data: {
                        location_id: locationId,
                        inventory_item_id: inventoryItemId,
                        available: quantity
                    }
                });

                logger.info(`Successfully set inventory for item ${inventoryItemId} to ${quantity} at location ${locationId} (${targetLocation.name})`);
            } else {
                logger.warn(`No locations found for setting inventory`);
            }

        } catch (error) {
            logger.error(`Error setting inventory for item ${inventoryItemId} to ${quantity}:`, error);
            // 不抛出错误，避免影响产品创建流程
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

    /**
     * 检查产品是否存在于Shopify
     */
    async checkProductExists(session: Session, productId: string): Promise<{ exists: boolean; product?: any }> {
        try {
            const client = this.getRestClient(session);

            const response = await client.get({
                path: `products/${productId}`
            });

            if (response.body?.product) {
                return { exists: true, product: response.body.product };
            } else {
                return { exists: false };
            }

        } catch (error: any) {
            // 检查是否是404错误（产品不存在）
            if (error.response?.code === 404 || error.message?.includes('404')) {
                return { exists: false };
            }
            // 重新抛出其他错误
            throw error;
        }
    }

    /**
     * 同步单个产品的库存状态
     */
    async syncInventoryForProduct(session: Session, shopifyProduct: any, availability: boolean): Promise<{ synced: boolean; error?: string }> {
        try {
            if (!shopifyProduct.variants || !shopifyProduct.variants[0]) {
                return { synced: false, error: 'No variants found' };
            }

            const variant = shopifyProduct.variants[0];

            if (!variant.inventory_item_id) {
                return { synced: false, error: 'No inventory_item_id found' };
            }

            const client = this.getRestClient(session);
            const defaultInventoryQuantity = parseInt(process.env.SHOPIFY_DEFAULT_PRODUCT_INVENTORY || '99');

            // 获取当前库存
            const inventoryResponse = await client.get({
                path: `inventory_levels?inventory_item_ids=${variant.inventory_item_id}`
            });

            const inventoryLevels = inventoryResponse.body?.inventory_levels || [];
            let totalInventory = 0;

            for (const level of inventoryLevels) {
                if (level.available !== null && level.available !== undefined) {
                    totalInventory += level.available;
                }
            }

            let needsUpdate = false;
            let targetQuantity = totalInventory;

            if (availability === false && totalInventory > 0) {
                // 产品应该缺货但当前有库存
                targetQuantity = 0;
                needsUpdate = true;
            } else if (availability === true && totalInventory === 0) {
                // 产品应该有库存但当前缺货
                targetQuantity = defaultInventoryQuantity;
                needsUpdate = true;
            }

            if (needsUpdate) {
                // 获取位置并设置库存
                const locationsResponse = await client.get({
                    path: 'locations'
                });

                const locations = locationsResponse.body?.locations || [];
                let targetLocation = locations.find((location: any) =>
                    location.active &&
                    !location.legacy &&
                    location.name !== 'Fulfillment Service'
                );

                if (!targetLocation) {
                    targetLocation = locations.find((location: any) => location.active);
                }

                if (!targetLocation && locations.length > 0) {
                    targetLocation = locations[0];
                }

                if (targetLocation) {
                    await client.post({
                        path: 'inventory_levels/set',
                        data: {
                            location_id: targetLocation.id,
                            inventory_item_id: variant.inventory_item_id,
                            available: targetQuantity
                        }
                    });

                    logger.info(`Updated inventory for product ${shopifyProduct.id} from ${totalInventory} to ${targetQuantity} (availability: ${availability})`);
                    return { synced: true };
                } else {
                    return { synced: false, error: 'No locations found for inventory update' };
                }
            } else {
                logger.info(`Inventory for product ${shopifyProduct.id} already matches availability status (${totalInventory} units, availability: ${availability})`);
                return { synced: false }; // 不需要更新
            }

        } catch (error) {
            logger.error(`Error syncing inventory for product ${shopifyProduct.id}:`, error);
            return { synced: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * 使用GraphQL创建产品（遵循Shopify最佳实践）
     */
    async createProductWithGraphQL(session: Session, unifiedProduct: UnifiedProduct, status: string = 'draft'): Promise<any> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            // 使用正确的ProductInput结构，符合最新的Shopify Admin API规范
            const mutation = `
                mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
                    productCreate(input: $input, media: $media) {
                        product {
                            id
                            title
                            handle
                            status
                            variants(first: 1) {
                                edges {
                                    node {
                                        id
                                        sku
                                        price
                                        compareAtPrice
                                        inventoryItem {
                                            id
                                        }
                                    }
                                }
                            }
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

            // 正确的ProductInput结构（不包含variants）
            const productInput = {
                title: unifiedProduct.title,
                descriptionHtml: unifiedProduct.description,
                vendor: unifiedProduct.brandName,
                productType: 'Affiliate Product',
                status: status.toUpperCase(),
                tags: ['affiliate', 'imported', unifiedProduct.sourceApi],
                handle: unifiedProduct.title
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
            };

            // 准备图片媒体（如果有）
            let mediaInput = undefined;
            if (unifiedProduct.imageUrl) {
                const encodedImageUrl = this.encodeImageUrl(unifiedProduct.imageUrl);
                mediaInput = [{
                    originalSource: encodedImageUrl,
                    alt: unifiedProduct.title,
                    mediaContentType: 'IMAGE'
                }];
            }

            const variables: any = { input: productInput };
            if (mediaInput) {
                variables.media = mediaInput;
            }

            const response = await client.request(mutation, { variables });

            // 标准化错误处理
            if (response.data?.productCreate?.userErrors?.length > 0) {
                const errors = response.data.productCreate.userErrors;
                logger.error('GraphQL product creation userErrors:', errors);
                throw new Error(`Product creation failed: ${errors.map((e: any) => `${e.field?.join('.')}: ${e.message}`).join(', ')}`);
            }

            const product = response.data?.productCreate?.product;
            if (!product) {
                throw new Error('Product creation failed: No product returned');
            }

            logger.info(`Product created successfully with GraphQL: ${product.id}`);

            const productIdNumeric = product.id.replace('gid://shopify/Product/', '');

            // 更新默认variant的价格和SKU（使用productVariantUpdate）
            if (product.variants?.edges?.[0]?.node?.id) {
                await this.updateDefaultVariantGraphQL(session, productIdNumeric, product.variants.edges[0].node.id, {
                    price: unifiedProduct.price.toString(),
                    compareAtPrice: unifiedProduct.salePrice ? unifiedProduct.salePrice.toString() : undefined,
                    sku: unifiedProduct.sku || `${unifiedProduct.sourceApi}-${unifiedProduct.sourceProductId}`,
                });
            }

            // 返回标准化的产品对象
            return {
                id: productIdNumeric,
                title: product.title,
                handle: product.handle,
                status: product.status,
                variants: product.variants?.edges?.[0]?.node ? [{
                    id: product.variants.edges[0].node.id,
                    sku: product.variants.edges[0].node.sku,
                    price: product.variants.edges[0].node.price,
                    inventory_item_id: product.variants.edges[0].node.inventoryItem?.id
                }] : []
            };

        } catch (error) {
            logger.error('Error creating product with GraphQL:', error);
            throw error;
        }
    }

    /**
     * 使用GraphQL更新默认变体
     */
    private async updateDefaultVariantGraphQL(session: Session, productId: string, variantId: string, variantData: any): Promise<boolean> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            // 使用productVariantUpdate单个变体更新而不是批量更新
            const mutation = `
                mutation productVariantUpdate($input: ProductVariantInput!) {
                    productVariantUpdate(input: $input) {
                        productVariant {
                            id
                            price
                            compareAtPrice
                            inventoryItem {
                                id
                            }
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

            // 构建正确的变体输入对象 - 移除sku字段，因为它不在ProductVariantInput类型中
            const variables = {
                input: {
                    id: variantId,
                    price: variantData.price,
                    compareAtPrice: variantData.compareAtPrice
                    // 移除sku字段，因为ProductVariantInput不支持
                }
            };

            const response = await client.request(mutation, { variables });

            if (response.data?.productVariantUpdate?.userErrors?.length > 0) {
                const errors = response.data.productVariantUpdate.userErrors;
                logger.warn(`Failed to update default variant for product ${productId}:`, errors);
                return false;
            }

            // 如果需要设置SKU，使用metafields进行存储
            if (variantData.sku) {
                try {
                    // 使用元字段存储SKU
                    await this.setVariantMetafield(
                        session,
                        variantId.replace('gid://shopify/ProductVariant/', ''),
                        'custom',
                        'sku',
                        variantData.sku,
                        'single_line_text_field'
                    );
                    logger.info(`Successfully added SKU as metafield for variant ${variantId}`);
                } catch (metafieldError) {
                    logger.warn(`Failed to add SKU as metafield: ${metafieldError}`);
                    // 继续执行，不因元字段错误而中断流程
                }
            }

            logger.info(`Successfully updated default variant for product ${productId}`);
            return true;

        } catch (error) {
            logger.error(`Error updating default variant for product ${productId}:`, error);
            return false;
        }
    }

    /**
     * 为变体设置元字段
     */
    private async setVariantMetafield(
        session: Session,
        variantId: string,
        namespace: string,
        key: string,
        value: any,
        valueType: string
    ): Promise<any> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            const mutation = `
                mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
                    metafieldsSet(metafields: $metafields) {
                        metafields {
                            id
                            namespace
                            key
                            value
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

            const variables = {
                metafields: [{
                    ownerId: `gid://shopify/ProductVariant/${variantId}`,
                    namespace,
                    key,
                    value: String(value),
                    type: valueType
                }]
            };

            const response = await client.request(mutation, { variables });

            if (response.data?.metafieldsSet?.userErrors?.length > 0) {
                const errors = response.data.metafieldsSet.userErrors;
                throw new Error(`Failed to set metafield: ${errors.map((e: any) => e.message).join(', ')}`);
            }

            return response.data?.metafieldsSet?.metafields?.[0];
        } catch (error) {
            logger.error(`Error setting variant metafield:`, error);
            throw error;
        }
    }

    /**
     * 使用GraphQL通过SKU查找产品（遵循最佳实践）
     */
    async getProductBySkuWithGraphQL(session: Session, sku: string): Promise<any> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            // 使用符合最佳实践的查询结构，包含变量和适当的字段选择
            const query = `
                query getProductBySku($query: String!) {
                    products(first: 1, query: $query) {
                        edges {
                            node {
                                id
                                title
                                handle
                                status
                                variants(first: 1) {
                                    edges {
                                        node {
                                            id
                                            sku
                                            price
                                            compareAtPrice
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const response = await client.request(query, {
                variables: {
                    query: `sku:${sku}`
                }
            });

            const products = response.data?.products?.edges;
            if (!products || products.length === 0) {
                return null;
            }

            const product = products[0].node;
            return {
                id: product.id.replace('gid://shopify/Product/', ''),
                title: product.title,
                handle: product.handle,
                status: product.status
            };

        } catch (error) {
            logger.error('Error finding product by SKU with GraphQL:', error);
            throw error;
        }
    }

    /**
     * 使用GraphQL更新产品（遵循最佳实践）
     */
    async updateProductWithGraphQL(session: Session, productId: string, unifiedProduct: UnifiedProduct): Promise<any> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            // 首先获取当前产品信息
            const getProductQuery = `
                query getProduct($id: ID!) {
                    product(id: $id) {
                        id
                        title
                        descriptionHtml
                        vendor
                        images(first: 1) {
                            edges {
                                node {
                                    id
                                    url
                                }
                            }
                        }
                        variants(first: 1) {
                            edges {
                                node {
                                    id
                                    price
                                    compareAtPrice
                                    inventoryItem {
                                        id
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const currentProductResponse = await client.request(getProductQuery, {
                variables: { id: `gid://shopify/Product/${productId}` }
            });

            const currentProduct = currentProductResponse.data?.product;
            if (!currentProduct) {
                throw new Error(`Product with ID ${productId} not found`);
            }

            let changed = false;
            const updates: any[] = [];

            // 检查基本信息是否需要更新
            if (currentProduct.title !== unifiedProduct.title ||
                currentProduct.descriptionHtml !== unifiedProduct.description ||
                currentProduct.vendor !== unifiedProduct.brandName) {

                const productUpdateMutation = `
                    mutation productUpdate($input: ProductInput!) {
                        productUpdate(input: $input) {
                            product {
                                id
                                title
                                descriptionHtml
                                vendor
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `;

                const productInput = {
                    id: `gid://shopify/Product/${productId}`,
                    title: unifiedProduct.title,
                    descriptionHtml: unifiedProduct.description,
                    vendor: unifiedProduct.brandName
                };

                const updateResponse = await client.request(productUpdateMutation, {
                    variables: { input: productInput }
                });

                if (updateResponse.data?.productUpdate?.userErrors?.length > 0) {
                    const errors = updateResponse.data.productUpdate.userErrors;
                    logger.error('GraphQL product update userErrors:', errors);
                    throw new Error(`Product update failed: ${errors.map((e: any) => `${e.field?.join('.')}: ${e.message}`).join(', ')}`);
                }

                changed = true;
                logger.info(`Updated product basic info with GraphQL: ${productId}`);
            }

            // 更新变体价格
            if (currentProduct.variants?.edges?.[0]?.node) {
                const variant = currentProduct.variants.edges[0].node;
                const targetPrice = unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price
                    ? unifiedProduct.salePrice.toString()
                    : unifiedProduct.price.toString();

                const targetCompareAtPrice = unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price
                    ? unifiedProduct.price.toString()
                    : undefined;

                if (variant.price !== targetPrice || variant.compareAtPrice !== targetCompareAtPrice) {
                    const variantUpdateMutation = `
                        mutation productVariantUpdate($input: ProductVariantInput!) {
                            productVariantUpdate(input: $input) {
                                productVariant {
                                    id
                                    price
                                    compareAtPrice
                                }
                                userErrors {
                                    field
                                    message
                                }
                            }
                        }
                    `;

                    const variantInput: any = {
                        id: variant.id,
                        price: targetPrice
                    };

                    if (targetCompareAtPrice) {
                        variantInput.compareAtPrice = targetCompareAtPrice;
                    }

                    const variantResponse = await client.request(variantUpdateMutation, {
                        variables: { input: variantInput }
                    });

                    if (variantResponse.data?.productVariantUpdate?.userErrors?.length > 0) {
                        const errors = variantResponse.data.productVariantUpdate.userErrors;
                        logger.warn('GraphQL variant update userErrors:', errors);
                    } else {
                        changed = true;
                        logger.info(`Updated variant price with GraphQL: ${variant.id}`);
                    }
                }

                // 检查并更新库存
                if (variant.inventoryItem?.id) {
                    await this.checkAndUpdateInventoryGraphQL(session, variant, unifiedProduct.availability);
                }
            }

            // 处理图片更新
            if (unifiedProduct.imageUrl) {
                const currentImageUrl = currentProduct.images?.edges?.[0]?.node?.url;
                if (currentImageUrl !== unifiedProduct.imageUrl) {
                    logger.info(`Updating product image with GraphQL from '${currentImageUrl}' to '${unifiedProduct.imageUrl}'`);

                    // 验证新图片URL
                    if (this.isValidImageUrlFormat(unifiedProduct.imageUrl)) {
                        try {
                            const imageAccessible = await this.testImageAccess(unifiedProduct.imageUrl);

                            if (imageAccessible) {
                                const imageAdded = await this.addImageToProductWithGraphQL(
                                    session,
                                    productId,
                                    unifiedProduct.imageUrl,
                                    unifiedProduct.title
                                );

                                if (imageAdded) {
                                    changed = true;
                                    logger.info(`Image updated successfully with GraphQL: ${unifiedProduct.imageUrl}`);
                                } else {
                                    logger.warn(`Failed to update image with GraphQL: ${unifiedProduct.imageUrl}`);
                                }
                            } else {
                                logger.warn(`New image URL not accessible, keeping existing image: ${unifiedProduct.imageUrl}`);
                            }
                        } catch (imageError) {
                            logger.warn(`Error testing new image access, keeping existing image:`, imageError);
                        }
                    } else {
                        logger.warn(`Invalid new image URL format, keeping existing image: ${unifiedProduct.imageUrl}`);
                    }
                }
            }

            if (changed) {
                logger.info(`Product updated with GraphQL: ${productId}`);
            } else {
                logger.info(`No changes needed for product: ${productId}`);
            }

            return currentProduct;

        } catch (error) {
            logger.error('Error updating product with GraphQL:', error);
            throw error;
        }
    }

    /**
     * 使用GraphQL检查并更新库存
     */
    private async checkAndUpdateInventoryGraphQL(session: Session, variant: any, availability?: boolean): Promise<void> {
        try {
            if (!variant.inventoryItem?.id) {
                logger.warn(`Variant ${variant.id} has no inventory item, skipping inventory check`);
                return;
            }

            const client = new this.shopify.clients.Graphql({ session });
            const defaultInventoryQuantity = parseInt(process.env.SHOPIFY_DEFAULT_PRODUCT_INVENTORY || '99');

            logger.info(`Checking inventory with GraphQL for variant ${variant.id}, availability: ${availability}, default quantity: ${defaultInventoryQuantity}`);

            // 获取库存信息
            const inventoryQuery = `
                query getInventoryLevels($inventoryItemId: ID!) {
                    inventoryItem(id: $inventoryItemId) {
                        id
                        inventoryLevels(first: 10) {
                            edges {
                                node {
                                    id
                                    available
                                    location {
                                        id
                                        name
                                        fulfillmentService {
                                            serviceName
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const inventoryResponse = await client.request(inventoryQuery, {
                variables: { inventoryItemId: variant.inventoryItem.id }
            });

            const inventoryLevels = inventoryResponse.data?.inventoryItem?.inventoryLevels?.edges || [];
            let totalInventory = 0;

            for (const edge of inventoryLevels) {
                const level = edge.node;
                if (level.available !== null && level.available !== undefined) {
                    totalInventory += level.available;
                }
            }

            logger.info(`Current total inventory for variant ${variant.id}: ${totalInventory}, availability: ${availability}`);

            // 根据availability状态决定库存设置策略
            let needsUpdate = false;
            let targetQuantity = totalInventory;

            if (availability === false && totalInventory > 0) {
                targetQuantity = 0;
                needsUpdate = true;
                logger.info(`Product marked as out of stock, setting inventory to 0 (was ${totalInventory})`);
            } else if (availability === true && totalInventory === 0) {
                targetQuantity = defaultInventoryQuantity;
                needsUpdate = true;
                logger.info(`Product marked as in stock but has 0 inventory, setting to default quantity: ${defaultInventoryQuantity}`);
            } else if (availability === true && totalInventory < defaultInventoryQuantity) {
                targetQuantity = defaultInventoryQuantity;
                needsUpdate = true;
                logger.info(`Product has low inventory (${totalInventory}), updating to default quantity: ${defaultInventoryQuantity}`);
            }

            if (needsUpdate && inventoryLevels.length > 0) {
                // 找到最合适的位置进行库存调整
                let targetLocation = inventoryLevels.find((edge: any) => {
                    const location = edge.node.location;
                    return location.fulfillmentService?.serviceName !== 'Fulfillment Service';
                });

                if (!targetLocation) {
                    targetLocation = inventoryLevels[0];
                }

                const locationId = targetLocation.node.location.id;
                const inventoryLevelId = targetLocation.node.id;

                // 使用GraphQL调整库存
                const inventoryMutation = `
                    mutation inventoryAdjustQuantity($input: InventoryAdjustQuantityInput!) {
                        inventoryAdjustQuantity(input: $input) {
                            inventoryLevel {
                                id
                                available
                            }
                            userErrors {
                                field
                                message
                            }
                        }
                    }
                `;

                const currentAvailable = targetLocation.node.available || 0;
                const quantityDelta = targetQuantity - currentAvailable;

                if (quantityDelta !== 0) {
                    const adjustInput = {
                        inventoryLevelId: inventoryLevelId,
                        availableDelta: quantityDelta
                    };

                    const adjustResponse = await client.request(inventoryMutation, {
                        variables: { input: adjustInput }
                    });

                    if (adjustResponse.data?.inventoryAdjustQuantity?.userErrors?.length > 0) {
                        const errors = adjustResponse.data.inventoryAdjustQuantity.userErrors;
                        logger.warn('GraphQL inventory adjustment userErrors:', errors);
                    } else {
                        logger.info(`Successfully adjusted inventory with GraphQL for variant ${variant.id} by ${quantityDelta} (new total: ${targetQuantity})`);
                    }
                }
            } else if (!needsUpdate) {
                logger.info(`Inventory for variant ${variant.id} already matches availability status (${totalInventory} units, availability: ${availability})`);
            }

        } catch (error) {
            logger.error(`Error checking/updating inventory with GraphQL for variant ${variant.id}:`, error);
            // 不抛出错误，避免影响产品更新流程
        }
    }

    /**
     * 检测并修复图片格式不匹配问题
     */
    private async detectAndFixImageFormat(imageUrl: string): Promise<string> {
        try {
            logger.info(`Starting enhanced image format detection for: ${imageUrl}`);

            // 1. 优先检查是否为Demandware或其他已知问题服务
            if (this.isProblematicImageService(imageUrl)) {
                logger.info(`Problematic image service detected, using proxy immediately: ${imageUrl}`);
                return this.generateProxyUrl(imageUrl, true); // 强制修复
            }

            // 2. 检查是否为动态图片服务，优先处理
            if (this.isDynamicImageService(imageUrl)) {
                const optimizedUrl = this.optimizeImageUrlForShopify(imageUrl);
                logger.info(`Optimized dynamic image service URL: ${optimizedUrl}`);

                // 验证优化后的URL是否可访问
                const isAccessible = await this.validateImageUrl(optimizedUrl);
                if (isAccessible) {
                    return optimizedUrl;
                } else {
                    logger.warn(`Optimized URL not accessible, using proxy: ${optimizedUrl}`);
                    return this.generateProxyUrl(imageUrl, true);
                }
            }

            // 3. 尝试获取图片的实际格式
            const formatInfo = await this.analyzeImageFormat(imageUrl);

            if (formatInfo.success) {
                const { contentType, urlExtension, actualFormat } = formatInfo;

                // 4. 检查格式匹配性
                if (actualFormat && urlExtension) {
                    const isFormatMismatch = !this.isFormatCompatible(urlExtension, actualFormat);

                    if (isFormatMismatch) {
                        logger.warn(`Image format mismatch detected: URL extension=${urlExtension}, actual format=${actualFormat}`);

                        // 使用代理服务进行格式修复，而不是简单的URL修改
                        logger.info(`Using proxy service for format correction: ${imageUrl}`);
                        return this.generateProxyUrl(imageUrl, true);
                    }
                } else if (!actualFormat && contentType && !contentType.startsWith('image/')) {
                    // 如果Content-Type不是图片类型，使用代理服务
                    logger.warn(`Non-image content type detected: ${contentType}, using proxy for format fix`);
                    return this.generateProxyUrl(imageUrl, true);
                }
            } else {
                logger.warn(`Image format analysis failed for ${imageUrl}, using proxy service as fallback`);
                return this.generateProxyUrl(imageUrl, true);
            }

            // 5. 应用通用优化
            const generalOptimizedUrl = this.optimizeImageUrlForShopify(imageUrl);

            if (generalOptimizedUrl !== imageUrl) {
                logger.info(`Applied general optimization: ${generalOptimizedUrl}`);

                // 验证优化后的URL
                const isAccessible = await this.validateImageUrl(generalOptimizedUrl);
                if (isAccessible) {
                    return generalOptimizedUrl;
                } else {
                    logger.warn(`General optimization failed, using proxy: ${generalOptimizedUrl}`);
                    return this.generateProxyUrl(imageUrl, true);
                }
            }

            logger.info(`No optimization needed for: ${imageUrl}`);
            return imageUrl;

        } catch (error) {
            logger.error(`Error in enhanced image format detection for ${imageUrl}:`, error);

            // 6. 错误情况下使用代理服务作为保底
            logger.info(`Using proxy service as error fallback: ${imageUrl}`);
            return this.generateProxyUrl(imageUrl, true);
        }
    }

    /**
     * 检查是否为已知有问题的图片服务
     */
    private isProblematicImageService(url: string): boolean {
        const problematicServices = [
            'demandware.static',
            'lecreuset.com',
            'scene7.com',
            // 添加其他已知有格式问题的服务
        ];

        return problematicServices.some(service => url.includes(service));
    }

    /**
     * 生成图片代理URL
     */
    private generateProxyUrl(originalUrl: string, forceFix: boolean = false): string {
        const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
        const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(originalUrl)}&format=jpg`;

        if (forceFix) {
            return `${proxyUrl}&fix=true`;
        }

        return proxyUrl;
    }

    /**
     * 分析图片格式信息
     */
    private async analyzeImageFormat(imageUrl: string): Promise<{
        success: boolean;
        contentType?: string;
        urlExtension?: string;
        actualFormat?: string;
        contentLength?: string;
    }> {
        try {
            const response = await fetch(imageUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(8000),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                logger.warn(`Image HEAD request failed for ${imageUrl}: ${response.status} ${response.statusText}`);
                return { success: false };
            }

            const contentType = response.headers.get('content-type')?.toLowerCase() || '';
            const contentLength = response.headers.get('content-length');
            const urlExtension = this.getImageExtensionFromUrl(imageUrl);
            const actualFormat = this.getFormatFromContentType(contentType);

            logger.debug(`Image format analysis for ${imageUrl}:`, {
                contentType,
                contentLength,
                urlExtension,
                actualFormat
            });

            return {
                success: true,
                contentType,
                urlExtension: urlExtension || undefined,
                actualFormat: actualFormat || undefined,
                contentLength: contentLength || undefined
            };

        } catch (error) {
            logger.warn(`Error analyzing image format for ${imageUrl}:`, error);
            return { success: false };
        }
    }

    /**
     * 验证图片URL是否可访问
     */
    private async validateImageUrl(imageUrl: string, timeout: number = 5000): Promise<boolean> {
        try {
            const response = await fetch(imageUrl, {
                method: 'HEAD',
                signal: AbortSignal.timeout(timeout),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Shopify/1.0; +https://shopify.com/)',
                    'Accept': 'image/*,*/*;q=0.8'
                }
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type')?.toLowerCase() || '';
                return contentType.startsWith('image/') || contentType.includes('octet-stream') || contentType === '';
            }

            return false;
        } catch (error) {
            logger.debug(`Image URL validation failed for ${imageUrl}:`, error);
            return false;
        }
    }

    /**
     * 强制设置图片格式
     */
    private forceImageFormat(imageUrl: string, format: string): string {
        try {
            const urlObj = new URL(imageUrl);

            // 添加格式参数
            urlObj.searchParams.set('format', format);
            urlObj.searchParams.set('fmt', format);

            // 如果是支持的服务，添加质量参数
            if (this.isDynamicImageService(imageUrl)) {
                urlObj.searchParams.set('qlt', '85');
                if (format === 'jpg') {
                    urlObj.searchParams.set('wid', '800');
                }
            }

            return urlObj.toString();
        } catch (error) {
            logger.warn(`Error forcing image format for ${imageUrl}:`, error);
            return `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}format=${format}&fmt=${format}`;
        }
    }

    /**
     * 从URL获取图片扩展名
     */
    private getImageExtensionFromUrl(url: string): string | null {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.toLowerCase();
            const match = pathname.match(/\.([a-z0-9]+)(?:\?|$)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }

    /**
     * 从Content-Type获取图片格式
     */
    private getFormatFromContentType(contentType: string): string | null {
        const formatMap: { [key: string]: string } = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'image/bmp': 'bmp',
            'image/tiff': 'tiff'
        };

        for (const [type, format] of Object.entries(formatMap)) {
            if (contentType.includes(type)) {
                return format;
            }
        }

        return null;
    }

    /**
     * 检查格式是否兼容
     */
    private isFormatCompatible(urlExtension: string, actualFormat: string): boolean {
        // 标准化扩展名
        const normalizeExt = (ext: string) => ext.toLowerCase().replace('jpeg', 'jpg');

        return normalizeExt(urlExtension) === normalizeExt(actualFormat);
    }

    /**
     * 修复图片URL扩展名
     */
    private fixImageUrlExtension(originalUrl: string, correctFormat: string): string {
        try {
            const urlObj = new URL(originalUrl);

            // 替换路径中的扩展名
            urlObj.pathname = urlObj.pathname.replace(/\.[a-z0-9]+(\?|$)/, `.${correctFormat}$1`);

            // 如果没有扩展名，添加正确的扩展名
            if (!urlObj.pathname.match(/\.[a-z0-9]+$/)) {
                urlObj.pathname += `.${correctFormat}`;
            }

            return urlObj.toString();
        } catch {
            return originalUrl;
        }
    }

    /**
     * 检查是否为动态图片服务
     */
    private isDynamicImageService(url: string): boolean {
        const dynamicServices = [
            'demandware.static',
            'scene7.com',
            'akamaized.net',
            'cloudinary.com',
            'imagekit.io',
            'fastly.com'
        ];

        return dynamicServices.some(service => url.includes(service));
    }

    /**
     * 针对Shopify优化图片URL
     */
    private optimizeImageUrlForShopify(url: string): string {
        try {
            const urlObj = new URL(url);

            // 1. 添加或修改参数以确保格式兼容性
            if (url.includes('demandware.static')) {
                // Demandware/Salesforce Commerce Cloud优化
                urlObj.searchParams.set('fmt', 'jpg');
                urlObj.searchParams.set('qlt', '85'); // 质量设置
                urlObj.searchParams.set('wid', '800'); // 宽度限制
            }

            // 2. 移除可能导致问题的参数
            const problematicParams = ['cache', 'timestamp', 'v', 'version'];
            problematicParams.forEach(param => {
                urlObj.searchParams.delete(param);
            });

            // 3. 确保使用HTTPS
            urlObj.protocol = 'https:';

            // 4. 添加Shopify友好的参数
            urlObj.searchParams.set('format', 'jpg');

            return urlObj.toString();
        } catch {
            return url;
        }
    }

    /**
     * 生成高级备用图片URL列表
     */
    private generateAdvancedAlternativeImageUrls(originalUrl: string): string[] {
        const alternatives: string[] = [];

        try {
            // 1. 首先尝试格式检测和修复
            const detectedUrl = this.optimizeImageUrlForShopify(originalUrl);
            if (detectedUrl !== originalUrl) {
                alternatives.push(detectedUrl);
            }

            // 2. 尝试不同的图片格式
            const formats = ['jpg', 'jpeg', 'png', 'webp'];
            formats.forEach(format => {
                const formatUrl = this.fixImageUrlExtension(originalUrl, format);
                if (formatUrl !== originalUrl && !alternatives.includes(formatUrl)) {
                    alternatives.push(formatUrl);
                }
            });

            // 3. 添加格式参数的变体
            const urlObj = new URL(originalUrl);

            // JPG变体
            const jpgVariants = [
                this.addFormatParams(urlObj, { fmt: 'jpg', format: 'jpg' }),
                this.addFormatParams(urlObj, { f: 'jpg' }),
                this.addFormatParams(urlObj, { type: 'jpg' })
            ];

            jpgVariants.forEach(variant => {
                if (!alternatives.includes(variant)) {
                    alternatives.push(variant);
                }
            });

            // 4. 尝试移除所有查询参数（获取原始图片）
            const cleanUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
            if (!alternatives.includes(cleanUrl)) {
                alternatives.push(cleanUrl);
            }

            // 5. 使用图片代理服务作为最后备选
            const appUrl = process.env.SHOPIFY_APP_URL || process.env.APPLICATION_URL || 'https://shopifydev.amoze.cc';
            const proxyUrl = `${appUrl}/api/shopify/image-proxy?url=${encodeURIComponent(originalUrl)}&format=jpg`;
            alternatives.push(proxyUrl);

        } catch (error) {
            logger.debug(`Error generating advanced alternatives for ${originalUrl}:`, error);
        }

        // 去重并限制数量
        return [...new Set(alternatives)].slice(0, 8);
    }

    /**
     * 添加格式参数到URL
     */
    private addFormatParams(urlObj: URL, params: { [key: string]: string }): string {
        const newUrl = new URL(urlObj.toString());
        Object.entries(params).forEach(([key, value]) => {
            newUrl.searchParams.set(key, value);
        });
        return newUrl.toString();
    }

    /**
     * 使用新产品模型的productSet同步产品数据
     * 该方法利用Shopify 2024-07版本引入的新产品模型API来同步产品
     */
    async syncProductWithProductSet(session: Session, unifiedProduct: UnifiedProduct, status: string = 'draft'): Promise<any> {
        try {
            const client = new this.shopify.clients.Graphql({ session });

            // 检查产品是否已存在
            let existingProductId = unifiedProduct.shopifyProductId;
            let existingProduct = null;

            if (existingProductId) {
                // 获取现有产品信息，包括选项和变体
                const getProductQuery = `
                    query getProduct($id: ID!) {
                        product(id: $id) {
                            id
                            title
                            descriptionHtml
                            vendor
                            options {
                                id
                                name
                                position
                                values
                            }
                            variants(first: 1) {
                                edges {
                                    node {
                                        id
                                        inventoryItem {
                                            id
                                        }
                                    }
                                }
                            }
                        }
                    }
                `;

                const currentProductResponse = await client.request(getProductQuery, {
                    variables: { id: `gid://shopify/Product/${existingProductId}` }
                });

                existingProduct = currentProductResponse.data?.product;

                if (!existingProduct) {
                    logger.warn(`Product with ID ${existingProductId} not found, will create a new one`);
                    existingProductId = undefined; // 修改：使用undefined而不是null
                }
            }

            // 构建productSet变量
            const productSetInput: any = {
                product: {
                    title: unifiedProduct.title,
                    descriptionHtml: unifiedProduct.description || '',
                    vendor: unifiedProduct.brandName || '',
                    status: status,
                    productType: unifiedProduct.categories?.[0] || '',
                    productOptions: [
                        {
                            name: "Title",
                            values: ["Default Title"]
                        }
                    ]
                },
                variants: [
                    {
                        price: unifiedProduct.price.toString(),
                        compareAtPrice: unifiedProduct.salePrice && unifiedProduct.salePrice < unifiedProduct.price ?
                            unifiedProduct.price.toString() : null,
                        optionValues: [
                            {
                                option: {
                                    name: "Title"
                                },
                                value: "Default Title"
                            }
                        ],
                        // 使用metafields代替SKU
                        metafields: [
                            {
                                namespace: "custom",
                                key: "sku",
                                value: unifiedProduct.sku || `${unifiedProduct.sourceApi}-${unifiedProduct.sourceProductId}`,
                                type: "single_line_text_field"
                            }
                        ]
                    }
                ]
            };

            // 如果是更新已有产品，添加产品ID
            if (existingProductId) {
                productSetInput.product.id = `gid://shopify/Product/${existingProductId}`;
            }

            // 使用productSet mutation进行同步
            const productSetMutation = `
                mutation productSet($input: ProductSetInput!) {
                    productSet(input: $input) {
                        product {
                            id
                            title
                            handle
                            status
                            variants(first: 1) {
                                edges {
                                    node {
                                        id
                                        price
                                        compareAtPrice
                                        inventoryItem {
                                            id
                                        }
                                    }
                                }
                            }
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;

            const response = await client.request(productSetMutation, {
                variables: { input: productSetInput }
            });

            if (response.data?.productSet?.userErrors?.length > 0) {
                const errors = response.data.productSet.userErrors;
                logger.error('Product sync failed with errors:', errors);
                throw new Error(`Failed to sync product: ${errors.map((e: { message: string }) => e.message).join(', ')}`); // 修改：添加类型注解
            }

            const product = response.data?.productSet?.product;
            if (!product) {
                throw new Error('No product data returned from sync operation');
            }

            const productIdNumeric = product.id.replace('gid://shopify/Product/', '');

            // 处理库存
            if (product.variants?.edges?.[0]?.node?.inventoryItem?.id) {
                const variant = product.variants.edges[0].node;
                await this.checkAndUpdateInventoryGraphQL(session, variant, unifiedProduct.availability);
            }

            logger.info(`Product synced successfully with ProductSet: ${productIdNumeric}`);

            // 返回标准化的产品对象
            return {
                id: productIdNumeric,
                title: product.title,
                handle: product.handle,
                status: product.status,
                variants: product.variants?.edges?.[0]?.node ? [{
                    id: product.variants.edges[0].node.id.replace('gid://shopify/ProductVariant/', ''),
                    price: product.variants.edges[0].node.price,
                    compare_at_price: product.variants.edges[0].node.compareAtPrice,
                    inventory_item_id: product.variants.edges[0].node.inventoryItem?.id?.replace('gid://shopify/InventoryItem/', '')
                }] : []
            };

        } catch (error) {
            logger.error('Error syncing product with ProductSet:', error);
            throw error;
        }
    }
} 