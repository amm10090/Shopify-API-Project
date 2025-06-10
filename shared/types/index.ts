// 核心数据模型
export interface UnifiedProduct {
    id: string;
    sourceApi: 'cj' | 'pepperjam';
    sourceProductId: string;
    brandName: string;
    title: string;
    description: string;
    price: number;
    salePrice?: number;
    currency: string;
    imageUrl: string;
    affiliateUrl: string;
    categories: string[];
    availability: boolean;
    shopifyProductId?: string;
    importStatus: 'pending' | 'imported' | 'failed';
    lastUpdated: Date;
    keywordsMatched?: string[];
    sku?: string;
    adId?: string; // CJ广告ID
}

export interface Brand {
    id: string;
    name: string;
    apiType: 'cj' | 'pepperjam';
    apiId: string;
    isActive: boolean;
    lastSync: Date;
}

export interface ImportJob {
    id: string;
    brandId: string;
    status: 'running' | 'completed' | 'failed';
    productsFound: number;
    productsImported: number;
    filters: ProductFilters;
    createdAt: Date;
    completedAt?: Date;
    errorMessage?: string;
}

export interface ProductFilters {
    keywords?: string[];
    priceRange?: {
        min: number;
        max: number;
    };
    categories?: string[];
    availability?: boolean;
    brands?: string[];
}

// API 响应类型
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// CJ API 类型
export interface CJProduct {
    id: string;
    advertiserId: string;
    advertiserName: string;
    title: string;
    description: string;
    price: {
        amount: string;
        currency: string;
    };
    link: string;
    imageLink: string;
    availability: string;
    productType?: string[];
    googleProductCategory?: {
        name: string;
    };
    adId?: string; // 广告ID
}

export interface CJFetchParams {
    advertiserId: string;
    keywords?: string[];
    limit?: number;
    offset?: number;
    maxPages?: number;
}

// Pepperjam API 类型
export interface PepperjamProduct {
    id: string;
    name: string;
    description_long?: string;
    description_short?: string;
    price: string;
    price_sale?: string;
    currency_symbol: string;
    buy_url: string;
    image_url: string;
    stock_availability?: string;
    categories?: Array<{ name: string }>;
    program_name?: string;
}

export interface PepperjamFetchParams {
    programId: string;
    keywords?: string[];
    limit?: number;
}

// Shopify 类型
export interface ShopifyProduct {
    id: string;
    title: string;
    body_html: string;
    vendor: string;
    product_type: string;
    created_at: string;
    updated_at: string;
    published_at?: string;
    status: 'active' | 'archived' | 'draft';
    variants: ShopifyVariant[];
    images: ShopifyImage[];
    metafields?: ShopifyMetafield[];
}

export interface ShopifyVariant {
    id: string;
    product_id: string;
    title: string;
    price: string;
    sku: string;
    inventory_quantity: number;
    inventory_management: string;
    inventory_policy: string;
    compare_at_price?: string;
}

export interface ShopifyImage {
    id: string;
    product_id: string;
    src: string;
    alt?: string;
}

export interface ShopifyMetafield {
    id: string;
    namespace: string;
    key: string;
    value: string;
    type: string;
}

// 用户界面类型
export interface FilterPanelProps {
    filters: ProductFilters;
    onFiltersChange: (filters: ProductFilters) => void;
    brands: Brand[];
}

export interface ProductCardProps {
    product: UnifiedProduct;
    onImport: (productId: string) => void;
    isImporting?: boolean;
}

export interface BulkActionsProps {
    selectedProducts: string[];
    onBulkImport: (productIds: string[]) => void;
    onBulkUpdatePrices: (productIds: string[]) => void;
}

// 配置类型
export interface AppConfig {
    shopify: {
        apiKey: string;
        apiSecret: string;
        scopes: string[];
        hostName: string;
    };
    apis: {
        cj: {
            token: string;
            companyId: string;
        };
        pepperjam: {
            apiKey: string;
            baseUrl: string;
        };
    };
    database: {
        url: string;
    };
    redis: {
        url: string;
    };
}

// 错误类型
export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class ValidationError extends AppError {
    constructor(message: string, public field?: string) {
        super(message, 400, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string) {
        super(`${resource} not found`, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
} 