/**
 * CJ联盟URL管理API路由
 * 提供CJ联盟URL构建、验证和测试功能
 */

import { Router, Request, Response, NextFunction } from 'express';
import { buildCJAffiliateUrl, CJAffiliateUrlBuilder, validateCJEnvironment } from '@server/config/cjAffiliate';
import { logger } from '@server/utils/logger';

const router = Router();

/**
 * GET /api/cj-affiliate/config
 * 获取CJ联盟配置信息和环境验证结果
 */
router.get('/config', (req: Request, res: Response, next: NextFunction) => {
    try {
        const validation = validateCJEnvironment();
        const config = {
            apiBaseUrl: 'https://linksearch.api.cj.com',
            publisherId: process.env.CJ_CID || process.env.BRAND_CID || null,
            hasApiToken: !!process.env.CJ_API_TOKEN,
            validation
        };

        res.json({
            success: true,
            data: config
        });

    } catch (error) {
        logger.error('获取CJ联盟配置失败:', error);
        next(error);
    }
});

/**
 * POST /api/cj-affiliate/build-url
 * 构建CJ联盟URL - 使用CJ官方API
 */
router.post('/build-url', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { targetUrl, advertiserId, productId, additionalParams } = req.body;

        // 验证必需参数
        if (!targetUrl || !advertiserId) {
            res.status(400).json({
                success: false,
                error: '缺少必需参数',
                required: ['targetUrl', 'advertiserId'],
                optional: ['productId', 'additionalParams']
            });
            return;
        }

        // 构建联盟URL（异步）
        const affiliateUrl = await buildCJAffiliateUrl(
            targetUrl,
            advertiserId,
            productId,
            additionalParams
        );

        // 解析构建的URL以验证
        const parsed = CJAffiliateUrlBuilder.parseAffiliateUrl(affiliateUrl);
        const isCJUrl = CJAffiliateUrlBuilder.isCJAffiliateUrl(affiliateUrl);

        res.json({
            success: true,
            data: {
                affiliateUrl,
                original: {
                    targetUrl,
                    advertiserId,
                    productId,
                    additionalParams
                },
                parsed,
                valid: !!parsed,
                isCJUrl,
                method: affiliateUrl === targetUrl ? 'fallback_original' : 'cj_api'
            }
        });

    } catch (error) {
        logger.error('构建CJ联盟URL失败:', error);
        next(error);
    }
});

/**
 * POST /api/cj-affiliate/parse-url
 * 解析CJ联盟URL
 */
router.post('/parse-url', (req: Request, res: Response, next: NextFunction) => {
    try {
        const { affiliateUrl } = req.body;

        if (!affiliateUrl) {
            res.status(400).json({
                success: false,
                error: '缺少affiliateUrl参数'
            });
            return;
        }

        const parsed = CJAffiliateUrlBuilder.parseAffiliateUrl(affiliateUrl);
        const isCJUrl = CJAffiliateUrlBuilder.isCJAffiliateUrl(affiliateUrl);

        res.json({
            success: true,
            data: {
                originalUrl: affiliateUrl,
                isCJUrl,
                parsed,
                valid: !!parsed
            }
        });

    } catch (error) {
        logger.error('解析CJ联盟URL失败:', error);
        next(error);
    }
});

/**
 * GET /api/cj-affiliate/test-adid/:advertiserId
 * 测试获取商品广告ID的端点
 */
router.get('/test-adid/:advertiserId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { advertiserId } = req.params;
        const limit = parseInt(req.query.limit as string) || 5;

        if (!advertiserId) {
            res.status(400).json({
                success: false,
                error: '缺少advertiserId参数'
            });
            return;
        }

        // 简单测试查询 - 获取包含adId字段的产品数据
        const companyId = process.env.CJ_CID;
        
        const query = `
            {
                products(
                    companyId: "${companyId}", 
                    partnerIds: ["${advertiserId}"], 
                    limit: ${limit}
                ) {
                    totalCount
                    count
                    resultList {
                        id
                        title
                        advertiserId
                        advertiserName
                        adId
                    }
                }
            }
        `;

        const response = await fetch('https://ads.api.cj.com/query', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CJ_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        const data = await response.json() as any;

        if (data.errors) {
            logger.error('CJ API查询广告ID错误:', data.errors);
            res.status(500).json({
                success: false,
                error: 'CJ API查询失败',
                details: data.errors
            });
            return;
        }

        const products = data.data?.products?.resultList || [];
        const productsWithAdId = products.filter((p: any) => p.adId);

        res.json({
            success: true,
            data: {
                advertiserId,
                totalProducts: products.length,
                productsWithAdId: productsWithAdId.length,
                examples: productsWithAdId.slice(0, 3).map((p: any) => ({
                    id: p.id,
                    title: p.title,
                    adId: p.adId
                })),
                summary: {
                    totalCount: data.data?.products?.totalCount || 0,
                    returnedCount: data.data?.products?.count || 0
                }
            }
        });

    } catch (error) {
        logger.error('测试广告ID获取失败:', error);
        next(error);
    }
});

export default router; 