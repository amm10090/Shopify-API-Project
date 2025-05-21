import os
from typing import List, Optional, Dict, Any
from loguru import logger # 导入 loguru logger
import requests # 导入 requests 用于验证图片URL
import re # 导入 re
import json
from datetime import datetime
from pathlib import Path

from Core.data_models import UnifiedProduct
# 动态导入API客户端，以便在没有安装所有依赖项的情况下也能进行部分测试或导入
try:
    from CJ.CJ_product_fetcher import search_products as cj_search_products, get_products_by_advertiser
except ImportError:
    logger.warning("未能导入 CJ_product_fetcher. 请确保 CJ 模块及其依赖项已正确安装和配置，如果需要使用 CJ API 的话。")
    cj_search_products = None
    get_products_by_advertiser = None

try:
    from Ascend.pepperjam_publisher_api import PepperjamPublisherAPI
except ImportError:
    logger.warning("未能导入 PepperjamPublisherAPI. 请确保 Ascend 模块及其依赖项已正确安装和配置，如果需要使用 Pepperjam API 的话。")
    PepperjamPublisherAPI = None

MAX_RAW_PRODUCTS_TO_SCAN_FROM_FEED = 1000 # 新增：限制从API响应中扫描的最大原始产品数量

class ProductRetriever:
    """负责从 CJ 和 Pepperjam API 获取产品数据，并将其转换为 UnifiedProduct 对象列表。"""

    def __init__(self, skip_image_validation: bool = False):
        """
        初始化 ProductRetriever。
        
        Args:
            skip_image_validation (bool): 是否跳过图片URL验证，默认为False
        """
        self.skip_image_validation = skip_image_validation
        logger.info(f"ProductRetriever 初始化: skip_image_validation={skip_image_validation}")

        if PepperjamPublisherAPI:
            try:
                self.pepperjam_client = PepperjamPublisherAPI() # 使用 .env 中的默认配置初始化
            except ValueError as e:
                logger.warning(f"初始化 PepperjamPublisherAPI 失败: {e}。Pepperjam API 功能将不可用。")
                self.pepperjam_client = None
        else:
            self.pepperjam_client = None
        
        # CJ 客户端通常是函数式的，不需要实例化存储，可以直接调用 cj_search_products
        if not cj_search_products:
            logger.warning("CJ 产品搜索功能不可用。")

    def _is_valid_image_url(self, url: str, timeout: int = 15, min_size_bytes: int = 1000, max_retries: int = 2) -> bool:
        """
        验证图片URL是否有效。
        
        Args:
            url: 要验证的图片URL
            timeout: 请求超时时间（秒），默认15秒
            min_size_bytes: 最小有效图片大小（字节），默认1000字节
            max_retries: 最大重试次数，默认2次
            
        Returns:
            布尔值，表示URL是否指向有效的图片
        """
        # 如果设置了跳过图片验证，直接返回True
        if self.skip_image_validation:
            return True
            
        if not url:
            return False
            
        # 检查URL是否为有效格式
        if not re.match(r'^https?://', url):
            logger.warning(f"图片URL格式无效: {url}")
            return False
        
        # feedonomics.com域名的图片已知有效但响应较慢，直接视为有效
        if 'feedonomics.com' in url:
            logger.debug(f"检测到feedonomics.com域名的图片URL，跳过验证直接视为有效: {url}")
            return True
            
        # 重试多次
        for attempt in range(max_retries + 1):
            try:
                common_user_agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                request_headers = {'User-Agent': common_user_agent}
                
                # 尝试HEAD请求，这比GET请求快
                head_response = requests.head(url, timeout=timeout, allow_redirects=True, headers=request_headers)
                
                # 检查状态码
                if head_response.status_code != 200:
                    # 如果不是最后一次尝试，继续重试
                    if attempt < max_retries:
                        logger.debug(f"HEAD请求返回状态码{head_response.status_code}，尝试第{attempt+1}次重试...")
                        continue
                    else:
                        logger.warning(f"图片URL返回非200状态码: {url} (状态码: {head_response.status_code})")
                        return False
                
                # 检查Content-Type是否为图片类型
                content_type = head_response.headers.get('Content-Type', '').lower()
                image_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
                
                if not any(content_type.startswith(image_type) for image_type in image_types):
                    # 如果HEAD请求的Content-Type不是图片类型，可能是服务器配置问题，尝试GET
                    if attempt < max_retries:
                        logger.debug(f"HEAD请求Content-Type不是图片类型 ({content_type})，尝试GET请求...")
                        try:
                            get_response = requests.get(url, timeout=timeout, stream=True, headers=request_headers)
                            if get_response.status_code == 200:
                                get_content_type = get_response.headers.get('Content-Type', '').lower()
                                if any(get_content_type.startswith(image_type) for image_type in image_types):
                                    # 返回前检查内容的前几个字节，确认是图片格式
                                    chunk = get_response.raw.read(64)
                                    is_valid_image = (
                                        chunk.startswith(b'\x89PNG\r\n\x1a\n') or  # PNG
                                        chunk.startswith(b'\xff\xd8\xff') or       # JPEG
                                        chunk.startswith(b'GIF87a') or            # GIF
                                        chunk.startswith(b'GIF89a') or            # GIF
                                        b'WEBP' in chunk                          # WebP
                                    )
                                    if is_valid_image:
                                        logger.debug(f"通过GET请求确认图片有效: {url}")
                                        return True
                            # 如果GET请求失败，继续重试
                            continue
                        except Exception as inner_e:
                            if attempt < max_retries:
                                logger.debug(f"GET请求失败: {str(inner_e)}，继续重试...")
                                continue
                            else:
                                logger.warning(f"验证图片内容失败: {url} (错误: {inner_e})")
                                return False
                    
                    # 最后一次尝试也失败
                    if attempt == max_retries:
                        logger.warning(f"URL不是图片类型: {url} (Content-Type: {content_type})")
                        return False
                
                # 如果有Content-Length，检查大小以过滤可能的占位图或空图
                if 'content-length' in head_response.headers:
                    content_length = int(head_response.headers['content-length'])
                    if content_length < min_size_bytes:
                        if attempt < max_retries:
                            logger.debug(f"图片大小过小 ({content_length} 字节)，尝试第{attempt+1}次重试...")
                            continue
                        else:
                            logger.warning(f"图片URL内容长度过小: {url} (大小: {content_length} 字节)")
                            return False
                
                # 通过所有验证，图片URL有效
                return True
                
            except requests.exceptions.RequestException as e:
                # 捕获请求异常，如超时、连接错误等
                if attempt < max_retries:
                    logger.debug(f"请求异常: {str(e)}，尝试第{attempt+1}次重试...")
                    continue
                else:
                    logger.warning(f"验证图片URL时发生请求错误: {url} (错误: {e})")
                    return False
            except Exception as e:
                # 捕获其他异常
                if attempt < max_retries:
                    logger.debug(f"未预期的错误: {str(e)}，尝试第{attempt+1}次重试...")
                    continue
                else:
                    logger.warning(f"验证图片URL时发生未预期的错误: {url} (错误: {e})")
                    return False
        
        # 如果代码执行到这里，表示所有重试都失败了
        return False

    def _cj_product_to_unified(self, cj_product: Dict[str, Any], brand_name: str, source_api_name: str) -> Optional[UnifiedProduct]:
        """将单个CJ产品字典转换为UnifiedProduct对象。"""
        if not cj_product:
            return None

        # 新增字段校验
        required_fields = ['link', 'imageLink', 'title']
        for field in required_fields:
            if not cj_product.get(field):
                logger.warning(f"CJ 产品缺少必需字段 '{field}' 或字段为空 (ID: {cj_product.get('id', 'N/A')}, 标题: {cj_product.get('title', 'N/A')}). 跳过此产品.")
                return None

        # 校验价格不为 '0.00'
        price_info = cj_product.get('price', {})
        price_amount_str = price_info.get('amount')
        if price_amount_str == "0.00":
            logger.warning(f"CJ 产品的价格为 '0.00' (ID: {cj_product.get('id', 'N/A')}, 标题: {cj_product.get('title', 'N/A')}). 跳过此产品.")
            return None

        # 原有的 imageLink 检查仍然保留，作为双重保险或处理空字符串的情况 (尽管上面的检查也覆盖了空字符串)
        if not cj_product.get('imageLink'): # 确保 imageLink 存在
            logger.warning(f"CJ 产品缺少 imageLink (ID: {cj_product.get('id')}, 标题: {cj_product.get('title')}). 跳过此产品.")
            return None
            
        # 添加图片链接有效性验证（如果需要）
        if not self.skip_image_validation and not self._is_valid_image_url(cj_product.get('imageLink')):
            logger.warning(f"CJ 产品图片链接无效 (ID: {cj_product.get('id', 'N/A')}, 标题: {cj_product.get('title', 'N/A')}, imageLink: {cj_product.get('imageLink')}). 跳过此产品.")
            return None
        
        # 如果 advertiserId 或 id 缺失，则跳过，这些是 SKU 生成所必需的
        if not cj_product.get('advertiserId'):
            logger.warning(f"CJ 产品缺少 advertiserId (ID: {cj_product.get('id')})")
            return None
        if not cj_product.get('id'):
            logger.warning(f"CJ 产品缺少 id (ID: {cj_product.get('id')})")
            return None

        # 获取商品分类
        categories = []
        if cj_product.get('productType') and isinstance(cj_product['productType'], list):
            categories.extend(cj_product['productType'])
        if cj_product.get('googleProductCategory') and cj_product['googleProductCategory'].get('name'):
            categories.append(cj_product['googleProductCategory']['name'])
        
        return UnifiedProduct(
            source_api=source_api_name,
            source_product_id=str(cj_product.get('id')),
            brand_name=cj_product.get('advertiserName', brand_name), # API可能提供，否则用配置的
            source_advertiser_id=str(cj_product.get('advertiserId')),
            title=cj_product.get('title', 'N/A'),
            description=cj_product.get('description', ''),
            price=float(price_info['amount']),
            currency=price_info.get('currency', 'USD'),
            product_url=cj_product['link'],  # 直接使用link字段
            image_url=cj_product['imageLink'],
            availability=cj_product.get('availability', 'in stock').lower() == 'in stock', # 假设 'in stock' 表示有货
            sale_price=None,
            categories=categories,  # 使用提取的分类
            raw_data=cj_product
        )

    def fetch_cj_products(self, advertiser_id: str, brand_name: str, keywords_list: Optional[List[str]], limit: int = 70, output_raw_response: bool = False) -> List[UnifiedProduct]:
        """从 CJ API 获取特定广告商的产品，并按关键词列表进行OR逻辑过滤。"""
        if not get_products_by_advertiser:
            logger.warning("CJ 产品获取功能不可用，无法获取产品。")
            return []
        
        # 日志中记录关键词列表
        keywords_display = ", ".join(keywords_list) if keywords_list else "无"
        logger.info(f"正在从 CJ API 获取品牌 '{brand_name}' (Advertiser ID: {advertiser_id}) 的产品，关键词列表: [{keywords_display}], 限制: {limit}")
        unified_products: List[UnifiedProduct] = []
        try:
            initial_fetch_limit = max(limit * 5, MAX_RAW_PRODUCTS_TO_SCAN_FROM_FEED + 10)
            raw_cj_data = get_products_by_advertiser(advertiser_id=advertiser_id, limit=initial_fetch_limit, output_raw_response=output_raw_response) 

            if raw_cj_data and raw_cj_data.get('data') and raw_cj_data['data'].get('products'):
                products_list = raw_cj_data['data']['products'].get('resultList', [])
                total_products_fetched_in_call = len(products_list)
                count = 0
                skipped_no_data = 0 
                skipped_invalid_image = 0 
                skipped_keyword_mismatch = 0 
                skipped_other_reasons = 0 
                attempted_cj_products_count = 0
                
                for cj_prod_data in products_list:
                    attempted_cj_products_count += 1
                    if attempted_cj_products_count > MAX_RAW_PRODUCTS_TO_SCAN_FROM_FEED and count < limit:
                        logger.warning(f"CJ: For '{brand_name}', scanned {MAX_RAW_PRODUCTS_TO_SCAN_FROM_FEED} raw products from API feed but only found {count}/{limit} valid ones. Stopping scan for this brand.")
                        break

                    # 实现OR客户端过滤逻辑
                    if keywords_list: # keywords_list 是类似 ['Work Boot', 'Waterproof'] 的列表
                        title = cj_prod_data.get('title', '').lower()
                        description = cj_prod_data.get('description', '').lower()
                        
                        any_phrase_matched = False # 假设没有关键词匹配
                        matched_keywords = []
                        
                        for phrase in keywords_list:
                            phrase_lower = phrase.lower()
                            if phrase_lower in title or phrase_lower in description:
                                any_phrase_matched = True # 只要有一个短语匹配，则此产品符合OR条件
                                matched_keywords.append(phrase)
                        
                        if not any_phrase_matched:
                            skipped_keyword_mismatch += 1
                            continue
                        # 如果代码执行到这里，意味着至少一个关键词短语匹配了。
                    
                    unified_prod = self._cj_product_to_unified(cj_prod_data, brand_name, 'cj')
                    if unified_prod:
                        # 如果有匹配的关键词，则附加到产品上
                        if keywords_list and 'matched_keywords' in locals() and matched_keywords:
                            unified_prod.keywords_matched = matched_keywords
                        unified_products.append(unified_prod)
                        count += 1
                        if count >= limit:  
                            break
                    else:
                        if not cj_prod_data.get('link') or not cj_prod_data.get('title') or not cj_prod_data.get('imageLink'):
                            skipped_no_data +=1
                        elif cj_prod_data.get('imageLink') and not self._is_valid_image_url(cj_prod_data.get('imageLink')):
                             skipped_invalid_image += 1
                        else:
                            skipped_other_reasons += 1
                
                logger.info(f"CJ 产品统计 for '{brand_name}' - API调用获取: {total_products_fetched_in_call}, 扫描原始产品数: {attempted_cj_products_count}, 成功转换: {len(unified_products)}, "
                           f"跳过(关键词不匹配): {skipped_keyword_mismatch}, "
                           f"跳过(缺少核心数据): {skipped_no_data}, 跳过(图片链接无效): {skipped_invalid_image}, "
                           f"跳过(其他转换原因): {skipped_other_reasons}")
            else:
                error_info = raw_cj_data.get('errors') if raw_cj_data else "No data returned"
                logger.bind(brand_fetch_error=True).error(f"从 CJ API 获取品牌 '{brand_name}' (Advertiser ID: {advertiser_id}) 的产品失败。错误: {error_info}")

        except Exception as e:
            logger.bind(brand_fetch_error=True).error(f"从 CJ API 获取品牌 '{brand_name}' (Advertiser ID: {advertiser_id}) 产品时发生错误: {e}", exc_info=True)
        
        logger.info(f"为品牌 '{brand_name}' (CJ) 获取并转换了 {len(unified_products)} 个产品。")
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
                    logger.warning(f"Pepperjam 产品价格格式无效: {price_str} (Name: {pj_product.get('name')})")
                    return None
            else:
                logger.warning(f"Pepperjam 产品缺少价格信息 (Name: {pj_product.get('name')})")
                return None

            sale_price_amount = None
            if sale_price_str:
                try:
                    sale_price_amount = float(sale_price_str)
                except (ValueError, TypeError):
                    logger.warning(f"Pepperjam 产品促销价格格式无效: {sale_price_str} (Name: {pj_product.get('name')})")
            
            # Pepperjam 的 `buy_url` 是联盟链接
            buy_url = pj_product.get('buy_url')
            if not buy_url:
                logger.warning(f"Pepperjam 产品缺少 buy_url (Name: {pj_product.get('name')})")
                return None
            if not pj_product.get('image_url'):
                logger.warning(f"Pepperjam 产品缺少 image_url (Name: {pj_product.get('name')})")
                return None
                
            # 添加图片链接有效性验证（如果需要）
            if not self.skip_image_validation and not self._is_valid_image_url(pj_product.get('image_url')):
                logger.warning(f"Pepperjam 产品图片链接无效 (ID: {pj_product.get('id', 'N/A')}, Name: {pj_product.get('name', 'N/A')}, image_url: {pj_product.get('image_url')}). 跳过此产品.")
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
            logger.error(f"转换 Pepperjam 产品 (Name: {pj_product.get('name')}) 为 UnifiedProduct 时失败: {e}", exc_info=True)
            return None

    def fetch_pepperjam_products(self, program_id: str, brand_name: str, keywords_list: Optional[List[str]], limit: int = 75, process_all: bool = True, output_raw_response: bool = False) -> List[UnifiedProduct]:
        """从 Pepperjam API 获取特定项目 (广告商) 的产品，并按关键词列表进行筛选。"""
        if not self.pepperjam_client:
            logger.warning("Pepperjam API 客户端不可用，无法获取产品。")
            return []

        keywords_display = ", ".join(keywords_list) if keywords_list else "无"
        logger.info(f"准备从 Pepperjam API 获取品牌 '{brand_name}' (Program ID: {program_id}) 的产品。原始关键词列表: [{keywords_display}], 目标产品数: {limit}, 处理所有API结果: {process_all}")
        
        unified_products: List[UnifiedProduct] = []
        all_raw_products_data_from_multiple_calls = [] # 用于存储所有API调用的原始数据
        seen_product_identifiers_for_dedup = set() # 用于在所有API调用结果中去重

        # API 单次调用时的获取数量
        api_fetch_limit_per_call = 50 # Pepperjam API 单次调用最大限制
        if limit > 0 and not keywords_list: # 如果没有关键词，目标是获取 limit 个产品
            api_fetch_limit_per_call = max(min(limit * 2, 50), 10) # 获取目标数量的2倍，或至少10个，但不超过50
        elif keywords_list: # 如果有关键词，每个关键词获取 api_fetch_limit_per_call 个
            # api_fetch_limit_per_call 保持为50，以便获取足够多的候选
            pass 
            
        # 处理全部结果时不限制处理数量
        max_products_to_process = None if process_all else MAX_RAW_PRODUCTS_TO_SCAN_FROM_FEED

        # 处理关键词 - 根据Ascend API文档，keywords参数应该是一个完整的搜索词
        # 如果提供了多个关键词，我们应该分别发送请求
        api_call_keywords_terms: List[Optional[str]] = []
        if not keywords_list:
            api_call_keywords_terms.append(None) # 一次调用，无关键词
        else:
            # 每个关键词条目都是一个独立的搜索词
            for kw in keywords_list:
                api_call_keywords_terms.append(kw) # 每个关键词一次调用，但保持完整短语

        for api_keywords_term_for_call in api_call_keywords_terms:
            logger.info(f"Pepperjam: 品牌 '{brand_name}', 正在为关键词短语 '{api_keywords_term_for_call or '无(获取所有)'}' 进行API请求 (limit: {api_fetch_limit_per_call})...")
            try:
                raw_pj_data_single_call = self.pepperjam_client.get_publisher_product_creatives(
                    program_ids=program_id,
                    keywords=api_keywords_term_for_call, # 完整的关键词短语
                    page=1, # 简单起见，只获取第一页
                    limit=api_fetch_limit_per_call,
                    output_raw_response=output_raw_response
                )
                
                # 如果需要，保存原始响应到文件
                if output_raw_response:
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    output_dir = Path("output") / "raw_responses"
                    output_dir.mkdir(parents=True, exist_ok=True)
                    keyword_for_filename = api_keywords_term_for_call or "no_keyword"
                    # 替换不适合文件名的字符
                    safe_keyword = re.sub(r'[^\w.-]', '_', keyword_for_filename)
                    response_file = output_dir / f"pepperjam_raw_response_{brand_name}_{program_id}_{safe_keyword}_{timestamp}.json"
                    
                    with open(response_file, 'w', encoding='utf-8') as f:
                        json.dump(raw_pj_data_single_call, f, indent=2, ensure_ascii=False)
                    logger.info(f"已保存Pepperjam API原始响应到文件: {response_file}")
                
                if raw_pj_data_single_call and raw_pj_data_single_call.get('meta', {}).get('status', {}).get('code') == 200 and 'data' in raw_pj_data_single_call:
                    logger.debug(f"Pepperjam: API调用成功 (关键词短语: '{api_keywords_term_for_call or '无'}')，返回 {len(raw_pj_data_single_call['data'])} 个原始产品。")
                    for pj_prod_data in raw_pj_data_single_call['data']:
                        identifier_for_dedup = pj_prod_data.get('id') or pj_prod_data.get('name')
                        if identifier_for_dedup and identifier_for_dedup not in seen_product_identifiers_for_dedup:
                            # 为产品标记它是通过哪个关键词获取的 (如果适用)
                            if api_keywords_term_for_call:
                                pj_prod_data['_fetched_by_keyword'] = api_keywords_term_for_call
                            all_raw_products_data_from_multiple_calls.append(pj_prod_data)
                            seen_product_identifiers_for_dedup.add(identifier_for_dedup)
                        elif identifier_for_dedup in seen_product_identifiers_for_dedup:
                            logger.trace(f"Pepperjam: 产品标识符 {identifier_for_dedup} 已在先前API调用结果中见过 (当前关键词: '{api_keywords_term_for_call or '无'}')，跳过重复项。")
                        else:
                            logger.warning(f"Pepperjam: 产品缺少 'id' 和 'name' 字段，无法有效去重，跳过。关键词: '{api_keywords_term_for_call or '无'}', 数据片段: {str(pj_prod_data)[:200]}")
                else:
                    status_code = raw_pj_data_single_call.get('meta', {}).get('status', {}).get('code') if raw_pj_data_single_call and raw_pj_data_single_call.get('meta') else "N/A"
                    error_msg = raw_pj_data_single_call.get('meta', {}).get('status', {}).get('message') if raw_pj_data_single_call and raw_pj_data_single_call.get('meta') else "无数据返回或错误"
                    logger.bind(brand_fetch_error=True).warning(f"Pepperjam API 获取品牌 '{brand_name}' (Program ID: {program_id})，关键词 '{api_keywords_term_for_call or '无'}' 的产品失败或无结果。状态码: {status_code}, 消息: {error_msg}")
            
            except Exception as e_api_call:
                logger.bind(brand_fetch_error=True).error(f"Pepperjam API 调用 (关键词: '{api_keywords_term_for_call or '无'}') 获取品牌 '{brand_name}' (Program ID: {program_id}) 产品时发生错误: {e_api_call}", exc_info=True)
        
        # 现在处理收集到的 all_raw_products_data_from_multiple_calls
        total_unique_raw_products_fetched = len(all_raw_products_data_from_multiple_calls)
        logger.info(f"Pepperjam: 品牌 '{brand_name}', 所有关键词API调用共获取到 {total_unique_raw_products_fetched} 个去重后的原始产品。")

        count = 0
        skipped_no_data = 0
        skipped_invalid_image = 0
        # skipped_keyword_mismatch_pepperjam 计数器不再适用，因为我们是按单个关键词获取的
        skipped_other_reasons = 0
        processed_raw_products_count = 0

        for pj_prod_data in all_raw_products_data_from_multiple_calls:
            processed_raw_products_count +=1
            # 如果启用了处理限制且达到限制，则停止处理更多产品
            if max_products_to_process is not None and processed_raw_products_count > max_products_to_process and count < limit:
                 logger.warning(f"Pepperjam: 品牌 '{brand_name}', 已处理 {max_products_to_process} 个原始产品(配置的限制)，但仅转换了 {count}/{limit} 个有效产品。停止进一步处理。")
                 break
            # 即使处理了max_raw_products_to_scan_from_feed，如果已满足limit，也应停止
            if not process_all and count >= limit:
                logger.debug(f"Pepperjam: 已达到目标产品数量 {limit}，停止转换。已处理 {processed_raw_products_count-1}/{total_unique_raw_products_fetched} 个原始产品。")
                break

            unified_prod = self._pepperjam_product_to_unified(pj_prod_data, brand_name, program_id)
            
            if unified_prod:
                # 填充 keywords_matched 字段 (如果产品是通过特定关键词获取的)
                fetched_by_keyword = pj_prod_data.get('_fetched_by_keyword')
                if fetched_by_keyword:
                    unified_prod.keywords_matched = [fetched_by_keyword]
                
                # 注意：此处不再进行客户端AND过滤，因为产品是基于单个关键词获取的
                # 如果原始 keywords_list 为空 (即获取所有产品)，则也不会有 fetched_by_keyword
                
                unified_products.append(unified_prod)
                count += 1
                # 此处的 limit 检查已移到循环开始处
            else: # _pepperjam_product_to_unified 返回 None
                has_image_url = bool(pj_prod_data.get('image_url'))
                if not pj_prod_data.get('buy_url') or not pj_prod_data.get('image_url') or not pj_prod_data.get('price'):
                    skipped_no_data += 1
                elif has_image_url and not self._is_valid_image_url(pj_prod_data.get('image_url')):
                    skipped_invalid_image += 1
                else:
                    skipped_other_reasons += 1
        
        logger.info(f"Pepperjam 产品统计 for '{brand_name}' - "
                   f"API调用获取原始产品数 (去重后): {total_unique_raw_products_fetched} (基于关键词列表: '{keywords_display}'), "
                   f"扫描转换/过滤的原始产品数: {processed_raw_products_count if count < limit else count + skipped_no_data + skipped_invalid_image + skipped_other_reasons}, " # 调整计数器显示逻辑
                   f"成功转换: {len(unified_products)}, "
                   # f"跳过(客户端AND不匹配): {skipped_keyword_mismatch_pepperjam}, " # 已移除
                   f"跳过(缺少核心数据): {skipped_no_data}, "
                   f"跳过(图片链接无效): {skipped_invalid_image}, "
                   f"跳过(其他转换原因): {skipped_other_reasons}")

        logger.info(f"为品牌 '{brand_name}' (Pepperjam) 获取并转换了 {len(unified_products)} 个产品 (目标: {limit})。")
        return unified_products[:limit] # 确保最终返回不超过 limit 个产品

