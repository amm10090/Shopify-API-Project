import os
from typing import List, Dict, Any, Optional
from loguru import logger # 导入 loguru logger
import re # 导入 re

from Core.data_models import UnifiedProduct
from Core.product_retriever import ProductRetriever
from Shopify.shopify_connector import ShopifyConnector

# BRAND_CONFIG 将定义品牌与API的映射关系
# 示例 (用户需要根据实际情况配置此项，可以放在config.py或此处):
# 注意：用户提供的 CJ 品牌列表在 cj_batch_fetch.py 中，Ascend品牌ID是6200
BRAND_CONFIG: Dict[str, Dict[str, str]] = {
    # CJ Brands (从 cj_batch_fetch.py 获取，并假设API类型为 'cj')
    "Canada Pet Care": {"api_type": "cj", "id": "4247933"},
    "Dreo": {"api_type": "cj", "id": "6088764"},
    "GeorgiaBoot.com": {"api_type": "cj", "id": "6284907"},
    "Power Systems": {"api_type": "cj", "id": "3056145"},
    "RockyBoots.com": {"api_type": "cj", "id": "6284903"},
    "Trina Turk": {"api_type": "cj", "id": "5923714"},
    "Xtratuf": {"api_type": "cj", "id": "5535819"},
    # Ascend/Pepperjam Brand (用户提供 ID 6200)
    # 我们需要为这个品牌起一个名字，例如 "PepperjamBrand6200"
    "PepperjamBrand6200": {"api_type": "pepperjam", "id": "6200"} 
}

# Shopify元字段配置 (用于存储联盟链接)
METAFIELD_NAMESPACE = "custom" # 或者 'affiliate', 'sync' 等
METAFIELD_KEY_AFFILIATE_LINK = "affiliate_link"
# 根据 Shopify API，URL 类型应该是 'url'
METAFIELD_VALUE_TYPE_URL = "url" 
# 旧的API版本或某些库可能使用 'single_line_text_field' 作为URL的容器，但 'url' 更标准

