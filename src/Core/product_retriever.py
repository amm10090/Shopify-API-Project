import os
from typing import List, Optional, Dict, Any
import logging # 导入 logging

from Core.data_models import UnifiedProduct
# 动态导入API客户端，以便在没有安装所有依赖项的情况下也能进行部分测试或导入
try:
    from CJ.CJ_product_fetcher import search_products as cj_search_products, get_products_by_advertiser
except ImportError:
    print("警告: 未能导入 CJ_product_fetcher. 请确保 CJ 模块及其依赖项已正确安装和配置，如果需要使用 CJ API 的话。")
    cj_search_products = None
    get_products_by_advertiser = None

try:
    from Ascend.pepperjam_publisher_api import PepperjamPublisherAPI
except ImportError:
    print("警告: 未能导入 PepperjamPublisherAPI. 请确保 Ascend 模块及其依赖项已正确安装和配置，如果需要使用 Pepperjam API 的话。")
    PepperjamPublisherAPI = None

class ProductRetriever:
    """负责从 CJ 和 Pepperjam API 获取产品数据，并将其转换为 UnifiedProduct 对象列表。"""

    def __init__(self):
        """初始化 ProductRetriever。"""
        self.logger = logging.getLogger(__name__) # 初始化 logger

        if PepperjamPublisherAPI:
            try:
                self.pepperjam_client = PepperjamPublisherAPI() # 使用 .env 中的默认配置初始化
            except ValueError as e:
                self.logger.warning(f"初始化 PepperjamPublisherAPI 失败: {e}。Pepperjam API 功能将不可用。")
                self.pepperjam_client = None
        else:
            self.pepperjam_client = None
        
        # CJ 客户端通常是函数式的，不需要实例化存储，可以直接调用 cj_search_products
        if not cj_search_products:
            self.logger.warning("CJ 产品搜索功能不可用。")

    def _cj_product_to_unified(self, cj_product: Dict[str, Any], brand_name: str) -> Optional[UnifiedProduct]:
        """将单个 CJ API 产品条目转换为 UnifiedProduct 对象。"""
        try:
            price_info = cj_product.get('price', {})
            sale_price_info = cj_product.get('salePrice')
            
            # 确保价格是数字
            price_amount = None
            if price_info.get('amount') is not None:
                try:
                    price_amount = float(price_info['amount'])
                except (ValueError, TypeError):
                    self.logger.warning(f"CJ 产品价格格式无效: {price_info.get('amount')} (ID: {cj_product.get('id')})")
                    return None # 或者跳过这个产品
            else:
                self.logger.warning(f"CJ 产品缺少价格信息 (ID: {cj_product.get('id')})")
                return None # 必需字段缺失

            sale_price_amount = None
            if sale_price_info and sale_price_info.get('amount') is not None:
                try:
                    sale_price_amount = float(sale_price_info['amount'])
                except (ValueError, TypeError):
                    self.logger.warning(f"CJ 产品促销价格格式无效: {sale_price_info.get('amount')} (ID: {cj_product.get('id')})")
                    # 促销价是可选的，可以继续

            # 有效性检查
            if not cj_product.get('link'):
                self.logger.warning(f"CJ 产品缺少 link (ID: {cj_product.get('id')})")
                return None
            if not cj_product.get('imageLink'):
                self.logger.warning(f"CJ 产品缺少 imageLink (ID: {cj_product.get('id')})")
                # 根据需求决定是否跳过，图片通常很重要
                return None 

            # 获取商品分类
            categories = []
            if cj_product.get('productType') and isinstance(cj_product['productType'], list):
                categories.extend(cj_product['productType'])
            if cj_product.get('googleProductCategory') and cj_product['googleProductCategory'].get('name'):
                categories.append(cj_product['googleProductCategory']['name'])
            
            return UnifiedProduct(
                source_api='cj',
                source_product_id=str(cj_product.get('id')),
                brand_name=cj_product.get('advertiserName', brand_name), # API可能提供，否则用配置的
                source_advertiser_id=str(cj_product.get('advertiserId')),
                title=cj_product.get('title', 'N/A'),
                description=cj_product.get('description', ''),
                price=price_amount,
                currency=price_info.get('currency', 'USD'),
                product_url=cj_product['link'],  # 直接使用link字段
                image_url=cj_product['imageLink'],
                availability=cj_product.get('availability', 'in stock').lower() == 'in stock', # 假设 'in stock' 表示有货
                sale_price=sale_price_amount,
                categories=categories,  # 使用提取的分类
                raw_data=cj_product
            )
        except Exception as e:
            self.logger.error(f"转换 CJ 产品 (ID: {cj_product.get('id')}) 为 UnifiedProduct 时失败: {e}", exc_info=True)
            return None

    def fetch_cj_products(self, advertiser_id: str, brand_name: str, keywords: str, limit: int = 70) -> List[UnifiedProduct]:
        """从 CJ API 获取特定广告商的产品，并按关键词过滤（如果API支持或客户端过滤）。"""
        if not get_products_by_advertiser:
            self.logger.warning("CJ 产品获取功能不可用，无法获取产品。")
            return []
        
        self.logger.info(f"正在从 CJ API 获取品牌 '{brand_name}' (Advertiser ID: {advertiser_id}) 的产品，关键词: '{keywords}', 限制: {limit}")
        unified_products: List[UnifiedProduct] = []
        try:
            # 使用 get_products_by_advertiser 直接获取指定广告商的产品
            # 注意：此方法不支持关键词筛选，我们需要在获取数据后在客户端进行筛选
            raw_cj_data = get_products_by_advertiser(advertiser_id=advertiser_id, limit=limit * 2)

            if raw_cj_data and raw_cj_data.get('data') and raw_cj_data['data'].get('products'):
                products_list = raw_cj_data['data']['products'].get('resultList', [])
                count = 0
                
                # 客户端关键词过滤
                for cj_prod_data in products_list:
                    # 不需要检查advertiserId，因为get_products_by_advertiser已经按广告商ID过滤
                    # 如果有关键词，进行客户端筛选
                    if keywords and keywords.strip():
                        # 在标题和描述中搜索关键词
                        title = cj_prod_data.get('title', '').lower()
                        description = cj_prod_data.get('description', '').lower()
                        keywords_lower = keywords.lower()
                        
                        if keywords_lower not in title and keywords_lower not in description:
                            continue  # 跳过不匹配关键词的产品
                    
                    unified_prod = self._cj_product_to_unified(cj_prod_data, brand_name)
                    if unified_prod:
                        unified_products.append(unified_prod)
                        count += 1
                        if count >= limit:  # 已达到我们为该品牌请求的上限
                            break
            else:
                error_info = raw_cj_data.get('errors') if raw_cj_data else "No data returned"
                self.logger.error(f"从 CJ API 获取品牌 '{brand_name}' (Advertiser ID: {advertiser_id}) 的产品失败。错误: {error_info}")

        except Exception as e:
            self.logger.error(f"从 CJ API 获取品牌 '{brand_name}' (Advertiser ID: {advertiser_id}) 产品时发生错误: {e}", exc_info=True)
        
        self.logger.info(f"为品牌 '{brand_name}' (CJ) 获取并转换了 {len(unified_products)} 个产品。")
        return unified_products

    def _pepperjam_product_to_unified(self, pj_product: Dict[str, Any], brand_name: str, program_id: str) -> Optional[UnifiedProduct]:
        """将单个 Pepperjam API 产品条目转换为 UnifiedProduct 对象。"""
        try:
            price_str = pj_product.get('price')
            sale_price_str = pj_product.get('price_sale')
            
            price_amount = None
            if price_str:
                try:
                    price_amount = float(price_str)
                except (ValueError, TypeError):
                    self.logger.warning(f"Pepperjam 产品价格格式无效: {price_str} (Name: {pj_product.get('name')})")
                    return None
            else:
                self.logger.warning(f"Pepperjam 产品缺少价格信息 (Name: {pj_product.get('name')})")
                return None

            sale_price_amount = None
            if sale_price_str:
                try:
                    sale_price_amount = float(sale_price_str)
                except (ValueError, TypeError):
                    self.logger.warning(f"Pepperjam 产品促销价格格式无效: {sale_price_str} (Name: {pj_product.get('name')})")
            
            # Pepperjam 的 `buy_url` 是联盟链接
            buy_url = pj_product.get('buy_url')
            if not buy_url:
                self.logger.warning(f"Pepperjam 产品缺少 buy_url (Name: {pj_product.get('name')})")
                return None
            if not pj_product.get('image_url'):
                self.logger.warning(f"Pepperjam 产品缺少 image_url (Name: {pj_product.get('name')})")
                return None

            # Pepperjam API 的库存状态可能在 `stock_availability` 或类似字段，或者通过描述判断
            # `get_publisher_product_creatives` 返回的数据中，库存信息不明确。
            # 我们假设，如果能获取到，就是可用的，除非有明确字段。
            # 暂时默认 availability=True，后续可根据API响应调整。
            availability_str = pj_product.get('stock_availability', 'in stock') # 假设有此字段
            is_available = 'in stock' in availability_str.lower() or 'available' in availability_str.lower()
            if not availability_str: is_available = True # 如果没有库存字段，乐观假设有货

            return UnifiedProduct(
                source_api='pepperjam',
                source_product_id=str(pj_product.get('id', pj_product.get('name'))), # Pepperjam 可能没有明确的数字ID，用name做后备
                brand_name=pj_product.get('program_name', brand_name), # API可能提供，否则用配置的
                source_advertiser_id=str(program_id), # 从参数传入
                title=pj_product.get('name', 'N/A'),
                description=pj_product.get('description_long', pj_product.get('description_short', '')),
                price=price_amount,
                currency=pj_product.get('currency_symbol', 'USD'), # Pepperjam API可能返回 symbol 或 code
                product_url=buy_url,
                image_url=pj_product.get('image_url'),
                availability=is_available,
                sale_price=sale_price_amount,
                categories=[cat.get('name') for cat in pj_product.get('categories', []) if cat.get('name')],
                raw_data=pj_product
            )
        except Exception as e:
            self.logger.error(f"转换 Pepperjam 产品 (Name: {pj_product.get('name')}) 为 UnifiedProduct 时失败: {e}", exc_info=True)
            return None

    def fetch_pepperjam_products(self, program_id: str, brand_name: str, keywords: str, limit: int = 70) -> List[UnifiedProduct]:
        """从 Pepperjam API 获取特定项目 (广告商) 的产品，并按关键词过滤。"""
        if not self.pepperjam_client:
            self.logger.warning("Pepperjam API 客户端不可用，无法获取产品。")
            return []

        self.logger.info(f"正在从 Pepperjam API 获取品牌 '{brand_name}' (Program ID: {program_id}) 的产品，关键词: '{keywords}', 限制: {limit}")
        unified_products: List[UnifiedProduct] = []
        try:
            # PepperjamPublisherAPI.get_publisher_product_creatives 支持 keywords, program_ids, limit
            # 我们将 program_ids 设置为单个 program_id
            # API 最多返回2500条，我们客户端截取 limit
            raw_pj_data = self.pepperjam_client.get_publisher_product_creatives(
                program_ids=program_id,
                keywords=keywords,
                page=1, # 假设我们只需要第一页，或实现分页逻辑
                limit=2500 # 获取API允许的最大数量，然后客户端截取
            )

            if raw_pj_data and raw_pj_data.get('meta', {}).get('status', {}).get('code') == 200 and 'data' in raw_pj_data:
                products_list = raw_pj_data['data']
                count = 0
                for pj_prod_data in products_list:
                    unified_prod = self._pepperjam_product_to_unified(pj_prod_data, brand_name, program_id)
                    if unified_prod:
                        unified_products.append(unified_prod)
                        count += 1
                        if count >= limit:
                            break # 已达到我们为该品牌请求的上限
            else:
                status_code = raw_pj_data.get('meta', {}).get('status', {}).get('code') if raw_pj_data and raw_pj_data.get('meta') else "N/A"
                error_msg = raw_pj_data.get('meta', {}).get('status', {}).get('message') if raw_pj_data and raw_pj_data.get('meta') else "No data returned or error"
                self.logger.error(f"从 Pepperjam API 获取品牌 '{brand_name}' (Program ID: {program_id}) 的产品失败。状态码: {status_code}, 消息: {error_msg}")

        except Exception as e:
            self.logger.error(f"从 Pepperjam API 获取品牌 '{brand_name}' (Program ID: {program_id}) 产品时发生错误: {e}", exc_info=True)
        
        self.logger.info(f"为品牌 '{brand_name}' (Pepperjam) 获取并转换了 {len(unified_products)} 个产品。")
        return unified_products

