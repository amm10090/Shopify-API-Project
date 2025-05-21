import os
from typing import List, Dict, Any, Optional
from loguru import logger # 导入 loguru logger
import re # 导入 re
import json # Add import
from datetime import datetime # Add import
from pathlib import Path # Add import
import dataclasses # Add import

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
    # Ascend/Pepperjam Brands - Updated by user
    "Le Creuset": {"api_type": "pepperjam", "id": "6200"}, 
    "BOMBAS": {"api_type": "pepperjam", "id": "8171"},
    "Ashworth Golf International LLC": {"api_type": "pepperjam", "id": "10135"},
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

    def __init__(self, dry_run: bool = False, test_mode: bool = False, fetch_only: bool = False, product_limit: Optional[int] = None, output_raw_response: bool = False, skip_image_validation: bool = False):
        """初始化 SyncOrchestrator。"""
        self.dry_run = dry_run
        self.fetch_only = fetch_only
        self.test_mode = test_mode
        self.product_limit = product_limit or (1 if test_mode else 75)
        self.output_raw_response = output_raw_response
        self.skip_image_validation = skip_image_validation
        logger.info(f"SyncOrchestrator 初始化接收参数: dry_run={dry_run}, test_mode={test_mode}, fetch_only={fetch_only}, product_limit={product_limit}, skip_image_validation={skip_image_validation}")
        logger.info(f"SyncOrchestrator 实例属性: self.dry_run={self.dry_run}, self.test_mode={self.test_mode}, self.fetch_only={self.fetch_only}, self.product_limit={self.product_limit}, self.skip_image_validation={self.skip_image_validation}")
        
        self.successful_brands_count: int = 0
        self.failed_brands_info: Dict[str, str] = {}

        if self.test_mode:
            # self.PRODUCTS_PER_BRAND_TARGET = 1 # 移除或注释掉此行
            logger.info("测试模式已在 SyncOrchestrator 中激活。产品获取数量将根据关键词调整，或默认为1（无关键词时）。")
            
        self.product_retriever = ProductRetriever(skip_image_validation=self.skip_image_validation)
        
        # 初始化Shopify连接器
        if not fetch_only:
            try:
                self.shopify_connector = ShopifyConnector()
            except ImportError:
                logger.warning("未能导入ShopifyConnector。请确保Shopify模块已安装和配置，如需使用Shopify功能。")
                self.shopify_connector = None
        else:
            self.shopify_connector = None
            
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
        """根据用户提供的关键词列表筛选产品 (OR 逻辑)。"""
        if not user_keywords:
            return products # 如果没有关键词，返回所有产品
        
        filtered_products: List[UnifiedProduct] = []
        for product in products:
            product.keywords_matched = [] # 清空之前可能存在的匹配
            
            # 如果产品已经由API关键词搜索获取，直接视为匹配
            if hasattr(product, 'keywords_matched') and product.keywords_matched:
                # 产品已经被标记为匹配特定关键词(由API搜索返回)
                filtered_products.append(product)
                logger.debug(f"产品 '{product.title}' 已由API关键词搜索获取，自动视为匹配.")
                continue
                
            any_phrase_matched_for_this_product = False # 先假设产品不匹配任何关键词
            
            for keyword_phrase in user_keywords: # keyword_phrase 是 "Work Boot" 或 "Waterproof"
                phrase_lower = keyword_phrase.lower()
                # 检查当前短语是否在标题或描述中
                if (product.title and phrase_lower in product.title.lower()) or \
                   (product.description and phrase_lower in product.description.lower()):
                    any_phrase_matched_for_this_product = True # 只要有一个短语匹配，则此产品符合OR条件
                    product.keywords_matched.append(keyword_phrase) # 记录匹配的关键词
            
            if any_phrase_matched_for_this_product:
                filtered_products.append(product)
        
        logger.debug(f"关键词筛选结果: 共 {len(filtered_products)}/{len(products)} 个产品匹配了至少一个关键词")
        return filtered_products

    def _save_dry_run_export(self, products: List[UnifiedProduct], brand_name: str):
        """在 dry_run 模式下将获取的产品列表保存到 JSON 文件。"""
        if not products:
            logger.warning(f"DRY RUN (JSON): 品牌 '{brand_name}' 没有匹配的产品可导出。")
            return
            
        try:
            output_dir = Path("output") / "dry_run_exports"
            output_dir.mkdir(parents=True, exist_ok=True)
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            # 清理品牌名称以用于文件名
            safe_brand_name = re.sub(r'[^\w.-]+', '_', brand_name) # Original regex for JSON, ensure hyphen at end for safety.
            file_path = output_dir / f"dry_run_export_{safe_brand_name}_{timestamp}.json"
            
            # 将 UnifiedProduct 对象列表转换为字典列表
            products_dict_list = [dataclasses.asdict(p) for p in products]
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(products_dict_list, f, indent=2, ensure_ascii=False)
            
            logger.info(f"DRY RUN (JSON): 已将 {len(products)} 个产品导出到: {file_path}")
        except Exception as e:
            logger.error(f"DRY RUN (JSON): 保存JSON导出文件时出错 for brand '{brand_name}': {e}", exc_info=True)

    def _generate_markdown_for_product(self, product: UnifiedProduct, index: int) -> str:
        """Generates a Markdown string for a single UnifiedProduct."""
        markdown_parts = []
        markdown_parts.append(f"## {index}. {product.title if product.title else 'N/A'}")
        markdown_parts.append(f"- **SKU:** `{product.sku if product.sku else 'N/A'}`")
        markdown_parts.append(f"- **Source API:** `{product.source_api if product.source_api else 'N/A'}`")
        markdown_parts.append(f"- **Source Product ID:** `{product.source_product_id if product.source_product_id else 'N/A'}`")
        markdown_parts.append(f"- **Brand:** `{product.brand_name if product.brand_name else 'N/A'}`")

        price_str = f"{product.price} {product.currency}" if product.price is not None and product.currency else "N/A"
        if product.currency == "USD":
            price_str = f"${product.price:.2f} {product.currency}" if product.price is not None else "N/A"
        markdown_parts.append(f"- **Price:** {price_str}")

        if product.sale_price is not None and product.price is not None and product.sale_price < product.price:
            sale_price_str = f"{product.sale_price} {product.currency}"
            if product.currency == "USD":
                sale_price_str = f"${product.sale_price:.2f} {product.currency}"
            markdown_parts.append(f"- **Sale Price:** {sale_price_str}")

        availability_str = "Available" if product.availability else "Out of Stock"
        markdown_parts.append(f"- **Availability:** {availability_str}")

        if product.categories:
            markdown_parts.append("- **Categories:**")
            for cat in product.categories:
                markdown_parts.append(f"    - {cat}")
        
        if product.keywords_matched:
            markdown_parts.append("- **Matched Keywords:**")
            for kw in product.keywords_matched:
                markdown_parts.append(f"    - {kw}")

        markdown_parts.append(f"- **Affiliate Link:** {product.product_url if product.product_url else 'N/A'}")
        markdown_parts.append(f"- **Image URL:** {product.image_url if product.image_url else 'N/A'}")
        
        description_snippet = (product.description[:250] + '...') if product.description and len(product.description) > 250 else (product.description if product.description else 'N/A')
        markdown_parts.append("- **Description:**")
        markdown_parts.append(f"  ```")
        markdown_parts.append(f"  {description_snippet}")
        markdown_parts.append(f"  ```")
        markdown_parts.append("\n---") # Separator

        return "\n".join(markdown_parts)

    def _save_markdown_dry_run_export(self, products: List[UnifiedProduct], brand_name: str):
        """Saves the list of products to a Markdown file during a dry run."""
        if not products:
            logger.warning(f"DRY RUN (MD): 品牌 '{brand_name}' 没有匹配的产品可导出。")
            return

        try:
            output_dir = Path("output") / "dry_run_exports"
            output_dir.mkdir(parents=True, exist_ok=True)
            
            current_time = datetime.now()
            timestamp_file = current_time.strftime('%Y%m%d_%H%M%S')
            timestamp_header = current_time.strftime('%Y-%m-%d %H:%M:%S')

            safe_brand_name = re.sub(r'[^\w.-]+', '_', brand_name) # Allow word chars, dots, hyphens. Hyphen at end for safety.
            file_path = output_dir / f"dry_run_export_MD_{safe_brand_name}_{timestamp_file}.md"
            
            markdown_content_parts = []
            markdown_content_parts.append(f"# Dry Run Export: {brand_name} - {timestamp_header}")
            markdown_content_parts.append(f"\nTotal products to be synced for this brand: {len(products)}\n")
            markdown_content_parts.append("---")

            for i, product in enumerate(products):
                markdown_content_parts.append(self._generate_markdown_for_product(product, i + 1))
            
            full_markdown_content = "\n".join(markdown_content_parts)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(full_markdown_content)
            
            logger.info(f"DRY RUN (MD): Exported {len(products)} products for brand '{brand_name}' to: {file_path}")

        except Exception as e:
            logger.error(f"DRY RUN (MD): Error saving Markdown export for brand '{brand_name}': {e}", exc_info=True)

    def run_sync_for_brand(self, brand_name: str, user_keywords_str: Optional[str] = None):
        """
        为单个品牌执行同步流程。

        Args:
            brand_name (str): 要同步的品牌名称 (必须在 BRAND_CONFIG 中定义)。
            user_keywords_str (Optional[str]): 用户提供的关键词字符串，可以是逗号分隔的字符串。
                这些关键词将根据API类型进行处理：
                - 对于Pepperjam API，每个关键词短语将单独发送查询
                - 对于CJ API，关键词将用于本地筛选返回的产品
        """
        logger.info(f"--- 开始为品牌 '{brand_name}' 同步 (关键词: {user_keywords_str or '无'}) ---")
        
        if brand_name not in self.brand_config:
            logger.error(f"品牌 '{brand_name}' 未在 BRAND_CONFIG 中配置。将其标记为失败。")
            self.failed_brands_info[brand_name] = "品牌未在 BRAND_CONFIG 中配置"
            return

        config = self.brand_config[brand_name]
        api_type = config['api_type']
        api_id = config['id']

        # 处理关键词字符串 - 根据API类型不同处理方式也不同
        user_keywords = []
        if user_keywords_str:
            if api_type == 'cj':
                # CJ API需要拆分关键词以进行本地筛选
                user_keywords = [kw.strip() for kw in user_keywords_str.split(',')]
                logger.debug(f"CJ API: 关键词已拆分为: {user_keywords}")
            elif api_type == 'pepperjam':
                # Pepperjam API需要完整关键词短语，以逗号分隔的不同短语
                user_keywords = [kw.strip() for kw in user_keywords_str.split(',')]
                logger.debug(f"Pepperjam API: 关键词短语列表为: {user_keywords}")
        else:
            logger.debug(f"未提供关键词字符串，继续获取产品而不使用关键词筛选。")

        # 1. 从API获取产品数据
        raw_api_products: List[UnifiedProduct] = []
        
        if self.test_mode and user_keywords:
            logger.info(f"测试模式：品牌 '{brand_name}' 将为每个提供的关键词尝试获取产品。")
            all_test_mode_products: List[UnifiedProduct] = []
            processed_product_source_ids: set = set()
            test_fetch_limit_per_keyword: int = 3 # 尝试获取3个，以增加命中机会，后续只选1个

            for keyword_item in user_keywords:
                logger.debug(f"测试模式：品牌 '{brand_name}', 为关键词 '{keyword_item}' 获取产品 (limit: {test_fetch_limit_per_keyword})...")
                current_keyword_products: List[UnifiedProduct] = []
                if test_fetch_limit_per_keyword < 2: test_fetch_limit_per_keyword = 2 # 至少为2
                
                if api_type == 'cj':
                    # 使用CJ API查询特定关键词
                    logger.debug(f"CJ API: 为关键词 '{keyword_item}' 获取产品")
                    keyword_specific_products = self.product_retriever.fetch_cj_products(
                        advertiser_id=api_id,
                        brand_name=brand_name,
                        keywords_list=[keyword_item],  # 单个关键词进行AND匹配
                        limit=test_fetch_limit_per_keyword,
                        output_raw_response=self.output_raw_response
                    )
                elif api_type == 'pepperjam':
                    # 使用Pepperjam API查询特定关键词 - 每个关键词单独API调用
                    logger.debug(f"Pepperjam API: 为关键词短语 '{keyword_item}' 获取产品")
                    keyword_specific_products = self.product_retriever.fetch_pepperjam_products(
                        program_id=api_id,
                        brand_name=brand_name,
                        keywords_list=[keyword_item],  # 作为单个关键词单独API调用
                        limit=test_fetch_limit_per_keyword,
                        process_all=True,  # 处理所有API返回的产品
                        output_raw_response=self.output_raw_response
                    )
                
                for p in keyword_specific_products:
                    if p.source_product_id not in processed_product_source_ids:
                        p.keywords_matched = [keyword_item] # 标记产品是由哪个关键词获取的
                        all_test_mode_products.append(p)
                        processed_product_source_ids.add(p.source_product_id)
                        # 如果我们只想严格每个关键词一个，并且获取limit为1时，可以在这里break
                        # 但由于limit可能大于1，我们收集所有独特的，然后在选择阶段精确挑选
            raw_api_products = all_test_mode_products
            logger.info(f"测试模式：为品牌 '{brand_name}' 通过 {len(user_keywords)} 个关键词共获取到 {len(raw_api_products)} 个独立候选产品。")
        else:
            # 非测试模式，或测试模式但无关键词：使用原有逻辑
            fetch_limit = int(self.PRODUCTS_PER_BRAND_TARGET * self.API_FETCH_LIMIT_MULTIPLIER)
            if self.test_mode: # 测试模式但无关键词，目标为1个产品
                fetch_limit = int(1 * self.API_FETCH_LIMIT_MULTIPLIER) # 获取少量用于选择1个
            
            logger.debug(f"品牌 '{brand_name}', API类型 '{api_type}', 完整关键词列表: {user_keywords}, 获取限制: {fetch_limit}")
            if api_type == 'cj':
                logger.info(f"通过 CJ API 为品牌 '{brand_name}' 获取产品...")
                raw_api_products = self.product_retriever.fetch_cj_products(
                    advertiser_id=api_id,
                    brand_name=brand_name,
                    keywords_list=user_keywords,
                    limit=self.product_limit,
                    output_raw_response=self.output_raw_response
                )
            elif api_type == 'pepperjam':
                logger.info(f"通过 Pepperjam API 为品牌 '{brand_name}' 获取产品...")
                raw_api_products = self.product_retriever.fetch_pepperjam_products(
                    program_id=api_id,
                    brand_name=brand_name,
                    keywords_list=user_keywords,
                    limit=self.product_limit,
                    process_all=True,  # 处理所有API返回的产品
                    output_raw_response=self.output_raw_response
                )

        if not raw_api_products:
            base_log_message = f"未能从 API ({api_type}) 为品牌 '{brand_name}' 获取任何产品。"
            base_failure_reason = f"API产品获取失败 (未从 {api_type} 返回任何产品)"
            
            detailed_parts = []
            reason_parts = []

            if self.test_mode:
                detailed_parts.append("测试模式：")
                reason_parts.append("(测试模式下)")

            if user_keywords_str:
                detailed_parts.append(f"尝试的关键词为: '{user_keywords_str}'.")
                reason_parts.insert(0, f"尝试的关键词: '{user_keywords_str}'.") # 插入到原因前面
            
            log_message = f"{' '.join(detailed_parts)} {base_log_message}"
            if not detailed_parts: # 如果没有详细信息部分，则使用原始基础消息避免前导空格
                log_message = base_log_message
            else:
                log_message += " 详细的API调用日志请参见 ProductRetriever 输出。"

            failure_reason = f"{' '.join(reason_parts)} {base_failure_reason}"
            if not reason_parts: # 如果没有原因的附加部分
                 failure_reason = base_failure_reason
            else: # 确保基础原因在前面
                failure_reason = f"{base_failure_reason} ({' '.join(reason_parts).strip()})"


            logger.bind(brand_fetch_error=True).warning(log_message.strip() + " 将其标记为获取失败。")
            self.failed_brands_info[brand_name] = failure_reason.strip()
            return

        logger.info(f"从 API ({api_type}) 为品牌 '{brand_name}' 获取到 {len(raw_api_products)} 个原始产品。")

        # 2. 过滤产品 (有货优先)
        available_products = [p for p in raw_api_products if p.availability]
        logger.info(f"其中 {len(available_products)} 个产品有货。")

        # 根据用户提供的关键词进行筛选 和 最终产品选择
        final_products_to_sync: List[UnifiedProduct] = []

        if self.test_mode and user_keywords:
            # 测试模式且有关键词: 为每个关键词选择一个产品
            keyword_filtered_products = available_products # 产品已按单个关键词获取并标记，且已筛选有货
            final_products_to_sync_map: Dict[str, UnifiedProduct] = {}
            for product in keyword_filtered_products:
                if product.keywords_matched: # 应该包含获取它的那个关键词
                    current_product_keyword = product.keywords_matched[0]
                    if current_product_keyword not in final_products_to_sync_map: # 只为每个原始关键词选一个
                        final_products_to_sync_map[current_product_keyword] = product
            
            final_products_to_sync = list(final_products_to_sync_map.values())
            logger.info(f"测试模式：为品牌 '{brand_name}'，针对 {len(user_keywords)} 个关键词，最终选定 {len(final_products_to_sync)} 个产品进行同步。")
        else:
            # 非测试模式，或测试模式但无关键词
            keyword_filtered_products = self._filter_products_by_keywords(available_products, user_keywords)
            if user_keywords and not self.test_mode : # 仅在非测试模式且有关键词时记录OR过滤结果
                 logger.info(f"根据组合关键词 '{user_keywords_str}' (OR逻辑) 筛选后剩下 {len(keyword_filtered_products)} 个产品。")
            elif not user_keywords:
                 logger.info("未提供关键词，使用所有有货产品进行下一步选择。")
            # 对于测试模式无关键词，上面已处理，这里 keyword_filtered_products 就是 available_products
            
            # 根据product_limit参数覆盖默认的PRODUCTS_PER_BRAND_TARGET值
            if self.test_mode:
                current_target_limit = 1
            elif self.product_limit is not None:
                current_target_limit = self.product_limit
                logger.info(f"使用用户指定的产品数量限制: {current_target_limit}")
            else:
                current_target_limit = self.PRODUCTS_PER_BRAND_TARGET
                
            final_products_to_sync = keyword_filtered_products[:current_target_limit]
            log_mode_detail = "测试(无关键词)" if self.test_mode else ("正常(有关键词)" if user_keywords else "正常(无关键词)")
            logger.info(f"最终选择 {len(final_products_to_sync)} 个产品进行 Shopify 同步 (模式: {log_mode_detail}, 目标: {current_target_limit}).")

        # --- Dry Run Export Logic ---
        if self.dry_run and final_products_to_sync:
            logger.info(f"DRY RUN 模式：准备导出 {len(final_products_to_sync)} 个产品到 JSON 和 Markdown...") # Updated log
            self._save_dry_run_export(final_products_to_sync, brand_name) # For JSON
            self._save_markdown_dry_run_export(final_products_to_sync, brand_name) # For Markdown
        # --- End Dry Run Export Logic ---
        
        # --- Fetch Only Export Logic ---
        if self.fetch_only:
            # 如果是API返回的产品且使用的是API关键词搜索，则无需再筛选
            products_to_export = []
            if api_type == 'pepperjam' and user_keywords: 
                # Pepperjam API已经通过关键词搜索过，直接使用所有原始产品
                products_to_export = raw_api_products
                logger.info(f"FETCH ONLY 模式：使用API关键词搜索返回的 {len(products_to_export)} 个产品直接导出，而不进行本地筛选。") 
            else:
                # 其他情况(CJ或无关键词)使用经过筛选的产品列表
                products_to_export = final_products_to_sync
                
            if products_to_export:
                logger.info(f"FETCH ONLY 模式：准备导出 {len(products_to_export)} 个产品到 JSON 和 Markdown...") 
                self._save_dry_run_export(products_to_export, brand_name) # 复用dry_run的导出功能
                self._save_markdown_dry_run_export(products_to_export, brand_name)
            else:
                logger.warning(f"FETCH ONLY 模式：品牌 '{brand_name}' 没有匹配的产品可导出。")
            
            logger.info(f"品牌 '{brand_name}' 的产品获取完成，已导出到输出目录。")
            return  # fetch_only模式下直接返回，不执行与Shopify相关的操作
        # --- End Fetch Only Export Logic ---

        # 如果是fetch_only模式，不应该继续执行以下代码
        if self.fetch_only:
            logger.warning(f"检测到fetch_only模式但代码仍继续执行，这是不应该的。将跳过品牌 '{brand_name}' 的Shopify操作。")
            return

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
                logger.error(f"无法获取或创建主草稿产品系列 '{master_collection_title}'。将品牌 '{brand_name}' 标记为失败。")
                self.failed_brands_info[brand_name] = "Shopify主产品系列处理失败 (无法获取或创建)"
                return
            logger.info(f"主草稿产品系列 '{shopify_master_collection.title}' (ID: {shopify_master_collection.id}) 已就绪。")
        except Exception as e_coll:
            logger.error(f"处理主草稿产品系列时出错: {e_coll}。将品牌 '{brand_name}' 标记为失败。", exc_info=True)
            self.failed_brands_info[brand_name] = f"Shopify主产品系列处理时发生异常: {str(e_coll)[:100]}" # Truncate long error messages
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
        product_sync_attempt_count = 0
        product_sync_success_count = 0
        logger.debug(f"在 run_sync_for_brand 中，即将使用的 shopify_connector 的 test_mode: {self.shopify_connector.test_mode}, dry_run: {self.shopify_connector.dry_run}")
        for unified_product in final_products_to_sync:
            product_sync_attempt_count += 1
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
                        product_sync_success_count +=1 # Increment success count here
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
                        product_sync_success_count +=1 # Increment success count here
                
                # 可以在这里记录 unified_product.shopify_product_id (如果需要回写到 UnifiedProduct 对象)
                if shopify_product_to_manage and hasattr(shopify_product_to_manage, 'id'):
                    unified_product.shopify_product_id = shopify_product_to_manage.id

            except Exception as e_prod_sync:
                # 尝试更安全地记录异常信息
                error_type = type(e_prod_sync).__name__
                error_message = str(e_prod_sync)
                logger.error(
                    f"同步产品 '{unified_product.title}' (SKU: {unified_product.sku}) 到 Shopify 时发生错误。 "
                    f"类型: {error_type}, 消息: {error_message}",
                    exc_info=True 
                )
                continue # 继续处理下一个产品，即使当前产品失败
        
        # 在处理完所有选定产品后检查是否有任何产品同步成功
        if final_products_to_sync and product_sync_success_count == 0: # 仅当尝试了产品但无一成功时才标记为失败
            logger.error(f"品牌 '{brand_name}'：尝试同步 {product_sync_attempt_count} 个产品，但全部失败。将其标记为品牌级同步失败。")
            self.failed_brands_info[brand_name] = "所有选定产品在同步到Shopify时均失败"
            return # 标记为失败并返回

        # 6. 处理不再同步的产品 (从主草稿产品系列中移除或归档)
        # 这是复杂部分：需要获取 shopify_master_collection 中的所有产品，
        # 比较它们的SKU与 synced_skus_this_run。
        # 对于存在于集合中但不在 synced_skus_this_run 中的产品，如果它们是由脚本管理的（例如，是草稿状态），则进行处理。
        # 暂时简化：此步骤的完整实现需要 ShopifyConnector 中有 `get_products_in_collection` 等辅助方法。
        # 我们会在后续迭代中完善此清理逻辑。
        logger.info(f"品牌 '{brand_name}' 的产品同步初步完成。共处理 {len(final_products_to_sync)} 个选定产品。")
        logger.warning(f"清理主草稿产品系列中不再同步的旧产品的逻辑需要进一步实现。")
        logger.info(f"--- 品牌 '{brand_name}' 同步结束 ---")

    def run_full_sync(self, brands_to_process: List[str], keywords_by_brand: Optional[Dict[str, str]] = None):
        """
        为 BRAND_CONFIG 中定义的所有品牌执行同步。

        Args:
            brands_to_process (List[str]): 要处理的品牌名称列表。
            keywords_by_brand (Optional[Dict[str, str]]): 一个字典，键是品牌名称，值是该品牌的逗号分隔关键词字符串。
                                                       如果未提供或某品牌无关键词，则该品牌不按关键词筛选。
        """
        self.successful_brands_count = 0
        self.failed_brands_info = {}
        
        # 根据运行模式显示不同的初始消息
        operation_type = "商品获取" if self.fetch_only else "全面同步"
        logger.info(f"\n=== 开始对指定的 {len(brands_to_process)} 个品牌进行{operation_type} (统计已重置) ===")
        
        if keywords_by_brand is None:
            keywords_by_brand = {}
        
        if not brands_to_process:
            logger.info(f"没有指定要处理的品牌列表，{operation_type}结束。")
            return

        for brand_name in brands_to_process:
            brand_keywords_str = keywords_by_brand.get(brand_name)
            # 调用 run_sync_for_brand 之前，我们不知道它是否会失败并提前返回
            # 因此，run_sync_for_brand 内部会处理失败记录
            self.run_sync_for_brand(brand_name, user_keywords_str=brand_keywords_str)
            
            # 在 run_sync_for_brand 调用之后，检查它是否将当前品牌标记为失败
            if brand_name not in self.failed_brands_info:
                self.successful_brands_count += 1
                operation_verb = "获取" if self.fetch_only else "处理"
                logger.info(f"品牌 '{brand_name}' 已成功{operation_verb}完成。")
            else:
                # 失败信息和原因已在 run_sync_for_brand 内部的失败点记录到 self.failed_brands_info
                # 并且 run_sync_for_brand 在这些点会提前 return，所以这里的日志可能不会显示每个品牌处理后的直接失败原因（如果适用）
                # 但我们可以在总结中显示它
                operation_verb = "获取" if self.fetch_only else "处理"
                logger.warning(f"品牌 '{brand_name}' {operation_verb}标记为失败。详情见总结。")
        
        # 根据运行模式显示不同的总结消息
        summary_prefix = "商品获取" if self.fetch_only else "全面同步"
        logger.info(f"\n=== {summary_prefix}处理总结 ===")
        logger.info(f"总计成功处理的品牌数量: {self.successful_brands_count}")
        
        failed_brands_count = len(self.failed_brands_info)
        logger.info(f"总计失败的品牌数量: {failed_brands_count}")
        
        if failed_brands_count > 0:
            logger.info("--- 失败品牌详情 ---")
            for brand, reason in self.failed_brands_info.items():
                logger.info(f"  - 品牌: {brand}")
                logger.info(f"    原因: {reason}")
            logger.info("--- 失败品牌详情结束 ---")
        logger.info(f"=== {summary_prefix}处理总结结束 ===")
        
        # 在fetch_only模式下添加提示，告知用户数据已导出
        if self.fetch_only:
            logger.info(f"获取的商品数据已保存到 output/dry_run_exports/ 目录")

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

    # 测试 fetch_only 模式
    logger.info("\n--- 测试 fetch_only 模式 ---")
    fetch_only_orchestrator = SyncOrchestrator(dry_run=False, test_mode=False, fetch_only=True)
    logger.info("fetch_only_orchestrator 初始化完成。")
    
    # 示例：仅获取 Le Creuset 品牌的产品，使用关键词 "Dutch Oven"
    if 'Le Creuset' in fetch_only_orchestrator.brand_config and os.getenv('ASCEND_API_KEY'):
        logger.info("\n--- 测试为品牌 'Le Creuset' 获取商品 (Fetch Only) ---")
        fetch_only_orchestrator.run_sync_for_brand('Le Creuset', user_keywords_str='Dutch Oven')
    else:
        logger.warning("跳过 'Le Creuset' 品牌获取测试，因为未在 BRAND_CONFIG 中配置或缺少必要的 Pepperjam 凭证。")

    # 示例：同步 Pepperjam 品牌，无关键词 (获取该品牌常规产品)
    if 'PepperjamBrand6200' in orchestrator.brand_config and os.getenv('ASCEND_API_KEY') and os.getenv('SHOPIFY_STORE_NAME'):
        logger.info("\n--- 测试为品牌 'PepperjamBrand6200' 同步 (无关键词, Dry Run) ---")
        orchestrator.run_sync_for_brand('PepperjamBrand6200') # 无关键词
    else:
        logger.warning("跳过 'PepperjamBrand6200' 品牌同步测试，因为未在 BRAND_CONFIG 中配置或缺少必要的 Pepperjam/Shopify 凭证。")

    # # 测试全面同步 (可选，如果配置了多个品牌和关键词)
    # logger.info("\n--- 测试全面同步 (Dry Run, 可选) ---")
    # keywords_for_all = {
    #     "Dreo": "home, kitchen",
    #     "PepperjamBrand6200": "shoes"
    # }
    # orchestrator.run_full_sync(brands_to_process=list(keywords_for_all.keys()), keywords_by_brand=keywords_for_all) 