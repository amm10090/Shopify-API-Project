/**
 * API限制和分页配置
 */

export interface ApiLimits {
    maxPerPage: number;
    maxTotalRecords: number;
    defaultPageSize: number;
    requestDelay: number; // 请求间延迟（毫秒）
    maxConcurrentRequests: number;
    timeout: number; // 请求超时（毫秒）
}

export interface PaginationConfig {
    supportsOffset: boolean;
    supportsCursor: boolean;
    offsetParam: string;
    limitParam: string;
    cursorParam?: string;
}

/**
 * CJ Commission Junction API 限制
 */
export const CJ_API_LIMITS: ApiLimits = {
    maxPerPage: 500,           // CJ API单次查询最大记录数
    maxTotalRecords: 2000,     // 单次操作最大扫描记录数
    defaultPageSize: 100,      // 默认页面大小
    requestDelay: 100,         // 请求间延迟100ms
    maxConcurrentRequests: 1,  // 最大并发请求数
    timeout: 30000            // 30秒超时
};

export const CJ_PAGINATION_CONFIG: PaginationConfig = {
    supportsOffset: true,
    supportsCursor: false,
    offsetParam: 'offset',
    limitParam: 'limit'
};

/**
 * Pepperjam API 限制
 */
export const PEPPERJAM_API_LIMITS: ApiLimits = {
    maxPerPage: 2500,          // Pepperjam API单次查询最大记录数
    maxTotalRecords: 5000,     // 单次操作最大扫描记录数
    defaultPageSize: 500,      // 默认页面大小
    requestDelay: 200,         // 请求间延迟200ms
    maxConcurrentRequests: 1,  // 最大并发请求数
    timeout: 30000            // 30秒超时
};

export const PEPPERJAM_PAGINATION_CONFIG: PaginationConfig = {
    supportsOffset: true,
    supportsCursor: false,
    offsetParam: 'page',
    limitParam: 'limit'
};

/**
 * 通用API限制检查器
 */
export class ApiLimitChecker {
    private limits: ApiLimits;
    private config: PaginationConfig;

    constructor(limits: ApiLimits, config: PaginationConfig) {
        this.limits = limits;
        this.config = config;
    }

    /**
     * 验证请求参数是否在限制范围内
     */
    validateRequest(limit: number, offset: number = 0): { valid: boolean; adjustedLimit: number; message?: string } {
        if (limit <= 0) {
            return {
                valid: false,
                adjustedLimit: this.limits.defaultPageSize,
                message: 'Limit must be greater than 0'
            };
        }

        if (limit > this.limits.maxPerPage) {
            return {
                valid: true,
                adjustedLimit: this.limits.maxPerPage,
                message: `Limit adjusted from ${limit} to ${this.limits.maxPerPage} (API maximum)`
            };
        }

        if (offset + limit > this.limits.maxTotalRecords) {
            const adjustedLimit = Math.max(0, this.limits.maxTotalRecords - offset);
            return {
                valid: adjustedLimit > 0,
                adjustedLimit,
                message: adjustedLimit > 0 
                    ? `Limit adjusted to ${adjustedLimit} to stay within total record limit`
                    : 'Offset exceeds maximum total records limit'
            };
        }

        return {
            valid: true,
            adjustedLimit: limit
        };
    }

    /**
     * 计算分页策略
     */
    calculatePagination(totalRequested: number, startOffset: number = 0): {
        pages: Array<{ offset: number; limit: number }>;
        totalPages: number;
        estimatedTotal: number;
    } {
        const pages: Array<{ offset: number; limit: number }> = [];
        let currentOffset = startOffset;
        let remaining = Math.min(totalRequested, this.limits.maxTotalRecords - startOffset);

        while (remaining > 0) {
            const pageSize = Math.min(remaining, this.limits.maxPerPage);
            pages.push({
                offset: currentOffset,
                limit: pageSize
            });

            currentOffset += pageSize;
            remaining -= pageSize;

            // 安全检查：避免无限循环
            if (pages.length > 100) {
                break;
            }
        }

        return {
            pages,
            totalPages: pages.length,
            estimatedTotal: Math.min(totalRequested, this.limits.maxTotalRecords)
        };
    }

    /**
     * 获取请求延迟时间
     */
    getRequestDelay(): number {
        return this.limits.requestDelay;
    }

    /**
     * 获取超时时间
     */
    getTimeout(): number {
        return this.limits.timeout;
    }
}

/**
 * 预定义的API限制检查器实例
 */
export const cjApiLimitChecker = new ApiLimitChecker(CJ_API_LIMITS, CJ_PAGINATION_CONFIG);
export const pepperjamApiLimitChecker = new ApiLimitChecker(PEPPERJAM_API_LIMITS, PEPPERJAM_PAGINATION_CONFIG); 