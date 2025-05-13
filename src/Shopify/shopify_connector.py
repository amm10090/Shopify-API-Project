import os
import time
import shopify # ShopifyAPI library
from dotenv import load_dotenv
from typing import List, Optional, Dict, Any
from loguru import logger # 导入 loguru logger
from datetime import datetime # 导入 datetime
from pyactiveresource import connection as pyactiveresource_connection

# 尝试从 Core 包导入 UnifiedProduct。如果直接运行此文件进行测试，可能会失败，
# 但在主应用上下文中应该可以正常工作。
try:
    from Core.data_models import UnifiedProduct
except ImportError:
    # 如果发生导入错误，定义一个临时的 UnifiedProduct 以便类型提示，
    # 这样 ShopifyConnector 类本身仍然可以被定义。
    # 这主要用于直接测试或开发 ShopifyConnector 时的便利性。
    # @shopify.dataclass # 使用 shopify.dataclass 占位，实际应为 dataclasses.dataclass
    # 用标准 dataclass 替代，因为 shopify.dataclass 和 shopify.field 可能不存在或导致问题
    from dataclasses import dataclass, field as dataclass_field 
    @dataclass
    class UnifiedProduct:
        sku: Optional[str] = None
        title: Optional[str] = None
        description: Optional[str] = None
        price: Optional[float] = None
        currency: Optional[str] = None 
        product_url: Optional[str] = None 
        image_url: Optional[str] = None
        availability: bool = True
        source_api: Optional[str] = None
        source_product_id: Optional[str] = None
        brand_name: Optional[str] = None
        source_advertiser_id: Optional[str] = None
        sale_price: Optional[float] = None
        categories: List[str] = dataclass_field(default_factory=list)
        keywords_matched: List[str] = dataclass_field(default_factory=list)
        shopify_product_id: Optional[int] = None
        shopify_variant_id: Optional[int] = None
        shopify_inventory_item_id: Optional[int] = None
        raw_data: Optional[Dict[str, Any]] = dataclass_field(default_factory=dict)


load_dotenv()

