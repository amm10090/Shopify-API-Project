import axios, { AxiosResponse } from 'axios';
import { logger } from '@server/utils/logger';
import { UnifiedProduct, CJProduct, PepperjamProduct, CJFetchParams, PepperjamFetchParams } from '@shared/types/index';
import { cjApiLimitChecker, pepperjamApiLimitChecker } from '@server/config/apiLimits';
import { CJ_API_LIMITS } from '@server/config/apiLimits';
import { buildCJAffiliateUrl, validateCJEnvironment } from '@server/config/cjAffiliate';

export class ProductRetriever {
    private skipImageValidation: boolean;
    private strictImageValidation: boolean;
    private maxRawProductsToScan = 1000;

    constructor(skipImageValidation: boolean = false, strictImageValidation: boolean = true) {
        this.skipImageValidation = skipImageValidation;
        this.strictImageValidation = strictImageValidation;
        logger.info(`ProductRetriever initialized: skipImageValidation=${skipImageValidation}, strictImageValidation=${strictImageValidation}`);

        // 检查环境变量配置
        this.checkEnvironmentVariables();
        
        // 验证CJ联盟配置
        this.validateCJConfiguration();
    }

    /**
     * 验证CJ联盟配置
     */
    private validateCJConfiguration(): void {
        const validation = validateCJEnvironment();
        
        if (!validation.valid) {
            logger.error('CJ联盟配置验证失败:');
            validation.errors.forEach(error => logger.error(`  - ${error}`));
        }
        
        if (validation.warnings.length > 0) {
            logger.warn('CJ联盟配置警告:');
            validation.warnings.forEach(warning => logger.warn(`  - ${warning}`));
        }
        
        if (validation.valid) {
            logger.info('CJ联盟配置验证通过');
        }
    }

    /**
     * 检查必要的环境变量是否配置
     */
    private checkEnvironmentVariables(): void {
        const cjConfigured = !!(process.env.CJ_API_TOKEN && process.env.CJ_CID && process.env.CJ_PID);
        const pepperjamConfigured = !!(process.env.ASCEND_API_KEY || process.env.PEPPERJAM_API_KEY);

        logger.info(`API Configuration Status:`);
        logger.info(`- CJ API: ${cjConfigured ? 'Configured' : 'Missing credentials'}`);
        logger.info(`- Pepperjam API: ${pepperjamConfigured ? 'Configured' : 'Missing credentials'}`);

        if (!cjConfigured) {
            const missing = [];
            if (!process.env.CJ_API_TOKEN) missing.push('CJ_API_TOKEN');
            if (!process.env.CJ_CID) missing.push('CJ_CID');
            if (!process.env.CJ_PID) missing.push('CJ_PID');
            logger.warn(`CJ API not properly configured. Missing: ${missing.join(', ')}`);
        }

        if (!pepperjamConfigured) {
            logger.warn(`Pepperjam API not properly configured. Missing: ASCEND_API_KEY/PEPPERJAM_API_KEY`);
        }
    }

