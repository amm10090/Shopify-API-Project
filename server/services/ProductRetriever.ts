import axios, { AxiosResponse } from 'axios';
import { logger } from '@server/utils/logger';
import { UnifiedProduct, CJProduct, PepperjamProduct, CJFetchParams, PepperjamFetchParams } from '@shared/types/index';
import { cjApiLimitChecker, pepperjamApiLimitChecker } from '@server/config/apiLimits';

export class ProductRetriever {
    private skipImageValidation: boolean;
    private maxRawProductsToScan = 1000;

    constructor(skipImageValidation: boolean = false) {
        this.skipImageValidation = skipImageValidation;
        logger.info(`ProductRetriever initialized: skipImageValidation=${skipImageValidation}`);

        // 检查环境变量配置
        this.checkEnvironmentVariables();
    }

    /**
     * 检查必要的环境变量是否配置
     */
    private checkEnvironmentVariables(): void {
        const cjConfigured = !!(process.env.CJ_API_TOKEN && (process.env.CJ_CID || process.env.BRAND_CID));
        const pepperjamConfigured = !!(process.env.ASCEND_API_KEY || process.env.PEPPERJAM_API_KEY);

        logger.info(`API Configuration Status:`);
        logger.info(`- CJ API: ${cjConfigured ? 'Configured' : 'Missing credentials'}`);
        logger.info(`- Pepperjam API: ${pepperjamConfigured ? 'Configured' : 'Missing credentials'}`);

        if (!cjConfigured) {
            logger.warn(`CJ API not properly configured. Missing: ${!process.env.CJ_API_TOKEN ? 'CJ_API_TOKEN ' : ''}${!(process.env.CJ_CID || process.env.BRAND_CID) ? 'CJ_CID/BRAND_CID' : ''}`);
        }

        if (!pepperjamConfigured) {
            logger.warn(`Pepperjam API not properly configured. Missing: ASCEND_API_KEY/PEPPERJAM_API_KEY`);
        }
    }

    /**
     * 验证图片URL是否有效（改进版本 - 更宽松的验证）
     */
    private async isValidImageUrl(
        url: string,
        timeout: number = 8000,
        maxRetries: number = 1
    ): Promise<boolean> {
        if (this.skipImageValidation) {
            return true;
        }

        if (!url || !url.match(/^https?:\/\//)) {
            logger.warn(`Invalid image URL format: ${url}`);
            return false;
        }

        // 已知的图片服务域名直接通过验证
        const trustedDomains = [
            'feedonomics.com',
            'shopifycdn.com',
            'shopify.com',
            'amazonaws.com',
            'cloudinary.com',
            'imagekit.io',
            'unsplash.com',
            'pexels.com'
        ];

        if (trustedDomains.some(domain => url.includes(domain))) {
            logger.debug(`Trusted domain detected, skipping validation: ${url}`);
            return true;
        }

        // 基本URL格式检查 - 如果看起来像图片URL就认为有效
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff)(\?.*)?$/i;
        if (imageExtensions.test(url)) {
            logger.debug(`URL has image extension, considering valid: ${url}`);
            return true;
        }

        // 对于其他URL，进行轻量级验证
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.head(url, {
                    timeout,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    validateStatus: function (status) {
                        // 接受更多的状态码作为有效响应
                        return status >= 200 && status < 400;
                    }
                });

                if (response.status >= 200 && response.status < 300) {
                    const contentType = response.headers['content-type']?.toLowerCase() || '';

                    // 更宽松的内容类型检查
                    if (contentType.startsWith('image/') ||
                        contentType.includes('octet-stream') ||
                        contentType === '' ||
                        contentType.includes('binary')) {

                        logger.debug(`Image URL validated: ${url} (${contentType})`);
                        return true;
                    } else {
                        logger.debug(`Non-image content type but may still be valid: ${url} (${contentType})`);
                        // 即使不是图片内容类型，也可能是有效的图片URL（某些服务器配置问题）
                        return true;
                    }
                }

                // 如果HEAD请求失败，不再重试，直接认为URL可能有效
                // 某些服务器不支持HEAD请求
                logger.debug(`HEAD request failed but URL may still be valid: ${url}`);
                return true;

            } catch (error) {
                if (attempt < maxRetries) {
                    logger.debug(`Request error, retrying: ${error}`);
                    continue;
                }

                // 网络错误不代表图片无效，可能是临时性问题
                logger.debug(`Network error during validation, but URL may still be valid: ${url}`);
                return true;
            }
        }

        // 默认情况下认为URL有效，让Shopify来决定是否能使用
        return true;
    }

    /**
     * 将CJ产品转换为UnifiedProduct
     */
    private async cjProductToUnified(
        cjProduct: any,
        brandName: string,
        sourceApiName: string
    ): Promise<UnifiedProduct | null> {
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
            affiliateUrl: cjProduct.link,
            imageUrl: cjProduct.imageLink,
            availability: (cjProduct.availability || 'in stock').toLowerCase() === 'in stock',
            salePrice: undefined,
            categories,
            importStatus: 'pending',
            lastUpdated: new Date(),
            keywordsMatched: [],
            sku
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

            // 获取Company ID，优先使用CJ_CID，然后BRAND_CID，最后使用默认值
            const companyId = process.env.CJ_CID || process.env.BRAND_CID || '7520009';
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

                // 使用与fetchCJProducts相同的GraphQL查询结构
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

        // 获取Company ID，优先使用CJ_CID，然后BRAND_CID，最后使用默认值
        const companyId = process.env.CJ_CID || process.env.BRAND_CID || '7520009';
        logger.debug(`Using CJ Company ID: ${companyId}`);

        // 获取更多数据以便更好地匹配
        const limit = Math.min(params.limit ? params.limit * 3 : 150, 300);

        logger.info(`Fetching CJ raw products for advertiser ${params.advertiserId}, limit: ${limit}${params.keywords ? `, keywords: ${params.keywords.join(', ')}` : ''}`);

        // 简化的GraphQL查询，不使用searchTerm参数
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