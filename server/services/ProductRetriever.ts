import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { UnifiedProduct, CJProduct, PepperjamProduct, CJFetchParams, PepperjamFetchParams } from '../../shared/types/index';
import { cjApiLimitChecker, pepperjamApiLimitChecker } from '../config/apiLimits';

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
     * 验证图片URL是否有效
     */
    private async isValidImageUrl(
        url: string,
        timeout: number = 15000,
        minSizeBytes: number = 1000,
        maxRetries: number = 2
    ): Promise<boolean> {
        if (this.skipImageValidation) {
            return true;
        }

        if (!url || !url.match(/^https?:\/\//)) {
            logger.warn(`Invalid image URL format: ${url}`);
            return false;
        }

        // feedonomics.com域名的图片已知有效但响应较慢，直接视为有效
        if (url.includes('feedonomics.com')) {
            logger.debug(`Skipping validation for feedonomics.com image: ${url}`);
            return true;
        }

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.head(url, {
                    timeout,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (response.status !== 200) {
                    if (attempt < maxRetries) {
                        logger.debug(`HEAD request returned ${response.status}, retrying...`);
                        continue;
                    }
                    logger.warn(`Image URL returned non-200 status: ${url} (status: ${response.status})`);
                    return false;
                }

                const contentType = response.headers['content-type']?.toLowerCase() || '';
                const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

                if (!imageTypes.some(type => contentType.startsWith(type))) {
                    if (attempt < maxRetries) {
                        logger.debug(`Content-Type not image (${contentType}), trying GET request...`);
                        try {
                            const getResponse = await axios.get(url, {
                                timeout,
                                responseType: 'stream',
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                }
                            });

                            if (getResponse.status === 200) {
                                const getContentType = getResponse.headers['content-type']?.toLowerCase() || '';
                                if (imageTypes.some(type => getContentType.startsWith(type))) {
                                    return true;
                                }
                            }
                            continue;
                        } catch (innerError) {
                            if (attempt < maxRetries) {
                                continue;
                            }
                            logger.warn(`GET request failed: ${url}`, innerError);
                            return false;
                        }
                    }

                    if (attempt === maxRetries) {
                        logger.warn(`URL is not an image type: ${url} (Content-Type: ${contentType})`);
                        return false;
                    }
                }

                const contentLength = response.headers['content-length'];
                if (contentLength && parseInt(contentLength) < minSizeBytes) {
                    if (attempt < maxRetries) {
                        logger.debug(`Image size too small (${contentLength} bytes), retrying...`);
                        continue;
                    }
                    logger.warn(`Image URL content length too small: ${url} (size: ${contentLength} bytes)`);
                    return false;
                }

                return true;
            } catch (error) {
                if (attempt < maxRetries) {
                    logger.debug(`Request error: ${error}, retrying...`);
                    continue;
                }
                logger.warn(`Error validating image URL: ${url}`, error);
                return false;
            }
        }

        return false;
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

                // 构建GraphQL查询 - 使用offset和limit进行分页
                const query = `
                     {
                         products(
                             companyId: "${companyId}", 
                             partnerIds: ["${advertiserId}"], 
                             limit: ${currentLimit},
                             offset: ${page.offset}
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
} 