# 示例用法:
if __name__ == '__main__':
    # 配置基本日志记录 (如果直接运行此文件进行测试)
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
    logger_main = logging.getLogger(__name__) # 获取主模块的 logger

    retriever = ProductRetriever()

    # 测试 CJ (需要配置 .env 和 CJ_product_fetcher.py 中的 CJ_API_TOKEN, COMPANY_ID)
    # 假设 CJ_product_fetcher.search_products 已被修改为接受 advertiserIds，或者我们在此进行客户端过滤
    # 当前 CJ_product_fetcher.search_products 不接受 advertiser_id, 我们在 fetch_cj_products 中进行客户端筛选
    logger_main.info("\n--- 测试 CJ API 获取 ---")
    # 需要一个真实的 CJ advertiser ID 和关键词来进行有效测试
    # 例如: Dreo (ID: 6088764)
    if cj_search_products and os.getenv('CJ_API_TOKEN') and os.getenv('BRAND_CID'):
        cj_products_test = retriever.fetch_cj_products(advertiser_id='6088764', brand_name='Dreo', keywords='air fryer', limit=5)
        if cj_products_test:
            logger_main.info(f"获取到 {len(cj_products_test)} 个 CJ 产品:")
            for i, prod in enumerate(cj_products_test):
                logger_main.info(f"  {i+1}. {prod.title} (SKU: {prod.sku}, Price: {prod.price} {prod.currency}, Available: {prod.availability})")
        else:
            logger_main.warning("未能从 CJ 获取测试产品。")
    else:
        logger_main.warning("跳过 CJ API 测试，因为客户端或凭证未完全配置。")

    # 测试 Pepperjam (需要配置 .env 和 PepperjamPublisherAPI 的 ASCEND_API_KEY)
    logger_main.info("\n--- 测试 Pepperjam API 获取 ---")
    # 需要一个真实的 Pepperjam program ID 和关键词
    # 例如，用户提供的 program_id = '6200'
    if retriever.pepperjam_client and os.getenv('ASCEND_API_KEY'):
        pj_products_test = retriever.fetch_pepperjam_products(program_id='6200', brand_name='YourPepperjamBrand', keywords='boots', limit=5)
        if pj_products_test:
            logger_main.info(f"获取到 {len(pj_products_test)} 个 Pepperjam 产品:")
            for i, prod in enumerate(pj_products_test):
                logger_main.info(f"  {i+1}. {prod.title} (SKU: {prod.sku}, Price: {prod.price} {prod.currency}, Available: {prod.availability})")
        else:
            logger_main.warning("未能从 Pepperjam 获取测试产品。")
    else:
        logger_main.warning("跳过 Pepperjam API 测试，因为客户端或凭证未完全配置。") 