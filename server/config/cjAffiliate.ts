/**
 * CJ联盟URL配置
 * 基于CJ官方文档的正确实现方式
 * 参考: https://developers.cj.com/docs/publisher-site-tracking/
 */

import axios from 'axios';
import { logger } from '@server/utils/logger';

export interface CJAffiliateConfig {
    apiBaseUrl: string;
    publisherId?: string;
    requestId?: string;
    defaultParams?: Record<string, string>;
}

/**
 * CJ联盟URL构建器 - 使用官方API方法
 */
export class CJAffiliateUrlBuilder {
    private config: CJAffiliateConfig;

    constructor(config?: Partial<CJAffiliateConfig>) {
        this.config = {
            apiBaseUrl: 'https://linksearch.api.cj.com',
            publisherId: process.env.CJ_PID, // 使用正确的Publisher ID环境变量
            requestId: this.generateRequestId(),
            defaultParams: {},
            ...config
        };
    }

    /**
     * 生成请求ID
     */
    private generateRequestId(): string {
        return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 创建CJ联盟URL - 使用dpbolvw格式，adId作为第一个参数
     */
    async createAffiliateLink(
        targetUrl: string,
        adId: string,
        productId?: string,
        additionalParams?: Record<string, string>
    ): Promise<string> {
        try {
            if (!this.config.publisherId) {
                throw new Error('Publisher ID not configured. Please set CJ_PID environment variable.');
            }

            // 使用简化的dpbolvw格式
            return this.createDpbolvwAffiliateUrl(targetUrl, adId, productId, additionalParams);

        } catch (error) {
            logger.error(`CJ affiliate URL creation error:`, error);
            
            // 如果失败，返回原始URL
            logger.warn(`Returning original URL as fallback: ${targetUrl}`);
            return targetUrl;
        }
    }

    /**
     * 创建dpbolvw格式的联盟URL - 正确的参数顺序
     * 格式: https://www.dpbolvw.net/click-{PID}-{adId}?url={encoded_url}&cjsku={product_id}
     */
    private createDpbolvwAffiliateUrl(
        targetUrl: string,
        adId: string,
        productId?: string,
        additionalParams?: Record<string, string>
    ): string {
        const publisherId = this.config.publisherId!;
        
        // dpbolvw格式：publisherId在前，adId在后
        let dpbolvwUrl = `https://www.dpbolvw.net/click-${publisherId}-${adId}?url=${encodeURIComponent(targetUrl)}`;
        
        if (productId) {
            dpbolvwUrl += `&cjsku=${encodeURIComponent(productId)}`;
        }
        
        // 添加额外参数
        if (additionalParams) {
            Object.entries(additionalParams).forEach(([key, value]) => {
                dpbolvwUrl += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
            });
        }
        
        logger.info(`Created dpbolvw CJ affiliate URL: PID ${publisherId}, adId ${adId}, product ${productId || 'N/A'}`);
        return dpbolvwUrl;
    }



    /**
     * 验证联盟URL是否为CJ格式
     */
    static isCJAffiliateUrl(url: string): boolean {
        const cjDomains = [
            'members.cj.com',
            'cj.dotomi.com',
            'dpbolvw.net',
            'anrdoezrs.net',
            'jdoqocy.com',
            'tkqlhce.com'
        ];

        return cjDomains.some(domain => url.includes(domain));
    }

    /**
     * 从联盟URL中提取信息
     */
    static parseAffiliateUrl(affiliateUrl: string): {
        publisherId?: string;
        advertiserId?: string;
        targetUrl?: string;
        cjevent?: string;
    } | null {
        try {
            const url = new URL(affiliateUrl);
            
            if (url.hostname === 'members.cj.com') {
                // 解析会员中心格式的URL
                return {
                    publisherId: url.searchParams.get('pid') || undefined,
                    advertiserId: url.searchParams.get('aid') || undefined,
                    targetUrl: url.searchParams.get('url') || undefined,
                    cjevent: url.searchParams.get('cjevent') || undefined
                };
            }

            // 处理其他CJ域名格式
            const pathMatch = url.pathname.match(/\/click-(\d+)-(\d+)/);
            if (pathMatch) {
                const [, publisherId, advertiserId] = pathMatch;
                const targetUrl = url.searchParams.get('url');

                return {
                    publisherId,
                    advertiserId,
                    targetUrl: targetUrl ? decodeURIComponent(targetUrl) : undefined
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<CJAffiliateConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * 获取当前配置
     */
    getConfig(): CJAffiliateConfig {
        return { ...this.config };
    }
}

/**
 * 默认的CJ联盟URL构建器实例
 */
export const defaultCJAffiliateBuilder = new CJAffiliateUrlBuilder();

/**
 * CJ联盟URL构建的便捷函数 - 使用adId
 */
export async function buildCJAffiliateUrl(
    targetUrl: string,
    adId: string,
    productId?: string,
    additionalParams?: Record<string, string>
): Promise<string> {
    return await defaultCJAffiliateBuilder.createAffiliateLink(
        targetUrl,
        adId,
        productId,
        additionalParams
    );
}

/**
 * 环境变量验证 - 基于实际CJ API测试优化
 */
export function validateCJEnvironment(): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    config: {
        apiToken: boolean;
        publisherId: string | null;
        baseApiUrl: string;
        affiliateMethod: string;
    };
} {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查API Token
    const hasApiToken = !!process.env.CJ_API_TOKEN;
    if (!hasApiToken) {
        errors.push('CJ_API_TOKEN environment variable is required for GraphQL API access');
    }

    // 检查Publisher ID
    const publisherId = process.env.CJ_PID;
    if (!publisherId) {
        errors.push('Publisher ID not configured: set CJ_PID environment variable');
    } else {
        // 验证Publisher ID格式（应该是数字）
        if (!/^\d+$/.test(publisherId)) {
            warnings.push(`Publisher ID "${publisherId}" should be numeric`);
        }
        
        logger.info(`Using Publisher ID: ${publisherId}`);
    }

    // 确定联盟URL构建方法
    let affiliateMethod = 'dpbolvw'; // 默认使用dpbolvw格式，避免用户登录问题
    
    if (process.env.CJ_AFFILIATE_METHOD === 'member_center') {
        affiliateMethod = 'member_center';
        warnings.push('Using member_center method as specified in CJ_AFFILIATE_METHOD - may require user login');
    }

    // 基于实际测试的建议
    if (hasApiToken && publisherId) {
        logger.info('CJ configuration valid. Tested with advertiser: Intercroatia.cz (ID: 5765801)');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        config: {
            apiToken: hasApiToken,
            publisherId: publisherId || null,
            baseApiUrl: 'https://ads.api.cj.com/query',
            affiliateMethod
        }
    };
} 