    /**
     * 验证图片URL是否有效（严格验证版本）
     */
    private async isValidImageUrl(
        url: string,
        timeout: number = 10000,
        maxRetries: number = 2
    ): Promise<boolean> {
        if (this.skipImageValidation) {
            return true;
        }

        if (!url || !url.match(/^https?:\/\//)) {
            logger.warn(`Invalid image URL format: ${url}`);
            return false;
        }

        // 如果不是严格验证模式，使用更宽松的检查
        if (!this.strictImageValidation) {
            const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?.*)?$/i;
            const trustedDomains = [
                'amazonaws.com',
                'cloudinary.com',
                'imagekit.io',
                'unsplash.com',
                'pexels.com',
                'shopifycdn.com',
                'shopify.com'
            ];

            const hasTrustedDomain = trustedDomains.some(domain => url.includes(domain));
            const hasImageExtension = imageExtensions.test(url);

            if (hasTrustedDomain || hasImageExtension) {
                logger.debug(`Non-strict mode: Accepting image URL: ${url.substring(0, 100)}...`);
                return true;
            }
        }

        // 严格验证模式：进行实际的HTTP请求验证
        // 多种User-Agent来尝试，某些CDN可能会阻止特定的User-Agent
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (compatible; Shopify/1.0; +https://shopify.com/)',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        // 对每种User-Agent进行重试
        for (const userAgent of userAgents) {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    logger.debug(`Validating image URL (attempt ${attempt + 1}/${maxRetries + 1}): ${url.substring(0, 100)}...`);
                    
                    const response = await axios.head(url, {
                        timeout,
                        headers: {
                            'User-Agent': userAgent,
                            'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        },
                        validateStatus: function (status) {
                            // 只接受 2xx 状态码
                            return status >= 200 && status < 300;
                        }
                    });

                    // 检查响应状态
                    if (response.status >= 200 && response.status < 300) {
                        const contentType = response.headers['content-type']?.toLowerCase() || '';
                        const contentLength = parseInt(response.headers['content-length'] || '0');

                        // 严格的内容类型检查
                        const isValidContentType = (
                            contentType.startsWith('image/') ||
                            contentType.includes('octet-stream') ||
                            contentType === '' // 某些CDN不返回Content-Type
                        );

                        // 检查文件大小 - 过小的文件可能是错误页面
                        const isValidSize = contentLength === 0 || contentLength >= 100; // 允许未知大小或合理大小

                        if (isValidContentType && isValidSize) {
                            logger.debug(`Image URL validation successful: ${url.substring(0, 100)}... (${contentType}, ${contentLength} bytes)`);
                            return true;
                        } else {
                            logger.warn(`Image URL validation failed - invalid content: ${url.substring(0, 100)}... (${contentType}, ${contentLength} bytes)`);
                            // 继续尝试下一个User-Agent或重试
                            continue;
                        }
                    }

                } catch (error: any) {
                    if (attempt < maxRetries) {
                        logger.debug(`Image validation attempt ${attempt + 1} failed, retrying: ${error.message}`);
                        // 添加延迟后重试
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                        continue;
                    }
                    
                    // 记录具体的错误类型
                    if (error.response) {
                        const status = error.response.status;
                        logger.warn(`Image URL returned HTTP ${status}: ${url.substring(0, 100)}...`);
                        
                        // 对于明确的错误状态，直接返回false
                        if (status === 404 || status === 403 || status === 410 || status >= 500) {
                            return false;
                        }
                    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                        logger.warn(`Image URL domain not found or connection refused: ${url.substring(0, 100)}...`);
                        return false;
                    } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                        logger.warn(`Image URL request timeout: ${url.substring(0, 100)}...`);
                        // 超时可能是临时问题，继续尝试下一个User-Agent
                        continue;
                    }
                    
                    logger.debug(`Image validation error: ${error.message}`);
                }
            }
        }