class SyncOrchestrator:
    """编排从API获取产品并同步到Shopify的整个流程。"""

    PRODUCTS_PER_BRAND_TARGET = 50 # 每个品牌的目标产品数量
    API_FETCH_LIMIT_MULTIPLIER = 1.5 # 获取API产品时，请求数量的乘数，以便有足够产品筛选

    def __init__(self, dry_run: bool = False): # 添加 dry_run 参数
        self.dry_run = dry_run # 存储 dry_run 状态
        self.product_retriever = ProductRetriever()
        # 将 dry_run 传递给 ShopifyConnector
        self.shopify_connector = ShopifyConnector(dry_run=self.dry_run) 
        self.brand_config = BRAND_CONFIG # 可以考虑从外部文件加载此配置
        # self.logger = logging.getLogger(__name__) # 获取 logger 实例 - Loguru不需要这个

    def _generate_sku(self, brand_name: str, source_api: str, source_product_id: str) -> str:
        """根据品牌名、API来源和API产品ID生成标准化的SKU。"""
        brand_slug = brand_name.upper().replace(' ', '_').replace('.', '')
        api_slug = source_api.upper()
        # 确保 source_product_id 不含特殊字符，适合SKU
        safe_source_product_id = str(source_product_id).replace(' ', '-') 
        return f"{brand_slug}-{api_slug}-{safe_source_product_id}"

    def _filter_products_by_keywords(self, products: List[UnifiedProduct], user_keywords: List[str]) -> List[UnifiedProduct]:
        """根据用户提供的关键词列表筛选产品。"""
        if not user_keywords:
            return products # 如果没有关键词，返回所有产品
        
        filtered_products: List[UnifiedProduct] = []
        for product in products:
            product.keywords_matched = [] # 重置匹配的关键词
            match_found = False
            for keyword in user_keywords:
                kw_lower = keyword.lower()
                # 检查标题和描述是否包含关键词 (不区分大小写)
                if (product.title and kw_lower in product.title.lower()) or \
                   (product.description and kw_lower in product.description.lower()):
                    if keyword not in product.keywords_matched:
                        product.keywords_matched.append(keyword)
                    match_found = True
            
            if match_found:
                filtered_products.append(product)
        return filtered_products

    def run_sync_for_brand(self, brand_name: str, user_keywords_str: Optional[str] = None):
        """
        为单个品牌执行同步流程。

        Args:
            brand_name (str): 要同步的品牌名称 (必须在 BRAND_CONFIG 中定义)。
            user_keywords_str (Optional[str]): 用户提供的逗号分隔的关键词字符串 (可选)。
        """
        logger.info(f"--- 开始为品牌 '{brand_name}' 同步 (关键词: {user_keywords_str or '无'}) ---")
        
        if brand_name not in self.brand_config:
            logger.error(f"品牌 '{brand_name}' 未在 BRAND_CONFIG 中配置。跳过此品牌。")
            return

        config = self.brand_config[brand_name]
        api_type = config['api_type']
        api_id = config['id']

        user_keywords = [kw.strip() for kw in user_keywords_str.split(',')] if user_keywords_str else []

        # 1. 从API获取产品数据
        raw_api_products: List[UnifiedProduct] = []
        fetch_limit = int(self.PRODUCTS_PER_BRAND_TARGET * self.API_FETCH_LIMIT_MULTIPLIER)
        
        # 将关键词列表转换为空格分隔的字符串，因为某些API客户端可能期望这种格式
        keywords_for_api = ' '.join(user_keywords) if user_keywords else "" # 如果没有关键词，则为空字符串
        # 注意: CJ Retriever 的 fetch_cj_products 内部使用单个关键词参数，
        # 而 Pepperjam Retriever 的 fetch_pepperjam_products 也使用单个关键词字符串。
        # 如果API期望不同的关键词格式，需要在此处调整或在Retriever中处理。
        # 对于我们的实现，`keywords_for_api` 将是一个空格分隔的字符串。

        if api_type == 'cj':
            raw_api_products = self.product_retriever.fetch_cj_products(
                advertiser_id=api_id, 
                brand_name=brand_name, 
                keywords=keywords_for_api, # 传递给CJ Retriever
                limit=fetch_limit
            )
        elif api_type == 'pepperjam':
            raw_api_products = self.product_retriever.fetch_pepperjam_products(
                program_id=api_id, 
                brand_name=brand_name, 
                keywords=keywords_for_api, # 传递给Pepperjam Retriever
                limit=fetch_limit
            )
        else:
            logger.error(f"未知的 API 类型 '{api_type}' 配置给品牌 '{brand_name}'。")
            return

        if not raw_api_products:
            logger.warning(f"未能从 API ({api_type}) 获取品牌 '{brand_name}' 的任何产品。结束此品牌的同步。")
            return
        logger.info(f"从 API ({api_type}) 为品牌 '{brand_name}' 获取到 {len(raw_api_products)} 个原始产品。")

        # 2. 过滤产品 (有货优先，然后按关键词，最后取目标数量)
        available_products = [p for p in raw_api_products if p.availability]
        logger.info(f"其中 {len(available_products)} 个产品有货。")

        # 根据用户提供的关键词进行筛选 (如果提供了关键词)
        # _filter_products_by_keywords 会处理空关键词列表的情况
        keyword_filtered_products = self._filter_products_by_keywords(available_products, user_keywords)
        if user_keywords:
            logger.info(f"根据关键词 '{user_keywords_str}' 筛选后剩下 {len(keyword_filtered_products)} 个产品。")
        else:
            logger.info("未提供关键词，使用所有有货产品进行下一步。")

        # 选择最终要同步的产品列表 (取前N个)
        final_products_to_sync = keyword_filtered_products[:self.PRODUCTS_PER_BRAND_TARGET]
        logger.info(f"最终选择 {len(final_products_to_sync)} 个产品进行 Shopify 同步。")

        # 3. Shopify 主草稿产品系列管理
        master_collection_title = f"{brand_name} - API Products - Draft"
        # 生成 handle (可选，Shopify会自动生成，但提供一个可以更可控)
        temp_handle = brand_name.lower() + "-api-products-draft"
        master_collection_handle = re.sub(r'[^a-z0-9-]+', '-', temp_handle)
        master_collection_handle = re.sub(r'-+$', '', master_collection_handle).strip('-')
        
        logger.info(f"确保主草稿产品系列 '{master_collection_title}' (handle: {master_collection_handle}) 存在且为草稿状态...")
        try:
            shopify_master_collection = self.shopify_connector.get_or_create_collection(
                title=master_collection_title, 
                handle=master_collection_handle, 
                published=False,
                body_html=f"Automatically synced products for {brand_name} from {api_type.upper()} API. For internal review and activation."
            )
            if not shopify_master_collection:
                logger.error(f"无法获取或创建主草稿产品系列 '{master_collection_title}'。中止品牌 '{brand_name}' 的同步。")
                return
            logger.info(f"主草稿产品系列 '{shopify_master_collection.title}' (ID: {shopify_master_collection.id}) 已就绪。")
        except Exception as e_coll:
            logger.error(f"处理主草稿产品系列时出错: {e_coll}。中止品牌 '{brand_name}' 的同步。", exc_info=True)
            return

        # 4. 获取当前主草稿产品系列中的产品SKU，用于后续比较和清理
        current_skus_in_master_collection: List[str] = []
        try:
            # 需要一个方法来获取产品系列中的所有产品，然后提取SKU
            # shopify_connector 中可以添加 get_products_in_collection(collection_id)
            # 暂时简化：这个清理逻辑比较复杂，先关注产品创建/更新
            logger.debug("获取主草稿产品系列中现有产品的逻辑尚未完全实现，旧产品清理可能不完整。")
        except Exception as e_get_coll_prods:
            logger.warning(f"获取主草稿产品系列中现有产品时出错: {e_get_coll_prods}")

        # 5. 同步产品到 Shopify
        synced_skus_this_run = set()
        for unified_product in final_products_to_sync:
            # 生成/确保 SKU
            if not unified_product.sku: # 理论上 UnifiedProduct 的 __post_init__ 已处理
                unified_product.sku = self._generate_sku(brand_name, api_type, unified_product.source_product_id)
            synced_skus_this_run.add(unified_product.sku)

            logger.info(f"处理产品: {unified_product.title} (SKU: {unified_product.sku})")
            try:
                existing_shopify_product = self.shopify_connector.get_product_by_sku(unified_product.sku)
                
                shopify_product_to_manage = None

                if existing_shopify_product:
                    logger.info(f"产品 SKU '{unified_product.sku}' 已存在于 Shopify (ID: {existing_shopify_product.id})。准备更新...")
                    # 重要: 根据之前的决策，如果产品已被用户激活，我们只更新数据，不改变其状态或集合
                    # ShopifyConnector.update_product 内部不改变已激活产品的状态
                    shopify_product_to_manage = self.shopify_connector.update_product(existing_shopify_product.id, unified_product)
                    if shopify_product_to_manage:
                        # 联盟链接元字段
                        self.shopify_connector.set_product_metafield(
                            shopify_product_id=shopify_product_to_manage.id,
                            namespace=METAFIELD_NAMESPACE,
                            key=METAFIELD_KEY_AFFILIATE_LINK,
                            value=unified_product.product_url,
                            value_type=METAFIELD_VALUE_TYPE_URL # 使用 'url' 类型
                        )
                        logger.debug(f"产品 {shopify_product_to_manage.id} 的联盟链接元字段已更新/设置。")
                        # 如果产品是草稿状态，确保它在主草稿集合中
                        if shopify_product_to_manage.published_at is None: 
                            self.shopify_connector.add_product_to_collection(shopify_product_to_manage.id, shopify_master_collection.id)
                else:
                    logger.info(f"产品 SKU '{unified_product.sku}' 不存在于 Shopify。准备创建...")
                    # 新产品默认为 draft 状态，并由 create_product 处理
                    new_shopify_product = self.shopify_connector.create_product(unified_product, status='draft')
                    if new_shopify_product:
                        shopify_product_to_manage = new_shopify_product
                        # 添加到主草稿产品系列
                        self.shopify_connector.add_product_to_collection(new_shopify_product.id, shopify_master_collection.id)
                        logger.info(f"新产品 {new_shopify_product.id} 已添加到主草稿产品系列。")
                        # 设置联盟链接元字段
                        self.shopify_connector.set_product_metafield(
                            shopify_product_id=new_shopify_product.id,
                            namespace=METAFIELD_NAMESPACE,
                            key=METAFIELD_KEY_AFFILIATE_LINK,
                            value=unified_product.product_url,
                            value_type=METAFIELD_VALUE_TYPE_URL
                        )
                        logger.info(f"新产品 {new_shopify_product.id} 的联盟链接元字段已设置。")
                
                # 可以在这里记录 unified_product.shopify_product_id (如果需要回写到 UnifiedProduct 对象)
                if shopify_product_to_manage and hasattr(shopify_product_to_manage, 'id'):
                    unified_product.shopify_product_id = shopify_product_to_manage.id

            except Exception as e_prod_sync:
                logger.error(f"同步产品 '{unified_product.title}' (SKU: {unified_product.sku}) 到 Shopify 时发生错误: {e_prod_sync}", exc_info=True)
                # 考虑是否要继续处理下一个产品，或者中止整个品牌的同步
                continue # 继续处理下一个产品

        # 6. 处理不再同步的产品 (从主草稿产品系列中移除或归档)
        # 这是复杂部分：需要获取 shopify_master_collection 中的所有产品，
        # 比较它们的SKU与 synced_skus_this_run。
        # 对于存在于集合中但不在 synced_skus_this_run 中的产品，如果它们是由脚本管理的（例如，是草稿状态），则进行处理。
        # 暂时简化：此步骤的完整实现需要 ShopifyConnector 中有 `get_products_in_collection` 等辅助方法。
        # 我们会在后续迭代中完善此清理逻辑。
        logger.info(f"品牌 '{brand_name}' 的产品同步初步完成。共处理 {len(final_products_to_sync)} 个选定产品。")
        logger.warning(f"清理主草稿产品系列中不再同步的旧产品的逻辑需要进一步实现。")
        logger.info(f"--- 品牌 '{brand_name}' 同步结束 ---")

    def run_full_sync(self, keywords_by_brand: Optional[Dict[str, str]] = None):
        """
        为 BRAND_CONFIG 中定义的所有品牌执行同步。

        Args:
            keywords_by_brand (Optional[Dict[str, str]]): 一个字典，键是品牌名称，值是该品牌的逗号分隔关键词字符串。
                                                       如果未提供或某品牌无关键词，则该品牌不按关键词筛选。
        """
        logger.info("\n=== 开始对所有已配置品牌进行全面同步 ===")
        if keywords_by_brand is None:
            keywords_by_brand = {}
        
        for brand_name in self.brand_config.keys():
            brand_keywords_str = keywords_by_brand.get(brand_name)
            self.run_sync_for_brand(brand_name, user_keywords_str=brand_keywords_str)
        
        logger.info("\n=== 所有品牌全面同步结束 ===")

