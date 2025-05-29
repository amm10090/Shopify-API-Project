import axios from 'axios';
import { UnifiedProduct, Brand, ImportJob, ProductFilters, ApiResponse, PaginatedResponse } from '@shared/types';

const API_BASE_URL = '/api';

// 创建axios实例
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 请求拦截器
api.interceptors.request.use(
    (config) => {
        // 可以在这里添加认证token
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// 响应拦截器
api.interceptors.response.use(
    (response) => {
        return response.data;
    },
    (error) => {
        const message = error.response?.data?.error || error.message || '请求失败';
        return Promise.reject(new Error(message));
    }
);

// 产品相关API
export const productApi = {
    // 获取产品列表
    getProducts: async (params: {
        page?: number;
        limit?: number;
        brandId?: string;
        sourceApi?: string;
        availability?: boolean;
        importStatus?: string;
        search?: string;
        minPrice?: number;
        maxPrice?: number;
    }): Promise<PaginatedResponse<UnifiedProduct>> => {
        return api.get('/products', { params });
    },

    // 获取单个产品
    getProduct: async (id: string): Promise<ApiResponse<UnifiedProduct>> => {
        return api.get(`/products/${id}`);
    },

    // 从API获取产品（不保存）
    fetchProducts: async (params: {
        brandId: string;
        keywords?: string;
        limit?: number;
    }): Promise<ApiResponse<UnifiedProduct[]>> => {
        return api.post('/products/fetch', params);
    },

    // 保存产品到数据库
    saveProducts: async (params: {
        products: UnifiedProduct[];
        brandId: string;
    }): Promise<ApiResponse<any>> => {
        return api.post('/products/save', params);
    },

    // 更新产品状态
    updateProductStatus: async (id: string, importStatus: string): Promise<ApiResponse<UnifiedProduct>> => {
        return api.patch(`/products/${id}/status`, { importStatus });
    },

    // 更新产品信息
    updateProduct: async (id: string, updates: Partial<UnifiedProduct>): Promise<ApiResponse<UnifiedProduct>> => {
        return api.put(`/products/${id}`, updates);
    },

    // 删除产品
    deleteProduct: async (id: string): Promise<ApiResponse<void>> => {
        return api.delete(`/products/${id}`);
    },

    // 批量操作
    bulkAction: async (action: string, productIds: string[]): Promise<ApiResponse<any>> => {
        return api.post('/products/bulk', { action, productIds });
    },
};

// 品牌相关API
export const brandApi = {
    // 获取所有品牌
    getBrands: async (): Promise<ApiResponse<Brand[]>> => {
        return api.get('/brands');
    },

    // 获取单个品牌
    getBrand: async (id: string): Promise<ApiResponse<Brand>> => {
        return api.get(`/brands/${id}`);
    },

    // 创建品牌
    createBrand: async (brand: Omit<Brand, 'id' | 'lastSync'>): Promise<ApiResponse<Brand>> => {
        return api.post('/brands', brand);
    },

    // 更新品牌
    updateBrand: async (id: string, brand: Partial<Brand>): Promise<ApiResponse<Brand>> => {
        return api.put(`/brands/${id}`, brand);
    },

    // 删除品牌
    deleteBrand: async (id: string): Promise<ApiResponse<void>> => {
        return api.delete(`/brands/${id}`);
    },

    // 更新同步时间
    updateSyncTime: async (id: string): Promise<ApiResponse<Brand>> => {
        return api.patch(`/brands/${id}/sync`);
    },

    // 获取品牌统计
    getBrandStats: async (id: string): Promise<ApiResponse<any>> => {
        return api.get(`/brands/${id}/stats`);
    },

    // 批量操作
    bulkAction: async (action: string, brandIds: string[]): Promise<ApiResponse<any>> => {
        return api.post('/brands/bulk', { action, brandIds });
    },
};

// 导入相关API
export const importApi = {
    // 开始导入任务
    startImport: async (params: {
        brandId: string;
        keywords?: string;
        limit?: number;
    }): Promise<ApiResponse<ImportJob>> => {
        return api.post('/import/start', params);
    },

    // 获取导入任务状态
    getImportStatus: async (jobId: string): Promise<ApiResponse<ImportJob>> => {
        return api.get(`/import/${jobId}/status`);
    },

    // 获取导入历史
    getImportHistory: async (params: {
        page?: number;
        limit?: number;
        brandId?: string;
    }): Promise<PaginatedResponse<ImportJob>> => {
        return api.get('/import/history', { params });
    },

    // 取消导入任务
    cancelImport: async (jobId: string): Promise<ApiResponse<void>> => {
        return api.post(`/import/${jobId}/cancel`);
    },
};

// Shopify相关API
export const shopifyApi = {
    // 导入产品到Shopify
    importToShopify: async (productIds: string[]): Promise<ApiResponse<any>> => {
        return api.post('/shopify/import', { productIds });
    },

    // 同步产品状态
    syncProductStatus: async (productId: string): Promise<ApiResponse<any>> => {
        return api.post(`/shopify/sync/${productId}`);
    },

    // 获取Shopify连接状态
    getConnectionStatus: async (): Promise<ApiResponse<any>> => {
        return api.get('/shopify/status');
    },
};

// Dashboard相关API
export const dashboardApi = {
    // 获取仪表板统计数据
    getStats: async (): Promise<ApiResponse<any>> => {
        return api.get('/dashboard/stats');
    },

    // 获取系统健康状态
    getHealth: async (): Promise<ApiResponse<any>> => {
        return api.get('/dashboard/health');
    },

    // 获取快速统计数据
    getQuickStats: async (): Promise<ApiResponse<any>> => {
        return api.get('/dashboard/quick-stats');
    },
};

// Settings相关API
export const settingsApi = {
    // 获取当前设置
    getSettings: async (): Promise<ApiResponse<any>> => {
        return api.get('/settings');
    },

    // 测试CJ API连接
    testCjConnection: async (params: {
        apiToken: string;
        companyId: string;
    }): Promise<ApiResponse<any>> => {
        return api.post('/settings/test/cj', params);
    },

    // 测试Pepperjam API连接
    testPepperjamConnection: async (params: {
        apiKey: string;
    }): Promise<ApiResponse<any>> => {
        return api.post('/settings/test/pepperjam', params);
    },

    // 测试Shopify连接
    testShopifyConnection: async (params: {
        storeUrl: string;
        accessToken: string;
    }): Promise<ApiResponse<any>> => {
        return api.post('/settings/test/shopify', params);
    },

    // 获取系统状态
    getStatus: async (): Promise<ApiResponse<any>> => {
        return api.get('/settings/status');
    },

    // 获取系统信息
    getInfo: async (): Promise<ApiResponse<any>> => {
        return api.get('/settings/info');
    },

    // 保存设置
    saveSettings: async (settings: any): Promise<ApiResponse<any>> => {
        return api.post('/settings', settings);
    },
};

export default api; 