class ShopifyConnector:
    """封装与Shopify API的所有交互。"""

    MAX_RETRIES = 3
    RETRY_DELAY_SECONDS = 5

    def __init__(self, dry_run: bool = False, test_mode: bool = False):
        self.dry_run = dry_run 
        self.test_mode = test_mode
        logger.debug(f"ShopifyConnector 内部 __init__ 开始: dry_run={dry_run} (参数), test_mode={test_mode} (参数)")
        logger.debug(f"ShopifyConnector 实例属性赋值后: self.dry_run={self.dry_run}, self.test_mode={self.test_mode}")

        self.api_key = os.getenv('SHOPIFY_API_KEY')
        self.api_password = os.getenv('SHOPIFY_API_PASSWORD') 
        self.access_token = os.getenv('SHOPIFY_ACCESS_TOKEN') 
        self.store_name = os.getenv('SHOPIFY_STORE_NAME')
        self.api_version = os.getenv('SHOPIFY_API_VERSION', '2024-07') # 确保使用有效的API版本
        self.default_inventory = int(os.getenv('SHOPIFY_DEFAULT_PRODUCT_INVENTORY', '99')) # 新增：加载默认库存

        if not self.store_name:
            logger.error("Shopify store name (SHOPIFY_STORE_NAME) 未在 .env 文件中设置。")
            raise ValueError("Shopify store name (SHOPIFY_STORE_NAME) 未在 .env 文件中设置。")
        
        # 清理 store_name，移除引号、注释和其他非法字符
        self.store_name = self.store_name.strip()
        # 移除引号（如果有）
        if (self.store_name.startswith('"') and self.store_name.endswith('"')) or \
           (self.store_name.startswith("'") and self.store_name.endswith("'")):
            self.store_name = self.store_name[1:-1]
        
        # 移除可能的注释部分
        if '#' in self.store_name:
            self.store_name = self.store_name.split('#')[0].strip()
        
        # 确保 store_name 是一个有效的域名部分
        self.store_name = self.store_name.strip().replace('"', '').replace("'", '')
        
        session_token = self.api_password or self.access_token
        if not session_token:
            logger.error("Shopify API 凭证 (SHOPIFY_API_PASSWORD 或 SHOPIFY_ACCESS_TOKEN) 未设置。")
            raise ValueError("Shopify API 凭证 (SHOPIFY_API_PASSWORD 或 SHOPIFY_ACCESS_TOKEN) 未设置。")

        try:
            self.shop_url = f"{self.store_name.rstrip('.myshopify.com')}.myshopify.com"
            
            shopify.ShopifyResource.clear_session()
            shopify.ShopifyResource.set_version(self.api_version)
            
            self.session = shopify.Session(self.shop_url, self.api_version, session_token)
            shopify.ShopifyResource.activate_session(self.session)
            
            logger.info(f"成功连接到 Shopify 店铺: {self.shop_url}, API 版本: {self.api_version}")
            
            if self.dry_run:
                logger.info("Dry Run 模式：跳过 Shopify 店铺信息获取。")
            else:
                shop = shopify.Shop.current() 
                logger.info(f"店铺名称: {shop.name}, 店铺ID: {shop.id}")

            logger.debug(f"ShopifyConnector 初始化完成: dry_run={self.dry_run}, test_mode={self.test_mode}") # 添加日志
        except Exception as e:
            logger.error(f"Shopify 连接失败: {e}", exc_info=True)
            raise ConnectionError(f"无法连接到 Shopify: {e}") from e

    def _request_with_retry(self, func, *args, **kwargs):
        """带重试逻辑的请求包装器。"""
        if self.dry_run and func.__name__ in ['save', 'destroy', 'post', 'put', 'delete']:
             logger.debug(f"DRY RUN: 模拟调用 {func.__name__} (在 _request_with_retry 中)")
             if func.__name__ == 'save':
                 if args and hasattr(args[0], 'id') and args[0].id is None:
                     args[0].id = f"DRY_RUN_MOCK_ID_{int(time.time())}"
                 return args[0] if args else True
             if func.__name__ == 'destroy':
                 return True
             return None

        retries = 0
        while retries < self.MAX_RETRIES:
            try:
                return func(*args, **kwargs)
            except pyactiveresource_connection.ClientError as e: 
                if hasattr(e, 'response') and e.response is not None and e.response.code == 429:
                    retries += 1
                    if retries < self.MAX_RETRIES:
                        logger.warning(f"Shopify API 速率限制 (429): {e}. {self.RETRY_DELAY_SECONDS * retries}秒后重试 ({retries}/{self.MAX_RETRIES})...")
                        time.sleep(self.RETRY_DELAY_SECONDS * retries)
                        continue
                    else:
                        logger.error(f"Shopify API 错误: 达到最大重试次数 (429)。最后错误: {e}", exc_info=True)
                        raise
                # Checklist Item 1: Enhanced logging for ClientError
                response_body_snippet = ""
                if hasattr(e, 'response') and e.response is not None and hasattr(e.response, 'body') and e.response.body:
                    try:
                        response_body_snippet = e.response.body.decode('utf-8', errors='ignore')[:200]
                    except:
                        response_body_snippet = str(e.response.body)[:200]
                logger.error(f"Shopify API 客户端错误 (4xx，非429): 类型={type(e).__name__}, repr={repr(e)}, str={str(e)},响应码={getattr(e.response, 'code', 'N/A')}, 响应体片段='{response_body_snippet}'", exc_info=True)
                raise
            except pyactiveresource_connection.ServerError as e: 
                retries += 1
                if retries < self.MAX_RETRIES:
                    status_code = e.response.code if hasattr(e, 'response') and e.response is not None else "N/A"
                    logger.warning(f"Shopify API 服务器错误 (状态码 {status_code}): {e}. {self.RETRY_DELAY_SECONDS * retries}秒后重试 ({retries}/{self.MAX_RETRIES})...")
                    time.sleep(self.RETRY_DELAY_SECONDS * retries)
                    continue
                else:
                    logger.error(f"Shopify API 服务器错误: 已达到最大重试次数。最后错误: {e}", exc_info=True)
                    raise
            except Exception as e: 
                logger.error(f"执行 Shopify 操作时发生意外错误: {type(e).__name__} - {repr(e)}", exc_info=True)
                raise
        return None 

    def get_or_create_collection(self, title: str, handle: Optional[str] = None, published: bool = False, body_html: str = "") -> Optional[shopify.CustomCollection]:
        logger.debug(f"get_or_create_collection 调用: title='{title}', handle='{handle}', published={published}")
        if not handle:
            import re
            handle = title.lower()
            handle = re.sub(r'[^a-z0-9-]+', '-', handle)
            handle = re.sub(r'-+$', '', handle)
            handle = re.sub(r'^-+', '', handle)
            if not handle: 
                handle = f"collection-{int(time.time())}"

        existing_collection = None
        try:
            all_collections = self._request_with_retry(shopify.CustomCollection.find)
            for coll in all_collections:
                if coll.handle == handle:
                    existing_collection = coll
                    logger.info(f"按 handle '{handle}' 找到已存在的产品系列: {coll.title} (ID: {coll.id})")
                    break
                if not existing_collection and coll.title == title: # Check by title if not found by handle
                    existing_collection = coll
                    logger.info(f"按 title '{title}' 找到已存在的产品系列 (handle: {coll.handle}, ID: {coll.id})")
                    # Do not break here, continue to see if a handle match is found later, handle match takes precedence

            if existing_collection:
                needs_update = False
                current_is_published = existing_collection.published_at is not None
                logger.debug(f"检查产品系列 ID {existing_collection.id}: 当前 published_status_by_at={current_is_published} (目标: {published}), published_at={getattr(existing_collection, 'published_at', 'N/A')}")
                
                if current_is_published != published:
                    existing_collection.published = published # Set the target state
                    if hasattr(existing_collection, 'published_at'): 
                        existing_collection.published_at = datetime.utcnow().isoformat() if published else None
                    needs_update = True
                
                if body_html and hasattr(existing_collection, 'body_html') and existing_collection.body_html != body_html:
                    existing_collection.body_html = body_html 
                    needs_update = True
                
                if needs_update:
                    logger.info(f"正在更新产品系列 '{existing_collection.title}' (ID: {existing_collection.id}) 的属性...")
                    if self.dry_run:
                        logger.info(f"DRY RUN: 本应更新产品系列 ID {existing_collection.id} 的 published={published}, body_html='{body_html[:50]}...'")
                    else:
                        self._request_with_retry(existing_collection.save)
                        if existing_collection.errors:
                            logger.error(f"更新产品系列 '{existing_collection.title}' (ID: {existing_collection.id}) 失败: {existing_collection.errors.full_messages()}")
                            # Potentially raise an error or handle it, depending on desired behavior
                return existing_collection

            logger.info(f"产品系列 '{title}' (handle: '{handle}') 未找到，准备创建...")
            if self.dry_run:
                logger.info(f"DRY RUN: 本应创建产品系列: title='{title}', handle='{handle}', published={published}, body_html='{body_html[:50]}...'")
                mock_coll = shopify.CustomCollection({'id': f"DRY_RUN_COLL_ID_{int(time.time())}", 'title': title, 'handle': handle, 'published': published, 'body_html': body_html})
                return mock_coll
            
            new_collection = shopify.CustomCollection()
            new_collection.title = title
            new_collection.handle = handle
            new_collection.body_html = body_html
            new_collection.published = published
            if published and hasattr(new_collection, 'published_at'):
                 new_collection.published_at = datetime.utcnow().isoformat()
            
            self._request_with_retry(new_collection.save)
            if new_collection.errors:
                logger.error(f"创建产品系列 '{title}' 失败: {new_collection.errors.full_messages()}")
                raise pyactiveresource_connection.ClientError(f"创建产品系列失败: {new_collection.errors.full_messages()}")
            logger.info(f"成功创建产品系列: {new_collection.title} (ID: {new_collection.id}, Handle: {new_collection.handle}, Published: {new_collection.published})")
            return new_collection

        except pyactiveresource_connection.ClientError as e:
            logger.error(f"处理产品系列 '{title}' 时发生 Shopify API 错误: {e}", exc_info=True)
            raise
        except Exception as e: 
            logger.error(f"处理产品系列 '{title}' 时发生意外错误: {type(e).__name__} - {repr(e)}", exc_info=True)
            raise
        return None


    def add_product_to_collection(self, shopify_product_id: int, collection_id: int) -> Optional[shopify.Collect]:
        logger.debug(f"add_product_to_collection 调用: product_id={shopify_product_id}, collection_id={collection_id}")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应将产品 {shopify_product_id} 添加到产品系列 {collection_id}")
            return shopify.Collect({'id': f"DRY_RUN_COLLECT_ID_{int(time.time())}", 'product_id': shopify_product_id, 'collection_id': collection_id})

        try:
            collect = shopify.Collect({
                'product_id': shopify_product_id,
                'collection_id': collection_id
            })
            self._request_with_retry(collect.save)
            if collect.errors:
                is_duplicate_error = False
                messages_from_shopify = collect.errors.full_messages() # 获取一次错误消息

                # 定义重复错误的关键词列表
                keywords_for_duplicate = [
                    "product_id already exists", # 根据日志观察到的主要错误信息
                    "product is already in collection", # 通用备用
                    "product_id has already been taken"   # 另一个常见备用
                ]

                if isinstance(messages_from_shopify, list):
                    for msg_item in messages_from_shopify:
                        msg_lower = str(msg_item).strip().lower()
                        if any(keyword in msg_lower for keyword in keywords_for_duplicate):
                            is_duplicate_error = True
                            break
                elif isinstance(messages_from_shopify, str): 
                    msg_lower = messages_from_shopify.strip().lower()
                    if any(keyword in msg_lower for keyword in keywords_for_duplicate):
                        is_duplicate_error = True
                
                if is_duplicate_error:
                    logger.info(f"产品 {shopify_product_id} 已在产品系列 {collection_id} 中。")
                    # 尝试再次查找现有 collect，因为 save() 失败但错误表明它存在
                    try:
                        existing_collects = self._request_with_retry(shopify.Collect.find, product_id=shopify_product_id, collection_id=collection_id)
                        if existing_collects:
                            logger.info(f"确认产品 {shopify_product_id} 已存在于产品系列 {collection_id}。Collect ID: {existing_collects[0].id}")
                            return existing_collects[0]
                        else:
                            logger.warning(f"产品 {shopify_product_id} 报告已在产品系列 {collection_id} 中，但无法通过查询找到。")
                            return None # 表示无法获取干净的 Collect 对象
                    except Exception as find_e:
                        logger.error(f"尝试在报告重复后查找现有 Collect 时出错: {find_e}", exc_info=True)
                        return None # 表示解析失败
                else:
                    # 这是 collect.save() 的其他错误，不是重复错误
                    logger.error(f"将产品 {shopify_product_id} 添加到产品系列 {collection_id} 失败 (非重复错误): {messages_from_shopify}")
                    # 不再抛出新的 ClientError，直接返回 None
                    return None
            
            logger.info(f"产品 {shopify_product_id} 成功添加到产品系列 {collection_id} (Collect ID: {collect.id})")
            return collect
        except pyactiveresource_connection.ClientError as e: # 这个块现在应该只处理来自 _request_with_retry 的真实 ClientError
            response_body_snippet_add = ""
            response_code_for_log = 'N/A' # 安全地获取响应码
            
            if hasattr(e, 'response') and e.response is not None:
                # 安全地获取 code 属性
                response_code_for_log = getattr(e.response, 'code', 'N/A')
                if hasattr(e.response, 'body') and e.response.body:
                    try:
                        response_body_snippet_add = e.response.body.decode('utf-8', errors='ignore')[:200]
                    except:
                        response_body_snippet_add = str(e.response.body)[:200]
                        
            logger.error(f"将产品 {shopify_product_id} 添加到集合 {collection_id} 时发生API错误: 类型={type(e).__name__}, repr={repr(e)}, str={str(e)}, 响应码={response_code_for_log}, 响应体片段='{response_body_snippet_add}'", exc_info=True)
            
            # 仅当 response_code_for_log 确实是 422 时才专门处理 422 错误
            if response_code_for_log == 422:
                logger.warning(f"将产品 {shopify_product_id} 添加到产品系列 {collection_id} 时可能遇到重复错误 (HTTP 422)。原始错误: {e}") 
                # Try to find existing collect again, as the save might have failed due to duplication but it actually exists
                try:
                    existing_collects_after_422 = self._request_with_retry(shopify.Collect.find, product_id=shopify_product_id, collection_id=collection_id)
                    if existing_collects_after_422:
                        logger.info(f"产品 {shopify_product_id} 在422错误后确认已存在于产品系列 {collection_id} 中。Collect ID: {existing_collects_after_422[0].id}")
                        return existing_collects_after_422[0]
                except Exception as find_e_after_422:
                    logger.error(f"在422错误后尝试查找现有 Collect 时出错: {find_e_after_422}", exc_info=True)
            raise
        except Exception as e: 
            logger.error(f"将产品 {shopify_product_id} 添加到产品系列 {collection_id} 时发生意外错误: {type(e).__name__} - {repr(e)}", exc_info=True)
            raise
        return None

    def remove_product_from_collection(self, shopify_product_id: int, collection_id: int) -> bool:
        logger.debug(f"remove_product_from_collection 调用: product_id={shopify_product_id}, collection_id={collection_id}")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应从产品系列 {collection_id} 中移除产品 {shopify_product_id}")
            return True

        try:
            collects_to_delete = self._request_with_retry(shopify.Collect.find, product_id=shopify_product_id, collection_id=collection_id)
            
            if not collects_to_delete:
                logger.info(f"产品 {shopify_product_id} 不在产品系列 {collection_id} 中，无需移除。")
                return True
            
            for collect_instance in collects_to_delete:
                logger.info(f"正在从产品系列 {collection_id} 中移除产品 {shopify_product_id} (Collect ID: {collect_instance.id})...")
                self._request_with_retry(collect_instance.destroy)
            
            logger.info(f"产品 {shopify_product_id} 已成功从产品系列 {collection_id} 中移除。")
            return True
            
        except pyactiveresource_connection.ClientError as e:
            logger.error(f"从产品系列 {collection_id} 移除产品 {shopify_product_id} 时发生 Shopify API 错误: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"从产品系列 {collection_id} 移除产品 {shopify_product_id} 时发生意外错误: {type(e).__name__} - {repr(e)}", exc_info=True)
            raise
        return False

    def get_product_by_sku(self, sku: str) -> Optional[shopify.Product]:
        logger.debug(f"正在尝试按 SKU '{sku}' 查找产品...")
        try:
            products_page = self._request_with_retry(shopify.Product.find, limit=250)
            
            while products_page:
                for product in products_page:
                    for variant in product.variants:
                        if variant.sku == sku:
                            logger.info(f"按 SKU '{sku}' 找到产品: {product.title} (ID: {product.id}, Variant ID: {variant.id})")
                            return product
                
                if len(products_page) < 250:
                    break
                
                if products_page:
                    last_id = products_page[-1].id
                    products_page = self._request_with_retry(shopify.Product.find, limit=250, since_id=last_id)
                else:
                    break
            
            logger.info(f"未找到 SKU 为 '{sku}' 的产品。")
            return None

        except pyactiveresource_connection.ClientError as e:
            logger.error(f"按 SKU '{sku}' 查找产品时发生 Shopify API 错误: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"按 SKU '{sku}' 查找产品时发生意外错误: {type(e).__name__} - {repr(e)}", exc_info=True)
            raise
        return None

    def create_product(self, unified_product: UnifiedProduct, status: str = 'draft') -> Optional[shopify.Product]:
        logger.info(f"准备创建 Shopify 产品: SKU='{unified_product.sku}', Title='{unified_product.title}', Status='{status}'")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应创建产品: SKU='{unified_product.sku}', Title='{unified_product.title}', Price={unified_product.price}, Status='{status}'")
            mock_product = shopify.Product({
                'id': f"DRY_RUN_PROD_ID_{int(time.time())}", 
                'title': unified_product.title,
                'sku': unified_product.sku, 
                'variants': [shopify.Variant({'id': f"DRY_RUN_VAR_ID_{int(time.time())}", 'inventory_item_id': f"DRY_RUN_INV_ID_{int(time.time())}", 'sku': unified_product.sku})],
                'published_at': None if status == 'draft' else datetime.utcnow().isoformat()
            })
            return mock_product

        new_shopify_product = None 
        try:
            new_shopify_product = shopify.Product()
            new_shopify_product.title = unified_product.title
            new_shopify_product.body_html = unified_product.description
            new_shopify_product.vendor = unified_product.brand_name
            new_shopify_product.product_type = unified_product.categories[0] if unified_product.categories else ""
            
            if status == 'draft':
                new_shopify_product.published_at = None
                new_shopify_product.published_scope = "web" 
            elif status == 'active':
                new_shopify_product.published_at = datetime.utcnow().isoformat()
                new_shopify_product.published_scope = "web"

            # 创建变体
            variant_attributes = {
                "option1": "Default Title", 
                "price": str(unified_product.price),
                "sku": unified_product.sku,
                "inventory_management": "shopify",
                "inventory_policy": "deny"  # 当库存为0时，不允许购买
            }
            
            if unified_product.sale_price and unified_product.sale_price < unified_product.price:
                variant_attributes["compare_at_price"] = str(unified_product.price)
                variant_attributes["price"] = str(unified_product.sale_price)
            
            new_shopify_product.variants = [shopify.Variant(variant_attributes)]

            if unified_product.image_url:
                new_shopify_product.images = [{"src": unified_product.image_url}]

            self._request_with_retry(new_shopify_product.save)
            if new_shopify_product.errors:
                logger.error(f"创建产品 '{unified_product.title}' 失败: {new_shopify_product.errors.full_messages()}")
                raise pyactiveresource_connection.ClientError(f"创建产品失败: {new_shopify_product.errors.full_messages()}")
            
            logger.info(f"产品 '{new_shopify_product.title}' (ID: {new_shopify_product.id}, SKU: {unified_product.sku}) 成功创建并设为 '{status}' 状态。")
            
            # Checklist Item 1: Diagnostic logging for product attributes and errors after save
            logger.debug(f"产品对象 {new_shopify_product.id} 创建后的属性: {getattr(new_shopify_product, 'attributes', 'N/A')}")
            if hasattr(new_shopify_product, 'errors') and new_shopify_product.errors and new_shopify_product.errors.full_messages():
                logger.warning(f"产品对象 {new_shopify_product.id} 创建后 .errors 属性中包含消息: {new_shopify_product.errors.full_messages()}")
            else:
                logger.debug(f"产品对象 {new_shopify_product.id} 创建后 .errors 属性为空、不存在或无消息。")

            # 设置库存 - 仅保留已证明有效的方法
            logger.debug(f"检查产品库存设置条件：unified_product.availability = {unified_product.availability}") 
            if unified_product.availability and new_shopify_product.variants and new_shopify_product.variants[0].inventory_item_id:
                inventory_item_id = new_shopify_product.variants[0].inventory_item_id
                
                # 获取并检查所有位置
                inventory_set_success = False
                try: 
                    locations = self._request_with_retry(shopify.Location.find)
                    if not locations:
                        logger.warning(f"无法获取任何 Shopify 位置信息，无法设置初始库存。")
                        return new_shopify_product
                    
                    # 尝试所有位置直到成功
                    for location in locations:
                        location_id = location.id
                        try:
                            logger.info(f"尝试为产品 {new_shopify_product.id} (SKU: {unified_product.sku}) 在位置 {location_id} 设置初始库存为 {self.default_inventory}...")
                            shopify.InventoryLevel.set(location_id=location_id, inventory_item_id=inventory_item_id, available=self.default_inventory)
                            logger.info(f"产品 {new_shopify_product.id} (SKU: {unified_product.sku}) 初始库存已在位置 {location_id} 设置为 {self.default_inventory}。")
                            inventory_set_success = True
                            logger.info(f"产品 {new_shopify_product.id} (SKU: {unified_product.sku}) 库存已成功设置为 {self.default_inventory}。")
                            break
                        except Exception as e_location:
                            logger.warning(f"在位置 {location_id} 设置库存失败: {str(e_location)}。继续尝试其他位置...")
                            continue
                    
                    # 如果所有位置都失败
                    if not inventory_set_success:
                        logger.warning(f"在所有位置设置库存均失败，可能需要手动在Shopify后台设置库存。")
                        
                except Exception as e_inventory:
                    logger.error(f"库存设置过程中发生未预期的错误: {str(e_inventory)}", exc_info=True)
            
            return new_shopify_product

        except pyactiveresource_connection.ClientError as e:
            logger.error(f"创建产品 '{unified_product.title}' 时发生 API 错误: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"创建产品 '{unified_product.title}' 时发生意外错误: {e}", exc_info=True)
            raise
        return None

    def update_product(self, shopify_product_id: int, unified_product: UnifiedProduct) -> Optional[shopify.Product]:
        logger.info(f"准备更新 Shopify 产品 ID: {shopify_product_id} (SKU: {unified_product.sku})")
        
        try:
            existing_product = self._request_with_retry(shopify.Product.find, shopify_product_id)
            if not existing_product:
                logger.error(f"错误: 未找到 Shopify 产品 ID 为 {shopify_product_id} 的产品进行更新。")
                raise shopify.exceptions.ResourceNotFoundError(f"Product with ID {shopify_product_id} not found.")

            if self.dry_run:
                logger.info(f"DRY RUN: 本应更新产品 ID {shopify_product_id} (SKU: {unified_product.sku}) 的信息:")
                logger.info(f"  DRY RUN: Title='{unified_product.title}', Description='{unified_product.description[:50]}...', Price={unified_product.price}, Image='{unified_product.image_url}'")
                # 返回现有产品，假装它已被更新
                return existing_product

            update_payload = {}
            changed_attributes = []
            
            if existing_product.title != unified_product.title:
                update_payload['title'] = unified_product.title
                changed_attributes.append("title")
            if existing_product.body_html != unified_product.description:
                update_payload['body_html'] = unified_product.description
                changed_attributes.append("description")
            if existing_product.vendor != unified_product.brand_name:
                update_payload['vendor'] = unified_product.brand_name
                changed_attributes.append("vendor")
            
            if unified_product.image_url:
                current_image_src = existing_product.images[0].src if existing_product.images else None
                if current_image_src != unified_product.image_url:
                    # 如果有现有图片，提供其ID以替换，否则Shopify会添加新图片并可能保留旧的
                    image_update_data = {'src': unified_product.image_url}
                    if existing_product.images and hasattr(existing_product.images[0], 'id'):
                        image_update_data['id'] = existing_product.images[0].id
                    update_payload['images'] = [image_update_data]
                    changed_attributes.append("image")
            elif existing_product.images:
                logger.debug(f"产品 {shopify_product_id} 当前有图片，但统一产品无图片URL。保留现有图片。")

            variant_changed = False
            if existing_product.variants:
                variant = existing_product.variants[0] # 获取 Variant 对象
                # variant_update_data = {"id": variant.id} # 不再需要这个字典来构建 payload

                new_price_str = str(unified_product.price)
                new_sale_price_str = str(unified_product.sale_price) if unified_product.sale_price is not None else None

                target_price = new_price_str
                target_compare_at_price = None

                if unified_product.sale_price and unified_product.sale_price < unified_product.price:
                    target_price = new_sale_price_str
                    target_compare_at_price = new_price_str
                
                if variant.price != target_price:
                    variant.price = target_price # 直接修改 Variant 对象的属性
                    variant_changed = True
                    changed_attributes.append("variant.price")
                
                current_compare_at_price_on_variant = variant.compare_at_price
                needs_compare_price_update = False
                if target_compare_at_price is None:
                    # 如果目标是None，且当前价格不是None也不是0，则需要更新
                    if current_compare_at_price_on_variant is not None and float(current_compare_at_price_on_variant) != 0:
                        needs_compare_price_update = True
                elif current_compare_at_price_on_variant != target_compare_at_price:
                    needs_compare_price_update = True

                if needs_compare_price_update:
                    variant.compare_at_price = target_compare_at_price # 直接修改 Variant 对象的属性
                    variant_changed = True
                    changed_attributes.append("variant.compare_at_price")

                if variant.sku != unified_product.sku:
                    logger.warning(f"SKU 不匹配: Shopify variant SKU='{variant.sku}', UnifiedProduct SKU='{unified_product.sku}'. SKU 通常不应在更新时更改。")
                
                # variant_update_payload_for_product_save 不再需要
            
            if update_payload or variant_changed:
                logger.info(f"检测到产品 {shopify_product_id} 的属性 ({', '.join(changed_attributes)}) 已更改，正在保存...")
                
                for key, value in update_payload.items():
                    setattr(existing_product, key, value)
                
                # 不需要显式设置 existing_product.variants
                
                saved_result = self._request_with_retry(existing_product.save)
                # 检查 save 操作是否成功
                # shopify.Product.save() 在成功时返回 True，失败（如验证错误）时返回 False 并填充 errors 属性
                if saved_result is True and not (hasattr(existing_product, 'errors') and existing_product.errors and existing_product.errors.full_messages()):
                    logger.info(f"产品 {shopify_product_id} (SKU: {unified_product.sku}) 成功更新。")
                else:
                    error_messages_list = []
                    if hasattr(existing_product, 'errors') and existing_product.errors and hasattr(existing_product.errors, 'full_messages'):
                        error_messages_list = existing_product.errors.full_messages()
                    
                    error_str = ", ".join(error_messages_list) if error_messages_list else f"Save operation returned {saved_result} or errors attribute not as expected."
                    logger.error(f"更新产品 {shopify_product_id} (SKU: {unified_product.sku}) 失败: {error_str}")
                    # 抛出 ClientError 以便上层捕获
                    raise pyactiveresource_connection.ClientError(f"更新产品失败: {error_str}")
            else:
                logger.info(f"产品 {shopify_product_id} (SKU: {unified_product.sku}) 数据未发生变化，无需更新主要属性。")

            # 库存状态更新 (简化，基于 availability 标志)
            # 这个逻辑仍然很粗略，真正的库存同步需要更复杂的方法
            if existing_product.variants and existing_product.variants[0].inventory_item_id:
                inventory_item_id = existing_product.variants[0].inventory_item_id
                # 检查 unified_product.availability 是否与当前产品的某种可售状态（例如库存>0）不同
                # 此处简化：如果 unified_product.availability 是 False，我们倾向于使其不可售 (库存0)
                # 如果是 True，我们倾向于使其可售 (库存>0)。
                # 由于精确获取和设置库存的复杂性（涉及location_id），这里暂时只记录意图。
                if not unified_product.availability:
                    logger.info(f"产品 {shopify_product_id} (SKU: {unified_product.sku}) 标记为缺货。建议手动检查Shopify库存或实现精确清零。")
                    # 在实际场景中，如果产品已发布，可能需要将库存设为0
                    # shopify.InventoryLevel.set(inventory_item_id=inventory_item_id, available=0, location_id=...)
                elif unified_product.availability:
                    logger.info(f"产品 {shopify_product_id} (SKU: {unified_product.sku}) 标记为有货。如果之前库存为0，确保其大于0。")
                    # 在实际场景中，如果产品已发布且库存为0，可能需要将库存设为例如1
                    # shopify.InventoryLevel.set(inventory_item_id=inventory_item_id, available=1, location_id=...)
            
            return existing_product

        except shopify.exceptions.ResourceNotFoundError:
            logger.error(f"更新失败: 未找到 Shopify 产品 ID: {shopify_product_id}", exc_info=True)
            raise
        except pyactiveresource_connection.ClientError as e:
            logger.error(f"更新产品 {shopify_product_id} 时发生 Shopify API 错误: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"更新产品 {shopify_product_id} 时发生意外错误: {e}", exc_info=True)
            raise
        return None

    def set_product_status(self, shopify_product_id: int, status: str = 'active') -> bool:
        """设置产品状态 (active/draft)。简化版，主要通过 published_at 控制。"""
        logger.info(f"准备设置产品 ID {shopify_product_id} 的状态为 '{status}'")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应设置产品 ID {shopify_product_id} 的状态为 '{status}'")
            return True

        try:
            product = self._request_with_retry(shopify.Product.find, shopify_product_id)
            if not product:
                logger.error(f"设置状态失败: 未找到产品 ID {shopify_product_id}")
                return False

            current_published_at = product.published_at
            changed = False
            if status == 'active':
                if current_published_at is None: # 如果当前是草稿，则发布
                    product.published_at = datetime.utcnow().isoformat()
                    product.published_scope = "web" # 确保发布范围
                    changed = True
            elif status == 'draft':
                if current_published_at is not None: # 如果当前是发布状态，则取消发布
                    product.published_at = None
                    changed = True
            else:
                logger.warning(f"无效的产品状态 '{status}'。接受的状态是 'active' 或 'draft'。")
                return False

            if changed:
                self._request_with_retry(product.save)
                if product.errors:
                    logger.error(f"设置产品 {shopify_product_id} 状态为 '{status}' 失败: {product.errors.full_messages()}")
                    return False
                logger.info(f"产品 {shopify_product_id} 状态成功设置为 '{status}'。")
            else:
                logger.info(f"产品 {shopify_product_id} 状态已为 '{status}'，无需更改。")
            return True
        except Exception as e:
            logger.error(f"设置产品 {shopify_product_id} 状态时发生错误: {e}", exc_info=True)
            return False

    def set_product_metafield(self, shopify_product_id: int, namespace: str, key: str, value: Any, value_type: str) -> Optional[shopify.Metafield]:
        logger.debug(f"set_product_metafield: product_id={shopify_product_id}, ns='{namespace}', key='{key}', value='{str(value)[:50]}...', type='{value_type}'")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应为产品 {shopify_product_id} 设置元字段: ns='{namespace}', key='{key}', value='{str(value)[:50]}...', type='{value_type}'")
            # 返回模拟的 Metafield 对象或 None
            return shopify.Metafield({'id': f"DRY_RUN_META_ID_{int(time.time())}", 'namespace': namespace, 'key': key, 'value': value, 'value_type': value_type})

        try:
            product = shopify.Product.find(shopify_product_id) # 需要产品对象来添加元字段
            
            # 检查现有元字段并更新，或者创建新的
            existing_metafields = product.metafields() # 获取与产品关联的所有元字段
            metafield_to_update = None
            for mf in existing_metafields:
                if mf.namespace == namespace and mf.key == key:
                    metafield_to_update = mf
                    break
            
            if metafield_to_update:
                logger.info(f"找到现有元字段 (ID: {metafield_to_update.id})，准备更新值...")
                metafield_to_update.value = value
                metafield_to_update.value_type = value_type # Shopify API v10+ uses 'type' for creation, 'value_type' for existing
                if hasattr(metafield_to_update, 'type') and not hasattr(metafield_to_update, 'value_type'): # 兼容旧版库
                     metafield_to_update.type = value_type
                
                self._request_with_retry(metafield_to_update.save)
                if metafield_to_update.errors:
                    logger.error(f"更新元字段 (ID: {metafield_to_update.id}) 失败: {metafield_to_update.errors.full_messages()}")
                    return None
                logger.info(f"元字段 (ID: {metafield_to_update.id}) 成功更新。")
                return metafield_to_update
            else:
                logger.info(f"未找到现有元字段，准备创建新的...")
                # Shopify API v10+ 使用 'type' 而不是 'value_type' 来创建新元字段
                new_metafield = product.add_metafield(shopify.Metafield({'namespace': namespace, 'key': key, 'value': value, 'type': value_type}))
                # add_metafield 内部会调用 save
                if not new_metafield.id or (hasattr(new_metafield, 'errors') and new_metafield.errors): # 检查是否成功创建
                    errors = new_metafield.errors.full_messages() if hasattr(new_metafield, 'errors') and new_metafield.errors else "未知错误，元字段未创建成功"
                    logger.error(f"创建元字段失败: {errors}")
                    return None # add_metafield 在失败时可能返回一个未保存的带错误的Metafield对象
                logger.info(f"元字段 (ID: {new_metafield.id}) 成功创建。")
                return new_metafield

        except Exception as e:
            logger.error(f"为产品 {shopify_product_id} 设置元字段 ns='{namespace}', key='{key}' 时发生错误: {e}", exc_info=True)
            return None

    def archive_product(self, shopify_product_id: int) -> bool:
        logger.info(f"准备归档产品 ID {shopify_product_id}")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应归档产品 ID {shopify_product_id}")
            return True
        try:
            product = self._request_with_retry(shopify.Product.find, shopify_product_id)
            if not product:
                logger.error(f"归档失败: 未找到产品 ID {shopify_product_id}")
                return False
            
            # Shopify API 通过将产品状态设置为 'archived' 来归档
            # 或者使用 product.archive() 方法如果库支持
            # product.status = 'archived' # 检查Product对象是否有status属性可直接设置
            # 根据Shopify API文档，归档是通过 POST /admin/api/YYYY-MM/products/{product_id}/archive.json
            # ShopifyPythonAPI 库可能通过 product.archive() 实现，或者需要手动设置状态并保存
            # 查阅ShopifyAPI库，Product类没有直接的 archive() 方法。
            # 尝试设置 status 字段 (如果可写) 或通过 published_at = None 和其他标记。
            # 官方REST API有一个专门的 archive 端点。如果库不包装，可能需要原始POST。
            # 简单起见，如果产品不是草稿，先设为草稿，然后用户可以手动归档。
            # 真正的归档API调用可能需要更底层的请求。
            # 假设我们将产品设为草稿作为"归档"的第一步
            if product.published_at is not None:
                product.published_at = None
                self._request_with_retry(product.save)
                if product.errors:
                    logger.error(f"将产品 {shopify_product_id} 设为草稿以准备归档时失败: {product.errors.full_messages()}")
                    return False
                logger.info(f"产品 {shopify_product_id} 已设为草稿状态 (作为归档的前置步骤)。真正的归档需要通过 Shopify UI 或特定的归档API端点。")
            else:
                logger.info(f"产品 {shopify_product_id} 已是草稿状态。归档需通过 Shopify UI或特定归档API。")
            return True # 表示已尝试处理
        except Exception as e:
            logger.error(f"归档产品 {shopify_product_id} 时发生错误: {e}", exc_info=True)
            return False

    def delete_product(self, shopify_product_id: int) -> bool:
        logger.info(f"准备删除产品 ID {shopify_product_id}")
        if self.dry_run:
            logger.info(f"DRY RUN: 本应删除产品 ID {shopify_product_id}")
            return True
        try:
            product = self._request_with_retry(shopify.Product.find, shopify_product_id)
            if not product:
                logger.error(f"删除失败: 未找到产品 ID {shopify_product_id}")
                return False
            
            self._request_with_retry(product.destroy)
            # destroy 成功时不返回内容，失败会抛异常
            logger.info(f"产品 {shopify_product_id} 已成功删除。")
            return True
        except shopify.exceptions.ResourceNotFoundError: # 使用 shopify.exceptions
            logger.info(f"产品 {shopify_product_id} 已被删除 (destroy 后确认)。")
            return True
        except Exception as e:
            logger.error(f"删除产品 {shopify_product_id} 时发生错误: {e}", exc_info=True)
            return False

# 示例用法
if __name__ == '__main__':
    # logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(module)s - %(message)s')
    # logger_main = logging.getLogger(__name__)
    # logger_main.info("正在测试 ShopifyConnector 初始化...")
    # 使用导入的 logger，它会使用 Loguru 的默认配置（输出到 stderr）或在 main.py 中配置的 sinks
    logger.info("正在测试 ShopifyConnector 初始化 (Loguru)...")
    
    missing_vars = []
    if not os.getenv('SHOPIFY_STORE_NAME'): missing_vars.append('SHOPIFY_STORE_NAME')
    if not (os.getenv('SHOPIFY_API_PASSWORD') or os.getenv('SHOPIFY_ACCESS_TOKEN')): 
        missing_vars.append('SHOPIFY_API_PASSWORD or SHOPIFY_ACCESS_TOKEN')

    if missing_vars:
        logger.error(f"错误: 缺少以下 .env 变量才能测试 Shopify 连接: {', '.join(missing_vars)}")
        logger.error("请确保 .env 文件已正确配置 Shopify 凭证。")
    else:
        try:
            # 测试 Dry Run 模式
            logger.info("\n--- 测试 Dry Run模式 ---")
            connector_dry_run = ShopifyConnector(dry_run=True)
            logger.info("ShopifyConnector (Dry Run) 初始化成功。")
            
            # 模拟创建产品系列 (Dry Run)
            mock_collection_title = "Test Dry Run Collection"
            mock_collection = connector_dry_run.get_or_create_collection(mock_collection_title, published=False)
            if mock_collection and hasattr(mock_collection, 'id') and "DRY_RUN" in str(mock_collection.id): # 检查是否是模拟对象
                 logger.info(f"Dry Run: get_or_create_collection 为 '{mock_collection_title}' 返回模拟产品系列 ID: {mock_collection.id}")
            else:
                 logger.warning(f"Dry Run: get_or_create_collection 为 '{mock_collection_title}' 未按预期返回模拟对象或返回了: {mock_collection}")

            # 模拟创建产品 (Dry Run)
            # 构建一个临时的 UnifiedProduct 以便测试
            temp_unified_prod = UnifiedProduct(
                sku="DRYRUNSKU123", 
                title="Test Dry Run Product", 
                description="This is a dry run test product.",
                price=99.99,
                brand_name="DryRunBrand",
                image_url="http://example.com/dryrun.jpg",
                availability=True
            )
            mock_product = connector_dry_run.create_product(temp_unified_prod, status='draft')
            if mock_product and hasattr(mock_product, 'id') and "DRY_RUN" in str(mock_product.id):
                logger.info(f"Dry Run: create_product 返回模拟产品 ID: {mock_product.id}")
                
                # 模拟添加产品到产品系列 (Dry Run)
                if mock_collection and hasattr(mock_collection, 'id'):
                    mock_collect = connector_dry_run.add_product_to_collection(mock_product.id, mock_collection.id) # 使用模拟ID
                    if mock_collect and hasattr(mock_collect, 'id') and "DRY_RUN" in str(mock_collect.id):
                        logger.info(f"Dry Run: add_product_to_collection 返回模拟 Collect ID: {mock_collect.id}")

                # 模拟设置元字段 (Dry Run)
                mock_metafield = connector_dry_run.set_product_metafield(mock_product.id, "custom", "dry_run_link", "http://dryrun.example.com", "url")
                if mock_metafield and hasattr(mock_metafield, 'id') and "DRY_RUN" in str(mock_metafield.id):
                     logger.info(f"Dry Run: set_product_metafield 返回模拟元字段 ID: {mock_metafield.id}")
            else:
                 logger.warning(f"Dry Run: create_product 未按预期返回模拟对象或返回了: {mock_product}")


            # 测试实际连接 (可选, 取消下一行注释以测试实际连接)
            # logger.info("\n--- 测试实际连接 (如果凭证有效) ---")
            # connector_live = ShopifyConnector(dry_run=False)
            # logger.info("ShopifyConnector (Live) 初始化成功。")
            # shop_live = shopify.Shop.current() # 这会实际调用API
            # logger.info(f"成功获取店铺信息 (Live): {shop_live.name}")

        except Exception as e:
            logger.error(f"ShopifyConnector 测试中发生错误: {e}", exc_info=True) 