        // 如果所有尝试都失败了，进行最后的格式检查
        // 对于某些已知可靠的域名和格式，给予更多信任
        const trustedDomains = [
            'amazonaws.com',
            'cloudinary.com', 
            'imagekit.io',
            'unsplash.com',
            'pexels.com'
        ];

        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?.*)?$/i;
        const hasTrustedDomain = trustedDomains.some(domain => url.includes(domain));
        const hasImageExtension = imageExtensions.test(url);

        if (hasTrustedDomain && hasImageExtension) {
            logger.debug(`Image URL has trusted domain and valid extension, considering valid: ${url.substring(0, 100)}...`);
            return true;
        }

        // 对于shopify CDN，由于可能存在缓存和权限问题，需要特殊处理
        if (url.includes('shopifycdn.com') || url.includes('shopify.com')) {
            logger.warn(`Shopify CDN image failed validation, but may be accessible to Shopify: ${url.substring(0, 100)}...`);
            // 对于shopify CDN，我们更宽松一些，但仍然要求有图片扩展名
            if (hasImageExtension) {
                return true;
            }
        }

        logger.warn(`Image URL validation failed after all attempts: ${url.substring(0, 100)}...`);
        return false;
    }

    /**
     * 构建CJ联盟URL - 使用adId的dpbolvw格式
     */
    private async buildCJAffiliateUrl(
        originalLink: string,
        adId: string,
        productId: string,
        productSku?: string
    ): Promise<string> {
        try {
            // 检查是否有adId
            if (!adId) {
                logger.warn(`Product ${productId} missing adId, using original link`);
                return originalLink;
            }

            // 使用简化的dpbolvw格式，以adId为第一个参数
            const productIdentifier = productSku || productId;
            
            const affiliateUrl = await buildCJAffiliateUrl(
                originalLink,
                adId,
                productIdentifier
            );
            
            // 验证生成的URL是否为有效的CJ联盟URL
            if (affiliateUrl && affiliateUrl !== originalLink && affiliateUrl.includes('dpbolvw.net')) {
                logger.debug(`Successfully created CJ affiliate URL for product ${productIdentifier} with adId ${adId}`);
                return affiliateUrl;
            } else {
                logger.warn(`Failed to create valid CJ affiliate URL for product ${productIdentifier}, using original link`);
                return originalLink;
            }
            
        } catch (error) {
            logger.error(`Error constructing CJ affiliate URL for product ${productId}: ${error}. Using original link.`);
            return originalLink;
        }
    }

    /**
     * 将CJ产品转换为UnifiedProduct
     */
    private async cjProductToUnified(
        cjProduct: any,
        brandName: string,
        sourceApiName: string
    ): Promise<UnifiedProduct | null> {
        const cjAdvertiserId = String(cjProduct.advertiserId || '');
        const cjAdvertiserName = cjProduct.advertiserName || 'Unknown Advertiser';
        const cjProductId = cjProduct.id || 'Unknown ID';
        const productName = cjProduct.name || `Product ID ${cjProductId}`;

        const cjLink = cjProduct.link || '';

        // 使用新的联盟URL构建方法，传入adId而不是advertiserId
        const affiliateUrl = await this.buildCJAffiliateUrl(
            cjLink,
            cjProduct.adId, // 使用产品的adId
            cjProductId,
            cjProduct.sku // 如果API提供SKU则使用，否则使用产品ID
        );

        // 记录联盟URL构建结果
        if (affiliateUrl !== cjLink) {
            logger.info(`[CJ Product Processing] Constructed affiliate link for "${productName}" (ID: ${cjProductId}, Advertiser: ${cjAdvertiserName})`);
        } else {
            logger.warn(`[CJ Product Processing] Failed to construct affiliate link for "${productName}", using original link`);
        }

        if (!cjProduct) {
            return null;
        }

        // 验证必需字段
        const requiredFields = ['link', 'imageLink', 'title'];
        for (const field of requiredFields) {
            if (!cjProduct[field]) {
                logger.warn(`CJ product missing required field '${field}' (ID: ${cjProduct.id || 'N/A'})`);
                return null;
            }
        }

        // 验证价格
        const priceInfo = cjProduct.price || {};
        if (priceInfo.amount === "0.00") {
            logger.warn(`CJ product has price '0.00' (ID: ${cjProduct.id || 'N/A'})`);
            return null;
        }

        // 验证图片链接
        if (!this.skipImageValidation && !(await this.isValidImageUrl(cjProduct.imageLink))) {
            logger.warn(`CJ product has invalid image link (ID: ${cjProduct.id || 'N/A'})`);
            return null;
        }

        // 验证必需的ID字段
        if (!cjProduct.advertiserId || !cjProduct.id) {
            logger.warn(`CJ product missing advertiserId or id`);
            return null;
        }

        // 获取分类
        const categories: string[] = [];
        if (cjProduct.productType && Array.isArray(cjProduct.productType)) {
            categories.push(...cjProduct.productType);
        }
        if (cjProduct.googleProductCategory?.name) {
            categories.push(cjProduct.googleProductCategory.name);
        }

        // 生成SKU
        const brandSlug = brandName.toUpperCase().replace(/\s/g, '_').replace(/\./g, '');
        const sku = `${brandSlug}-CJ-${cjProduct.id}`;

        return {
            id: `cj-${cjProduct.id}`,
            sourceApi: 'cj',
            sourceProductId: String(cjProduct.id),
            brandName: cjProduct.advertiserName || brandName,
            title: cjProduct.title || 'N/A',
            description: cjProduct.description || '',
            price: parseFloat(priceInfo.amount),
            currency: priceInfo.currency || 'USD',
            affiliateUrl: affiliateUrl,
            imageUrl: cjProduct.imageLink,
            availability: (cjProduct.availability || 'in stock').toLowerCase() === 'in stock',
            salePrice: undefined,
            categories,
            importStatus: 'pending',
            lastUpdated: new Date(),
            keywordsMatched: [],
            sku,
            adId: cjProduct.adId // 添加广告ID
        };
    }

    /**
     * 从CJ API获取产品
     */
    async fetchCJProducts(params: CJFetchParams): Promise<UnifiedProduct[]> {
        const { advertiserId, keywords = [], limit = 70, offset = 0, maxPages = 10 } = params;

        logger.info(`Fetching CJ products for advertiser ${advertiserId}, keywords: [${keywords.join(', ')}], limit: ${limit}, offset: ${offset}`);

        const unifiedProducts: UnifiedProduct[] = [];

        try {
            // 使用正确的CJ GraphQL API端点
            const apiUrl = 'https://ads.api.cj.com/query';

            // 获取Company ID，使用CJ_CID
            const companyId = process.env.CJ_CID;
            if (!companyId) {
                throw new Error('CJ_CID (Company ID) not configured. Please set CJ_CID environment variable.');
            }
            logger.debug(`Using CJ Company ID: ${companyId}`);

            // 使用API限制检查器计算分页策略
            const totalToFetch = Math.max(limit * 3, this.maxRawProductsToScan); // 获取更多原始数据以便过滤
            const paginationPlan = cjApiLimitChecker.calculatePagination(totalToFetch, offset);

            logger.debug(`CJ API pagination plan: ${paginationPlan.totalPages} pages, estimated total: ${paginationPlan.estimatedTotal}`);

            let allProducts: any[] = [];
            let pageCount = 0;

            // 分页获取数据
            for (const page of paginationPlan.pages) {
                if (pageCount >= maxPages) {
                    logger.info(`Reached maximum pages limit (${maxPages}), stopping pagination`);
                    break;
                }

                // 验证请求参数
                const validation = cjApiLimitChecker.validateRequest(page.limit, page.offset);
                if (!validation.valid) {
                    logger.warn(`Invalid request parameters: ${validation.message}`);
                    break;
                }

                if (validation.message) {
                    logger.info(`API limit adjustment: ${validation.message}`);
                }

                const currentLimit = validation.adjustedLimit;

                // 构建关键词搜索查询 - CJ API不支持直接搜索，我们获取更多数据然后过滤
                if (params.keywords && params.keywords.length > 0) {
                    logger.info(`Will filter CJ API results for keywords: ${params.keywords.join(', ')}`);
                }

                // 获取更多数据以便更好地匹配
                const adjustedLimit = Math.min(params.limit ? params.limit * 5 : 250, 500);

                // 使用与fetchCJProducts相同的GraphQL查询结构（移除不支持的字段）
                const query = `
                    {
                        products(
                            companyId: "${companyId}", 
                            partnerIds: ["${params.advertiserId}"], 
                            limit: ${adjustedLimit}
                        ) {
                            totalCount
                            count
                            resultList {
                                advertiserId
                                advertiserName
                                id
                                title
                                description
                                price {
                                    amount
                                    currency
                                }
                                imageLink
                                link
                                brand
                                lastUpdated
                                adId
                                ... on Shopping {
                                    availability
                                    productType
                                    googleProductCategory {
                                        id
                                        name
                                    }
                                }
                            }
                        }
                    }
                `;

                logger.debug(`CJ API request page ${pageCount + 1}: offset=${page.offset}, limit=${currentLimit}`);
                logger.debug(`CJ API query:`, query);

                const response = await axios.post(apiUrl,
                    { query },
                    {
                        headers: {
                            'Authorization': `Bearer ${process.env.CJ_API_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: cjApiLimitChecker.getTimeout()
                    }
                );

                logger.debug(`CJ API response status: ${response.status}`);

                if (response.data?.errors) {
                    logger.error(`CJ API returned errors:`, response.data.errors);
                    break;
                }

                const products = response.data?.data?.products?.resultList || [];
                const totalCount = response.data?.data?.products?.totalCount || 0;
                const returnedCount = response.data?.data?.products?.count || 0;

                logger.debug(`CJ API page response: returned ${products.length} products, total available: ${totalCount}`);

                if (products.length === 0) {
                    logger.info(`No more products available from CJ API`);
                    break;
                }

                // 添加到总结果中
                allProducts.push(...products);
                pageCount++;

                // 检查是否还有更多数据
                if (products.length < currentLimit) {
                    logger.info(`Received fewer products than requested, likely reached end of data`);
                    break;
                }

                // 添加延迟以避免API限制
                if (pageCount < paginationPlan.totalPages && pageCount < maxPages) {
                    await new Promise(resolve => setTimeout(resolve, cjApiLimitChecker.getRequestDelay()));
                }
            }

            logger.info(`CJ API total fetched: ${allProducts.length} products from ${pageCount} pages`);

            // 处理和过滤产品
            if (allProducts.length > 0) {
                let count = 0;
                let skippedKeywordMismatch = 0;
                let skippedNoData = 0;
                let skippedInvalidImage = 0;
                let skippedOtherReasons = 0;

                for (const cjProduct of allProducts) {
                    if (count >= limit) break;

                    // 关键词过滤（OR逻辑）
                    if (keywords.length > 0) {
                        const title = (cjProduct.title || '').toLowerCase();
                        const description = (cjProduct.description || '').toLowerCase();

                        const matchedKeywords: string[] = [];
                        let anyPhraseMatched = false;

                        for (const phrase of keywords) {
                            const phraseLower = phrase.toLowerCase();
                            if (title.includes(phraseLower) || description.includes(phraseLower)) {
                                anyPhraseMatched = true;
                                matchedKeywords.push(phrase);
                            }
                        }

                        if (!anyPhraseMatched) {
                            skippedKeywordMismatch++;
                            continue;
                        }
                    }

                    const unifiedProduct = await this.cjProductToUnified(cjProduct, params.advertiserId, 'cj');
                    if (unifiedProduct) {
                        if (keywords.length > 0) {
                            // 重新计算匹配的关键词
                            const title = (cjProduct.title || '').toLowerCase();
                            const description = (cjProduct.description || '').toLowerCase();
                            const matchedKeywords: string[] = [];

                            for (const phrase of keywords) {
                                const phraseLower = phrase.toLowerCase();
                                if (title.includes(phraseLower) || description.includes(phraseLower)) {
                                    matchedKeywords.push(phrase);
                                }
                            }
                            unifiedProduct.keywordsMatched = matchedKeywords;
                        }

                        unifiedProducts.push(unifiedProduct);
                        count++;
                    } else {
                        if (!cjProduct.link || !cjProduct.title || !cjProduct.imageLink) {
                            skippedNoData++;
                        } else if (cjProduct.imageLink && !(await this.isValidImageUrl(cjProduct.imageLink))) {
                            skippedInvalidImage++;
                        } else {
                            skippedOtherReasons++;
                        }
                    }
                }

                logger.info(`CJ product processing stats - API fetched: ${allProducts.length}, converted: ${unifiedProducts.length}, ` +
                    `skipped (keyword mismatch): ${skippedKeywordMismatch}, ` +
                    `skipped (missing data): ${skippedNoData}, ` +
                    `skipped (invalid image): ${skippedInvalidImage}, ` +
                    `skipped (other): ${skippedOtherReasons}`);
            } else {
                logger.warn(`No products returned from CJ API for advertiser ${advertiserId}`);
            }
        } catch (error: any) {
            logger.error(`Error fetching CJ products for advertiser ${advertiserId}:`, error);

            // 如果是API限制错误，提供更详细的信息
            if (error.response?.status === 429) {
                logger.error(`CJ API rate limit exceeded. Please wait before making more requests.`);
            } else if (error.response?.status === 400) {
                logger.error(`CJ API bad request. Check query parameters and limits.`);
            }
        }

        logger.info(`Fetched and converted ${unifiedProducts.length} products from CJ`);
        return unifiedProducts;
    }

    /**
     * 获取CJ API原始产品数据（不进行转换）
     */
    async fetchCJProductsRaw(params: CJFetchParams): Promise<any[]> {
        this.checkEnvironmentVariables();

        const apiToken = process.env.CJ_API_TOKEN;
        if (!apiToken) {
            throw new Error('CJ_API_TOKEN not found in environment variables');
        }

        // 获取Company ID，使用CJ_CID
        const companyId = process.env.CJ_CID;
        if (!companyId) {
            throw new Error('CJ_CID (Company ID) not configured. Please set CJ_CID environment variable.');
        }
        logger.debug(`Using CJ Company ID: ${companyId}`);

        // 获取更多数据以便更好地匹配
        const limit = Math.min(params.limit ? params.limit * 3 : 150, 300);

        logger.info(`Fetching CJ raw products for advertiser ${params.advertiserId}, limit: ${limit}${params.keywords ? `, keywords: ${params.keywords.join(', ')}` : ''}`);

        // 简化的GraphQL查询，移除不支持的字段
        const query = `
            {
                products(
                    companyId: "${companyId}", 
                    partnerIds: ["${params.advertiserId}"], 
                    limit: ${limit}
                ) {
                    totalCount
                    count
                    resultList {
                        advertiserId
                        advertiserName
                        id
                        title
                        description
                        price {
                            amount
                            currency
                        }
                        imageLink
                        link
                        brand
                        lastUpdated
                        adId
                        ... on Shopping {
                            availability
                            productType
                            googleProductCategory {
                                id
                                name
                            }
                        }
                    }
                }
            }
        `;

        try {
            const response = await axios.post(
                'https://ads.api.cj.com/query',
                { query },
                {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data.errors) {
                logger.error('CJ API errors:', response.data.errors);
                throw new Error(`CJ API error: ${response.data.errors[0]?.message || 'Unknown error'}`);
            }

            const products = response.data.data?.products?.resultList || [];

            // 如果有关键词，在客户端进行过滤
            let filteredProducts = products;
            if (params.keywords && params.keywords.length > 0) {
                filteredProducts = products.filter((product: any) => {
                    const title = (product.title || '').toLowerCase();
                    const description = (product.description || '').toLowerCase();
                    const brand = (product.brand || '').toLowerCase();

                    return params.keywords!.some(keyword => {
                        const keywordLower = keyword.toLowerCase();
                        return title.includes(keywordLower) ||
                            description.includes(keywordLower) ||
                            brand.includes(keywordLower);
                    });
                });

                logger.info(`CJ API returned ${products.length} total products, filtered to ${filteredProducts.length} matching keywords`);
            } else {
                logger.info(`CJ API returned ${products.length} raw products for advertiser ${params.advertiserId}`);
            }

            return filteredProducts;

        } catch (error) {
            logger.error('Error fetching CJ products raw data:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`CJ API request failed: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }

    /**
     * 将Pepperjam产品转换为UnifiedProduct
     */
    private async pepperjamProductToUnified(
        pjProduct: any,
        brandName: string,
        programId: string
    ): Promise<UnifiedProduct | null> {
        try {
            const priceStr = pjProduct.price;
            const salePriceStr = pjProduct.price_sale;

            let priceAmount: number;
            if (priceStr) {
                try {
                    priceAmount = parseFloat(priceStr);
                } catch (error) {
                    logger.warn(`Invalid Pepperjam product price: ${priceStr} (Name: ${pjProduct.name})`);
                    return null;
                }
            } else {
                logger.warn(`Pepperjam product missing price (Name: ${pjProduct.name})`);
                return null;
            }

            let salePriceAmount: number | undefined;
            if (salePriceStr) {
                try {
                    salePriceAmount = parseFloat(salePriceStr);
                } catch (error) {
                    logger.warn(`Invalid Pepperjam product sale price: ${salePriceStr} (Name: ${pjProduct.name})`);
                }
            }

            const buyUrl = pjProduct.buy_url;
            if (!buyUrl) {
                logger.warn(`Pepperjam product missing buy_url (Name: ${pjProduct.name})`);
                return null;
            }

            if (!pjProduct.image_url) {
                logger.warn(`Pepperjam product missing image_url (Name: ${pjProduct.name})`);
                return null;
            }

            // 验证图片链接
            if (!this.skipImageValidation && !(await this.isValidImageUrl(pjProduct.image_url))) {
                logger.warn(`Pepperjam product has invalid image link (ID: ${pjProduct.id || 'N/A'})`);
                return null;
            }

            const availabilityStr = pjProduct.stock_availability || 'in stock';
            const isAvailable = availabilityStr.toLowerCase().includes('in stock') ||
                availabilityStr.toLowerCase().includes('available');

            // 生成SKU
            const brandSlug = brandName.toUpperCase().replace(/\s/g, '_').replace(/\./g, '');
            const sku = `${brandSlug}-PEPPERJAM-${pjProduct.id || pjProduct.name}`;

            return {
                id: `pepperjam-${pjProduct.id || pjProduct.name}`,
                sourceApi: 'pepperjam',
                sourceProductId: String(pjProduct.id || pjProduct.name),
                brandName: pjProduct.program_name || brandName,
                title: pjProduct.name || 'N/A',
                description: pjProduct.description_long || pjProduct.description_short || '',
                price: priceAmount,
                currency: pjProduct.currency_symbol || 'USD',
                affiliateUrl: buyUrl,
                imageUrl: pjProduct.image_url,
                availability: isAvailable,
                salePrice: salePriceAmount,
                categories: (pjProduct.categories || []).map((cat: any) => cat.name).filter(Boolean),
                importStatus: 'pending',
                lastUpdated: new Date(),
                keywordsMatched: [],
                sku
            };
        } catch (error) {
            logger.error(`Error converting Pepperjam product (Name: ${pjProduct.name}):`, error);
            return null;
        }
    }

    /**
     * 从Pepperjam API获取产品
     */
    async fetchPepperjamProducts(params: PepperjamFetchParams): Promise<UnifiedProduct[]> {
        const { programId, keywords = [], limit = 75 } = params;

        logger.info(`Fetching Pepperjam products for program ${programId}, keywords: [${keywords.join(', ')}], limit: ${limit}`);

        const unifiedProducts: UnifiedProduct[] = [];
        const seenProductIds = new Set<string>();

        // API调用关键词列表
        const apiCallKeywords: (string | null)[] = keywords.length > 0 ? keywords : [null];

        for (const keyword of apiCallKeywords) {
            try {
                const apiUrl = 'https://api.pepperjamnetwork.com/20120402/publisher/creative/product';
                const params: any = {
                    apiKey: process.env.ASCEND_API_KEY || process.env.PEPPERJAM_API_KEY,
                    format: 'json',
                    programIds: programId,
                    page: 1,
                    limit: 50
                };

                if (keyword) {
                    params.keywords = keyword;
                }

                logger.debug(`Pepperjam API call: ${apiUrl} with params:`, params);

                const response = await axios.get(apiUrl, {
                    params,
                    timeout: 30000
                });

                logger.debug(`Pepperjam API response status: ${response.status}`);
                logger.debug(`Pepperjam API response structure:`, {
                    hasData: !!response.data,
                    hasMeta: !!response.data?.meta,
                    hasStatus: !!response.data?.meta?.status,
                    statusCode: response.data?.meta?.status?.code,
                    hasDataArray: !!response.data?.data,
                    dataLength: response.data?.data?.length || 0
                });

                if (response.data?.meta?.status?.code === 200 && response.data.data) {
                    logger.debug(`Pepperjam API call successful (keyword: '${keyword || 'none'}'), returned ${response.data.data.length} products`);

                    for (const pjProduct of response.data.data) {
                        const identifier = pjProduct.id || pjProduct.name;
                        if (identifier && !seenProductIds.has(identifier)) {
                            if (keyword) {
                                pjProduct._fetched_by_keyword = keyword;
                            }

                            const unifiedProduct = await this.pepperjamProductToUnified(pjProduct, programId, programId);
                            if (unifiedProduct) {
                                if (keyword) {
                                    unifiedProduct.keywordsMatched = [keyword];
                                }
                                unifiedProducts.push(unifiedProduct);
                                seenProductIds.add(identifier);
                            }
                        }
                    }
                } else {
                    const statusCode = response.data?.meta?.status?.code || 'N/A';
                    const message = response.data?.meta?.status?.message || 'No data returned';
                    logger.warn(`Pepperjam API failed for program ${programId}, keyword '${keyword || 'none'}'. Status: ${statusCode}, Message: ${message}`);
                }
            } catch (error) {
                logger.error(`Pepperjam API call error (keyword: '${keyword || 'none'}') for program ${programId}:`, error);
            }
        }

        logger.info(`Fetched and converted ${unifiedProducts.length} products from Pepperjam (target: ${limit})`);
        return unifiedProducts.slice(0, limit);
    }

    /**
     * 获取Pepperjam API原始产品数据（不进行转换）
     */
    async fetchPepperjamProductsRaw(params: PepperjamFetchParams): Promise<any[]> {
        this.checkEnvironmentVariables();

        const apiKey = process.env.ASCEND_API_KEY;
        if (!apiKey) {
            throw new Error('ASCEND_API_KEY not found in environment variables');
        }

        const baseUrl = process.env.PEPPERJAM_API_BASE_URL || 'https://api.pepperjamnetwork.com';
        const endpoint = `${baseUrl}/20120402/publisher/creative/product`;

        const allRawProducts: any[] = [];
        let currentPage = 1;
        const limit = Math.min(params.limit || 50, 100);
        let totalRequested = 0;

        try {
            while (totalRequested < limit) {
                const pageLimit = Math.min(limit - totalRequested, 100);

                const requestParams: any = {
                    apiKey,
                    format: 'json',
                    programId: params.programId,
                    page: currentPage,
                    limit: pageLimit
                };

                if (params.keywords && params.keywords.length > 0) {
                    requestParams.keyword = params.keywords.join(' ');
                }

                logger.info(`Fetching Pepperjam raw products: page ${currentPage}, limit ${pageLimit}`);

                const response = await axios.get(endpoint, {
                    params: requestParams,
                    timeout: 30000
                });

                if (!response.data || response.data.meta?.status?.code !== 200) {
                    const errorMsg = response.data?.meta?.status?.message || 'Unknown API error';
                    throw new Error(`Pepperjam API error: ${errorMsg}`);
                }

                const products = response.data.data || [];
                allRawProducts.push(...products);

                totalRequested += products.length;

                if (products.length < pageLimit) {
                    break;
                }

                currentPage++;
            }

            logger.info(`Pepperjam API returned ${allRawProducts.length} raw products for program ${params.programId}`);
            return allRawProducts;

        } catch (error) {
            logger.error('Error fetching Pepperjam products raw data:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Pepperjam API request failed: ${error.response?.data?.message || error.message}`);
            }
            throw error;
        }
    }
} 