# 示例用法:
if __name__ == '__main__':
    # 配置基本日志记录 (如果直接运行此文件进行测试)
    # logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
    # logger_main = logging.getLogger(__name__) # 获取主模块的 logger
    # 使用导入的 logger
    logger.info("ProductRetriever 测试 (Loguru)...")

    retriever = ProductRetriever()

    # 测试 CJ (需要配置 .env 和 CJ_product_fetcher.py 中的 CJ_API_TOKEN, COMPANY_ID)
    # 假设 CJ_product_fetcher.search_products 已被修改为接受 advertiserIds，或者我们在此进行客户端过滤
    # 当前 CJ_product_fetcher.search_products 不接受 advertiser_id, 我们在 fetch_cj_products 中进行客户端筛选
    logger.info("\n--- 测试 CJ API 获取 ---")
    # 需要一个真实的 CJ advertiser ID 和关键词来进行有效测试
    # 例如: Dreo (ID: 6088764)
    if cj_search_products and os.getenv('CJ_API_TOKEN') and os.getenv('BRAND_CID'):
        cj_products_test = retriever.fetch_cj_products(advertiser_id='6088764', brand_name='Dreo', keywords_list=['air fryer'], limit=5)
        if cj_products_test:
            logger.info(f"获取到 {len(cj_products_test)} 个 CJ 产品:")
            for i, prod in enumerate(cj_products_test):
                logger.info(f"  {i+1}. {prod.title} (SKU: {prod.sku}, Price: {prod.price} {prod.currency}, Available: {prod.availability})")
        else:
            logger.warning("未能从 CJ 获取测试产品。")
    else:
        logger.warning("跳过 CJ API 测试，因为客户端或凭证未完全配置。")

    # 测试 Pepperjam (需要配置 .env 和 PepperjamPublisherAPI 的 ASCEND_API_KEY)
    logger.info("\n--- 测试 Pepperjam API 获取 ---")
    # 需要一个真实的 Pepperjam program ID 和关键词
    # 例如，用户提供的 program_id = '6200'
    if retriever.pepperjam_client and os.getenv('ASCEND_API_KEY'):
        pj_products_test = retriever.fetch_pepperjam_products(program_id='6200', brand_name='YourPepperjamBrand', keywords_list=['boots'], limit=5)
        if pj_products_test:
            logger.info(f"获取到 {len(pj_products_test)} 个 Pepperjam 产品:")
            for i, prod in enumerate(pj_products_test):
                logger.info(f"  {i+1}. {prod.title} (SKU: {prod.sku}, Price: {prod.price} {prod.currency}, Available: {prod.availability})")
        else:
            logger.warning("未能从 Pepperjam 获取测试产品。")
    else:
        logger.warning("跳过 Pepperjam API 测试，因为客户端或凭证未完全配置。") 