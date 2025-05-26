import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { UnifiedProduct, CJProduct, PepperjamProduct, CJFetchParams, PepperjamFetchParams } from '@shared/types';

export class ProductRetriever {
    private skipImageValidation: boolean;
    private maxRawProductsToScan = 1000;

    constructor(skipImageValidation: boolean = false) {
        this.skipImageValidation = skipImageValidation;
        logger.info(`ProductRetriever initialized: skipImageValidation=${skipImageValidation}`);
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
        const { advertiserId, keywords = [], limit = 70 } = params;

        logger.info(`Fetching CJ products for advertiser ${advertiserId}, keywords: [${keywords.join(', ')}], limit: ${limit}`);

        const unifiedProducts: UnifiedProduct[] = [];

        try {
            // 使用正确的CJ GraphQL API端点
            const apiUrl = 'https://ads.api.cj.com/query';
            const fetchLimit = Math.max(limit * 5, this.maxRawProductsToScan + 10);

            // 构建GraphQL查询 - 修复字段查询问题
            const query = `
                {
                    products(companyId: "${process.env.CJ_CID || process.env.BRAND_CID}", partnerIds: ["${advertiserId}"], limit: ${fetchLimit}) {
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

            const response = await axios.post(apiUrl,
                { query },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.CJ_API_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data?.data?.products?.resultList?.length) {
                const products = response.data.data.products.resultList;
                let count = 0;
                let skippedKeywordMismatch = 0;
                let skippedNoData = 0;
                let skippedInvalidImage = 0;
                let skippedOtherReasons = 0;

                for (const cjProduct of products) {
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

                logger.info(`CJ product stats - API fetched: ${products.length}, converted: ${unifiedProducts.length}, ` +
                    `skipped (keyword mismatch): ${skippedKeywordMismatch}, ` +
                    `skipped (missing data): ${skippedNoData}, ` +
                    `skipped (invalid image): ${skippedInvalidImage}, ` +
                    `skipped (other): ${skippedOtherReasons}`);
            } else {
                const errorInfo = response.data?.errors || 'No products returned';
                logger.warn(`No products returned from CJ API for advertiser ${advertiserId}. Error: ${JSON.stringify(errorInfo)}`);
            }
        } catch (error) {
            logger.error(`Error fetching CJ products for advertiser ${advertiserId}:`, error);
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
                const apiUrl = 'https://api.pepperjamnetwork.com/20120402/publisher/product/creatives';
                const response = await axios.get(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${process.env.ASCEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    params: {
                        program_ids: programId,
                        keywords: keyword,
                        page: 1,
                        limit: 50
                    }
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