# 示例用法 (将在 main.py 中调用)
if __name__ == '__main__':
    # 配置基本日志记录 (如果直接运行此文件进行测试)
    # logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(module)s - %(message)s')
    # print("正在初始化 SyncOrchestrator...")
    # logger_main = logging.getLogger(__name__)
    # logger_main.info("正在初始化 SyncOrchestrator 用于测试...")
    # 使用导入的 logger
    logger.info("正在初始化 SyncOrchestrator 用于测试 (Loguru)...")
    orchestrator = SyncOrchestrator(dry_run=True) # 测试时默认使用 dry_run
    # print("SyncOrchestrator 初始化完成。")
    logger.info("SyncOrchestrator 初始化完成。")

    # 测试单个品牌同步
    # 示例：同步 Dreo 品牌，使用关键词 "air fryer, smart fan"
    # 需要确保 BRAND_CONFIG 和您的 .env 文件设置正确
    if 'Dreo' in orchestrator.brand_config and os.getenv('CJ_API_TOKEN') and os.getenv('SHOPIFY_STORE_NAME'):
        logger.info("\n--- 测试为品牌 'Dreo' 同步 (Dry Run) ---")
        orchestrator.run_sync_for_brand('Dreo', user_keywords_str='air fryer, smart fan')
    else:
        logger.warning("跳过 'Dreo' 品牌同步测试，因为未在 BRAND_CONFIG 中配置或缺少必要的 CJ/Shopify 凭证。")

    # 示例：同步 Pepperjam 品牌，无关键词 (获取该品牌常规产品)
    if 'PepperjamBrand6200' in orchestrator.brand_config and os.getenv('ASCEND_API_KEY') and os.getenv('SHOPIFY_STORE_NAME'):
        logger.info("\n--- 测试为品牌 'PepperjamBrand6200' 同步 (无关键词, Dry Run) ---")
        orchestrator.run_sync_for_brand('PepperjamBrand6200') # 无关键词
    else:
        logger.warning("跳过 'PepperjamBrand6200' 品牌同步测试，因为未在 BRAND_CONFIG 中配置或缺少必要的 Pepperjam/Shopify 凭证。")

    # # 测试全面同步 (可选，如果配置了多个品牌和关键词)
    # print("\n--- 测试全面同步 (可选) ---")
    # logger_main.info("\n--- 测试全面同步 (Dry Run, 可选) ---") # 更新为logger
    # keywords_for_all = {
    #     "Dreo": "home, kitchen",
    #     "PepperjamBrand6200": "shoes"
    # }
    # orchestrator.run_full_sync(keywords_by_brand=keywords_for_all) 