#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
CJ商品查询工具
使用GraphQL API获取广告商商品
"""

import os
import json
import argparse
from pathlib import Path
from datetime import datetime
import requests
from dotenv import load_dotenv
from loguru import logger # 导入 loguru logger

# 加载环境变量
load_dotenv()

# 配置日志记录器 - Loguru 在 main.py 中配置，这里不需要单独配置
# # 日志级别可以通过环境变量 LOG_LEVEL 控制，默认为 INFO
# # 日志格式包含时间、级别、模块名、函数名和消息
# logging.basicConfig(
#     level=os.getenv('LOG_LEVEL', 'INFO').upper(),
#     format='%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s'
# )
# logger = logging.getLogger(__name__) # 为当前模块创建一个日志记录器实例

# API配置
CJ_API_ENDPOINT = os.getenv('CJ_API_ENDPOINT', 'https://ads.api.cj.com/query')
CJ_API_TOKEN = os.getenv('CJ_API_TOKEN')
COMPANY_ID = os.getenv('CJ_CID') or os.getenv('BRAND_CID') or '7520009'
CJ_PID = os.getenv('CJ_PID', '')

def get_products_by_advertiser(advertiser_id, limit=50, output_raw_response=False):
    """
    根据广告商ID查询商品
    
    Args:
        advertiser_id (str): 广告商ID
        limit (int): 返回结果数量限制
        output_raw_response (bool): 是否将原始响应保存到文件
        
    Returns:
        dict: 查询结果
    """
    # 构建GraphQL查询
    # 注意：根据 CJ API 的规则，当使用 Publisher Company ID 查询特定广告商的产品时，
    # 需要使用 partnerIds 参数，而不是 advertiserIds。
    query = f"""
    {{
      products(companyId: "{COMPANY_ID}", partnerIds: ["{advertiser_id}"], limit: {limit}) {{
        totalCount
        count
        resultList {{
          advertiserId
          advertiserName
          id
          title
          description
          price {{
            amount
            currency
          }}
          imageLink
          link
          brand
          ... on Shopping {{
            gtin
            mpn
            condition
            availability
            color
            size
            material
            gender
            ageGroup
            salePrice {{
              amount
              currency
            }}
            googleProductCategory {{
              id
              name
            }}
            productType
            customLabel0
            customLabel1
            shipping {{
              price {{
                amount
                currency
              }}
              country
            }}
          }}
          lastUpdated
        }}
      }}
    }}
    """
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    body = json.dumps({'query': query})
    
    try:
        logger.info(f'正在查询广告商 {advertiser_id} 的商品...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        
        # 获取原始响应文本
        response_text = response.text
        logger.debug('--- API 原始响应文本 ---')
        logger.debug(response_text)
        logger.debug('--- API 原始响应文本结束 ---')
        
        # 如果需要，保存原始响应到文件
        if output_raw_response:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_dir = Path("output") / "raw_responses"
            output_dir.mkdir(parents=True, exist_ok=True)
            response_file = output_dir / f"cj_raw_response_{advertiser_id}_{timestamp}.json"
            
            with open(response_file, 'w', encoding='utf-8') as f:
                f.write(response_text)
            logger.info(f"已保存CJ API原始响应到文件: {response_file}")
        
        # 检查HTTP状态码
        response.raise_for_status()
        
        # 解析JSON响应
        try:
            json_data = response.json()
            logger.debug('--- JSON 解析结果 ---')
            logger.debug(json.dumps(json_data, indent=2, ensure_ascii=False))
            logger.debug('--- JSON 解析结束 ---')
            return json_data
        except json.JSONDecodeError as parse_error:
            logger.error(f'解析 JSON 响应出错: {parse_error}')
            logger.error(f'无法解析的响应文本: {response_text}')
            raise Exception('无法解析 API 返回的 JSON 数据')
            
    except requests.exceptions.RequestException as error:
        logger.error(f'查询广告商 {advertiser_id} 的商品时出错:')
        if hasattr(error, 'response'):
            logger.error(f'API响应状态: {error.response.status_code}')
            try:
                logger.error(f'API返回的错误详情: {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                logger.error(f'API返回的原始内容: {error.response.text}')
        else:
            logger.error(f'原始错误: {error}')
        raise error

def search_products(keyword, limit=50):
    """
    根据关键词搜索商品
    
    Args:
        keyword (str): 搜索关键词
        limit (int): 返回结果数量限制
        
    Returns:
        dict: 查询结果
    """
    # 构建GraphQL查询 - 使用products字段并通过客户端过滤
    query = f"""
    {{
      products(companyId: "{COMPANY_ID}", limit: {limit}) {{
        totalCount
        count
        resultList {{
          id
          title
          description
          price {{
            amount
            currency
          }}
          imageLink
          link
          advertiserName
          advertiserId
          brand
          ... on Shopping {{
            availability
            condition
            gtin
            mpn
            color
            size
            material
            gender
            ageGroup
            salePrice {{
              amount
              currency
            }}
            googleProductCategory {{
              id
              name
            }}
            productType
            customLabel0
            customLabel1
            shipping {{
              price {{
                amount
                currency
              }}
              country
            }}
          }}
          lastUpdated
        }}
      }}
    }}
    """
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    body = json.dumps({'query': query})
    
    try:
        logger.info(f'正在搜索关键词 "{keyword}" 的商品...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        
        # 获取原始响应文本
        response_text = response.text
        logger.debug('--- API 原始响应文本 (搜索) ---')
        logger.debug(response_text)
        logger.debug('--- API 原始响应文本结束 (搜索) ---')
        
        response.raise_for_status()
        
        # 解析JSON响应
        try:
            json_data = response.json()
            logger.debug('--- JSON 解析结果 (搜索) ---')
            logger.debug(json.dumps(json_data, indent=2, ensure_ascii=False))
            logger.debug('--- JSON 解析结束 (搜索) ---')
            
            # 在客户端进行关键词过滤
            if json_data and 'data' in json_data and 'products' in json_data['data']:
                products_data = json_data['data']['products']
                all_products = products_data.get('resultList', [])
                
                # 过滤包含关键词的商品
                keyword_lower = keyword.lower()
                filtered_products = []
                
                for product in all_products:
                    title = (product.get('title', '') or '').lower()
                    description = (product.get('description', '') or '').lower()
                    brand = (product.get('brand', '') or '').lower()
                    
                    if (keyword_lower in title or 
                        keyword_lower in description or 
                        keyword_lower in brand):
                        filtered_products.append(product)
                
                # 更新结果
                json_data['data']['products']['resultList'] = filtered_products[:limit]
                json_data['data']['products']['count'] = len(filtered_products[:limit])
                
                logger.info(f'从 {len(all_products)} 个商品中筛选出 {len(filtered_products)} 个匹配 "{keyword}" 的商品')
            
            return json_data
        except json.JSONDecodeError as parse_error:
            logger.error(f'解析 JSON 响应出错 (搜索关键词: {keyword}): {parse_error}')
            logger.error(f'无法解析的响应文本 (搜索): {response_text}')
            raise Exception('无法解析 API 返回的 JSON 数据 (搜索)')
            
    except requests.exceptions.RequestException as error:
        logger.error(f'搜索商品出错 (关键词: {keyword}): {error}')
        if hasattr(error, 'response'):
            logger.error(f'API响应状态 (搜索): {error.response.status_code}')
            try:
                logger.error(f'GraphQL错误 (搜索): {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                logger.error(f'API返回的原始内容 (搜索): {error.response.text}')
        else:
            logger.error(f'原始错误 (搜索关键词: {keyword}): {error}')
        raise error

def get_joined_advertiser_products(limit=50):
    """
    获取已加入广告商的商品
    
    Args:
        limit (int): 返回结果数量限制
        
    Returns:
        dict: 查询结果
    """
    # 构建GraphQL查询 - 使用products字段而不是productSearch
    query = f"""
    {{
      products(companyId: "{COMPANY_ID}", limit: {limit}) {{
        totalCount
        count
        resultList {{
          id
          title
          description
          price {{
            amount
            currency
          }}
          imageLink
          link
          advertiserName
          advertiserId
          brand
          ... on Shopping {{
            availability
            condition
            gtin
            mpn
            color
            size
            material
            gender
            ageGroup
            salePrice {{
              amount
              currency
            }}
            googleProductCategory {{
              id
              name
            }}
            productType
            customLabel0
            customLabel1
            shipping {{
              price {{
                amount
                currency
              }}
              country
            }}
          }}
          lastUpdated
        }}
      }}
    }}
    """
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    body = json.dumps({'query': query})
    
    try:
        logger.info('正在查询已加入广告商的商品...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)

        # 获取原始响应文本
        response_text = response.text
        logger.debug('--- API 原始响应文本 (已加入广告商) ---')
        logger.debug(response_text)
        logger.debug('--- API 原始响应文本结束 (已加入广告商) ---')

        response.raise_for_status()
        
        # 解析JSON响应
        try:
            json_data = response.json()
            logger.debug('--- JSON 解析结果 (已加入广告商) ---')
            logger.debug(json.dumps(json_data, indent=2, ensure_ascii=False))
            logger.debug('--- JSON 解析结束 (已加入广告商) ---')
            return json_data
        except json.JSONDecodeError as parse_error:
            logger.error(f'解析 JSON 响应出错 (已加入广告商): {parse_error}')
            logger.error(f'无法解析的响应文本 (已加入广告商): {response_text}')
            raise Exception('无法解析 API 返回的 JSON 数据 (已加入广告商)')
            
    except requests.exceptions.RequestException as error:
        logger.error(f'查询已加入广告商商品出错: {error}')
        if hasattr(error, 'response'):
            logger.error(f'API响应状态 (已加入广告商): {error.response.status_code}')
            try:
                logger.error(f'GraphQL错误 (已加入广告商): {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                logger.error(f'API返回的原始内容 (已加入广告商): {error.response.text}')
        else:
            logger.error(f'原始错误 (已加入广告商): {error}')
        raise error

def get_joined_advertisers(limit=100):
    """
    获取已加入的广告商列表
    
    Args:
        limit (int): 返回结果数量限制
        
    Returns:
        dict: 广告商列表
    """
    # 构建GraphQL查询 - 获取商品但只提取广告商信息
    query = f"""
    {{
      products(companyId: "{COMPANY_ID}", limit: {limit}) {{
        totalCount
        count
        resultList {{
          advertiserId
          advertiserName
          brand
        }}
      }}
    }}
    """
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    body = json.dumps({'query': query})
    
    try:
        logger.info(f'正在获取已加入的广告商列表 (限制: {limit})...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        response.raise_for_status()
        
        json_data = response.json()
        
        if json_data and 'data' in json_data and 'products' in json_data['data']:
            products_data = json_data['data']['products']
            all_products = products_data.get('resultList', [])
            
            # 提取唯一的广告商信息
            advertisers_dict = {}
            for product in all_products:
                advertiser_id = product.get('advertiserId')
                advertiser_name = product.get('advertiserName')
                brand = product.get('brand')
                
                if advertiser_id and advertiser_name:
                    if advertiser_id not in advertisers_dict:
                        advertisers_dict[advertiser_id] = {
                            'id': advertiser_id,
                            'name': advertiser_name,
                            'brands': set()
                        }
                    
                    # 添加品牌信息
                    if brand and brand != advertiser_name:
                        advertisers_dict[advertiser_id]['brands'].add(brand)
            
            # 转换为列表格式，并将set转换为list
            advertisers_list = []
            for advertiser_info in advertisers_dict.values():
                advertiser_info['brands'] = list(advertiser_info['brands'])
                advertisers_list.append(advertiser_info)
            
            # 按广告商名称排序
            advertisers_list.sort(key=lambda x: x['name'])
            
            logger.info(f'成功获取到 {len(advertisers_list)} 个已加入的广告商')
            
            return {
                'advertisers': advertisers_list,
                'total_count': len(advertisers_list)
            }
        else:
            error_info = json_data.get('errors') if json_data else "No data returned"
            logger.error(f'获取广告商列表失败。错误: {error_info}')
            return {'advertisers': [], 'total_count': 0}
            
    except requests.exceptions.RequestException as error:
        logger.error(f'获取广告商列表出错: {error}')
        if hasattr(error, 'response'):
            logger.error(f'API响应状态: {error.response.status_code}')
            try:
                logger.error(f'API返回的错误详情: {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                logger.error(f'API返回的原始内容: {error.response.text}')
        raise error

def get_all_advertisers_via_lookup_api():
    """
    使用CJ Advertiser Lookup REST API获取所有已加入的广告商
    
    Returns:
        dict: 广告商列表
    """
    # CJ Advertiser Lookup API端点
    lookup_url = "https://advertiser-lookup.api.cj.com/v3/advertiser-lookup"
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Accept': 'application/xml',  # CJ API通常返回XML格式
        'User-Agent': 'Mozilla/5.0 (compatible; CJ-API-Client/1.0)'
    }
    
    params = {
        'cid': COMPANY_ID,
        'relationship-status': 'joined',  # 只获取已加入的广告商
        'records-per-page': 100  # 每页最多100条记录
    }
    
    try:
        logger.info('正在通过Advertiser Lookup API获取已加入的广告商列表...')
        
        response = requests.get(lookup_url, headers=headers, params=params)
        response.raise_for_status()
        
        # 检查响应内容类型
        content_type = response.headers.get('content-type', '')
        logger.debug(f'API响应内容类型: {content_type}')
        logger.debug(f'API响应状态码: {response.status_code}')
        
        # 解析响应
        if 'application/xml' in content_type or 'text/xml' in content_type:
            # 解析XML响应
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(response.text)
                logger.debug(f'API响应XML: {response.text[:1000]}...')
                
                # 处理CJ API XML响应格式
                advertisers_list = []
                
                # 查找所有advertiser元素
                for advertiser_elem in root.findall('.//{http://api.cj.com}advertiser'):
                    advertiser_info = {
                        'id': advertiser_elem.get('advertiser-id', ''),
                        'name': advertiser_elem.get('advertiser-name', ''),
                        'website': '',
                        'category': '',
                        'relationship_status': advertiser_elem.get('relationship-status', ''),
                        'seven_day_epc': advertiser_elem.get('seven-day-epc', ''),
                        'three_month_epc': advertiser_elem.get('three-month-epc', '')
                    }
                    
                    # 获取分类信息
                    category_elem = advertiser_elem.find('.//{http://api.cj.com}category')
                    if category_elem is not None:
                        advertiser_info['category'] = category_elem.get('name', '')
                        advertiser_info['website'] = category_elem.get('parent', '')
                    
                    if advertiser_info['id'] and advertiser_info['name']:
                        advertisers_list.append(advertiser_info)
                        
            except ET.ParseError as e:
                logger.error(f'XML解析错误: {e}')
                logger.debug(f'无法解析的XML: {response.text[:500]}...')
                advertisers_list = []
                
        elif 'application/json' in content_type:
            # 保留JSON处理作为备选
            json_data = response.json()
            logger.debug(f'API响应数据: {json.dumps(json_data, indent=2, ensure_ascii=False)}')
            
            # 处理CJ API响应格式
            advertisers_list = []
            if 'cj:advertisers' in json_data:
                cj_advertisers = json_data['cj:advertisers']
                if 'cj:advertiser' in cj_advertisers:
                    advertisers_data = cj_advertisers['cj:advertiser']
                    
                    # 确保是列表格式
                    if not isinstance(advertisers_data, list):
                        advertisers_data = [advertisers_data]
                    
                    for advertiser in advertisers_data:
                        advertiser_info = {
                            'id': str(advertiser.get('cj:advertiser-id', '')),
                            'name': advertiser.get('cj:advertiser-name', ''),
                            'website': advertiser.get('cj:primary-category', {}).get('cj:parent', ''),
                            'category': advertiser.get('cj:primary-category', {}).get('cj:name', ''),
                            'relationship_status': advertiser.get('cj:relationship-status', ''),
                            'seven_day_epc': advertiser.get('cj:seven-day-epc', ''),
                            'three_month_epc': advertiser.get('cj:three-month-epc', '')
                        }
                        advertisers_list.append(advertiser_info)
            
            logger.info(f'通过Lookup API成功获取到 {len(advertisers_list)} 个已加入的广告商')
            
            return {
                'advertisers': advertisers_list,
                'total_count': len(advertisers_list),
                'source': 'lookup_api'
            }
        else:
            # 处理非JSON响应
            logger.warning(f'API返回非JSON响应，内容类型: {content_type}')
            logger.debug(f'响应内容: {response.text[:500]}...')
            return {'advertisers': [], 'total_count': 0, 'source': 'lookup_api', 'error': 'Non-JSON response'}
            
    except requests.exceptions.RequestException as error:
        logger.error(f'通过Lookup API获取广告商列表出错: {error}')
        if hasattr(error, 'response') and error.response is not None:
            logger.error(f'API响应状态: {error.response.status_code}')
            logger.error(f'API响应内容: {error.response.text}')
        return {'advertisers': [], 'total_count': 0, 'source': 'lookup_api', 'error': str(error)}

def get_advertisers_enhanced(limit=200):
    """
    增强版广告商获取：同时使用GraphQL和REST API
    
    Args:
        limit (int): GraphQL查询的商品限制
        
    Returns:
        dict: 合并后的广告商列表
    """
    logger.info('开始增强版广告商查询...')
    
    # 方法1: 通过GraphQL获取（从商品中提取）
    graphql_data = get_joined_advertisers(limit)
    graphql_advertisers = graphql_data.get('advertisers', [])
    
    # 方法2: 通过REST API获取
    rest_data = get_all_advertisers_via_lookup_api()
    rest_advertisers = rest_data.get('advertisers', [])
    
    # 合并两个数据源
    combined_advertisers = {}
    
    # 添加GraphQL获取的广告商
    for advertiser in graphql_advertisers:
        advertiser_id = advertiser['id']
        combined_advertisers[advertiser_id] = {
            'id': advertiser_id,
            'name': advertiser['name'],
            'brands': advertiser.get('brands', []),
            'source': 'graphql'
        }
    
    # 添加REST API获取的广告商，补充信息
    for advertiser in rest_advertisers:
        advertiser_id = advertiser['id']
        if advertiser_id in combined_advertisers:
            # 更新已有的广告商信息
            combined_advertisers[advertiser_id].update({
                'website': advertiser.get('website', ''),
                'category': advertiser.get('category', ''),
                'relationship_status': advertiser.get('relationship_status', ''),
                'seven_day_epc': advertiser.get('seven_day_epc', ''),
                'three_month_epc': advertiser.get('three_month_epc', ''),
                'source': 'both'
            })
        else:
            # 添加新的广告商
            combined_advertisers[advertiser_id] = {
                'id': advertiser_id,
                'name': advertiser['name'],
                'brands': [],
                'website': advertiser.get('website', ''),
                'category': advertiser.get('category', ''),
                'relationship_status': advertiser.get('relationship_status', ''),
                'seven_day_epc': advertiser.get('seven_day_epc', ''),
                'three_month_epc': advertiser.get('three_month_epc', ''),
                'source': 'rest_api'
            }
    
    # 转换为列表并排序
    final_advertisers = list(combined_advertisers.values())
    final_advertisers.sort(key=lambda x: x['name'])
    
    logger.info(f'增强版查询完成: GraphQL获取 {len(graphql_advertisers)} 个, REST API获取 {len(rest_advertisers)} 个, 合并后共 {len(final_advertisers)} 个广告商')
    
    return {
        'advertisers': final_advertisers,
        'total_count': len(final_advertisers),
        'graphql_count': len(graphql_advertisers),
        'rest_api_count': len(rest_advertisers),
        'source': 'combined'
    }

def get_more_advertisers_via_products(max_products=500):
    """
    通过大量商品查询获取更多广告商信息
    
    Args:
        max_products (int): 最大查询商品数量
        
    Returns:
        dict: 广告商列表
    """
    # 构建GraphQL查询 - 获取大量商品来覆盖更多广告商
    query = f"""
    {{
      products(companyId: "{COMPANY_ID}", limit: {max_products}) {{
        totalCount
        count
        resultList {{
          advertiserId
          advertiserName
          brand
          price {{
            amount
            currency
          }}
          title
        }}
      }}
    }}
    """
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    body = json.dumps({'query': query})
    
    try:
        logger.info(f'正在通过大量商品查询获取广告商信息 (最多 {max_products} 个商品)...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        response.raise_for_status()
        
        json_data = response.json()
        
        if json_data and 'data' in json_data and 'products' in json_data['data']:
            products_data = json_data['data']['products']
            all_products = products_data.get('resultList', [])
            
            logger.info(f'从API获取到 {len(all_products)} 个商品，开始提取广告商信息...')
            
            # 提取唯一的广告商信息，收集更多统计数据
            advertisers_dict = {}
            for product in all_products:
                advertiser_id = product.get('advertiserId')
                advertiser_name = product.get('advertiserName')
                brand = product.get('brand')
                price_info = product.get('price', {})
                
                if advertiser_id and advertiser_name:
                    if advertiser_id not in advertisers_dict:
                        advertisers_dict[advertiser_id] = {
                            'id': advertiser_id,
                            'name': advertiser_name,
                            'brands': set(),
                            'product_count': 0,
                            'sample_products': [],
                            'price_range': {'min': float('inf'), 'max': 0}
                        }
                    
                    # 更新统计信息
                    adv_info = advertisers_dict[advertiser_id]
                    adv_info['product_count'] += 1
                    
                    # 添加品牌信息
                    if brand and brand != advertiser_name:
                        adv_info['brands'].add(brand)
                    
                    # 收集样品商品
                    if len(adv_info['sample_products']) < 3:
                        adv_info['sample_products'].append(product.get('title', ''))
                    
                    # 更新价格范围
                    if price_info and price_info.get('amount'):
                        try:
                            price = float(price_info['amount'])
                            adv_info['price_range']['min'] = min(adv_info['price_range']['min'], price)
                            adv_info['price_range']['max'] = max(adv_info['price_range']['max'], price)
                        except (ValueError, TypeError):
                            pass
            
            # 转换为列表格式
            advertisers_list = []
            for advertiser_info in advertisers_dict.values():
                # 处理价格范围
                if advertiser_info['price_range']['min'] == float('inf'):
                    advertiser_info['price_range'] = None
                else:
                    price_range = advertiser_info['price_range']
                    advertiser_info['price_range'] = f"${price_range['min']:.2f} - ${price_range['max']:.2f}"
                
                # 转换set为list
                advertiser_info['brands'] = list(advertiser_info['brands'])
                advertisers_list.append(advertiser_info)
            
            # 按商品数量排序
            advertisers_list.sort(key=lambda x: x['product_count'], reverse=True)
            
            logger.info(f'成功提取到 {len(advertisers_list)} 个广告商的详细信息')
            
            return {
                'advertisers': advertisers_list,
                'total_count': len(advertisers_list),
                'total_products_scanned': len(all_products),
                'source': 'products_detailed'
            }
        else:
            error_info = json_data.get('errors') if json_data else "No data returned"
            logger.error(f'获取商品数据失败。错误: {error_info}')
            return {'advertisers': [], 'total_count': 0, 'source': 'products_detailed', 'error': str(error_info)}
            
    except requests.exceptions.RequestException as error:
        logger.error(f'通过商品查询获取广告商信息出错: {error}')
        return {'advertisers': [], 'total_count': 0, 'source': 'products_detailed', 'error': str(error)}

def get_program_terms_and_publishers():
    """
    查询CJ GraphQL API的可用字段，然后获取发布商信息
    
    Returns:
        dict: 发布商和计划条款信息
    """
    # 首先查询API的可用字段
    schema_query = """
    {
      __schema {
        queryType {
          fields {
            name
            description
            args {
              name
              type {
                name
                kind
              }
            }
          }
        }
      }
    }
    """
    
    headers = {
        'Authorization': f'Bearer {CJ_API_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    try:
        logger.info('正在查询CJ GraphQL API可用字段...')
        
        # 首先获取API schema
        schema_body = json.dumps({'query': schema_query})
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=schema_body)
        response.raise_for_status()
        
        schema_data = response.json()
        available_fields = []
        
        if schema_data and 'data' in schema_data and '__schema' in schema_data['data']:
            query_fields = schema_data['data']['__schema']['queryType']['fields']
            available_fields = [field['name'] for field in query_fields]
            logger.info(f'发现可用的GraphQL字段: {", ".join(available_fields[:10])}...')
        
        # 使用已知可用的products字段获取详细的广告商信息
        detailed_query = f"""
        {{
          products(companyId: "{COMPANY_ID}", limit: 300) {{
            totalCount
            count
            resultList {{
              advertiserId
              advertiserName
              brand
              title
              price {{
                amount
                currency
              }}
              link
              lastUpdated
            }}
          }}
        }}
        """
        
        logger.info('正在通过products字段获取发布商信息...')
        products_body = json.dumps({'query': detailed_query})
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=products_body)
        response.raise_for_status()
        
        json_data = response.json()
        
        if json_data and 'data' in json_data and 'products' in json_data['data']:
            products_data = json_data['data']['products']
            all_products = products_data.get('resultList', [])
            
            logger.info(f'从products API获取到 {len(all_products)} 个商品，分析发布商信息...')
            
            # 分析发布商信息
            publishers_dict = {}
            for product in all_products:
                advertiser_id = product.get('advertiserId')
                advertiser_name = product.get('advertiserName')
                
                if advertiser_id and advertiser_name:
                    if advertiser_id not in publishers_dict:
                        publishers_dict[advertiser_id] = {
                            'advertiser_id': advertiser_id,
                            'advertiser_name': advertiser_name,
                            'product_count': 0,
                            'brands': set(),
                            'price_range': {'min': float('inf'), 'max': 0},
                            'sample_products': [],
                            'last_updated': product.get('lastUpdated', ''),
                            'sample_links': []
                        }
                    
                    pub_info = publishers_dict[advertiser_id]
                    pub_info['product_count'] += 1
                    
                    # 收集品牌
                    if product.get('brand'):
                        pub_info['brands'].add(product.get('brand'))
                    
                    # 收集价格信息
                    price_info = product.get('price', {})
                    if price_info and price_info.get('amount'):
                        try:
                            price = float(price_info['amount'])
                            pub_info['price_range']['min'] = min(pub_info['price_range']['min'], price)
                            pub_info['price_range']['max'] = max(pub_info['price_range']['max'], price)
                        except (ValueError, TypeError):
                            pass
                    
                    # 收集样品信息
                    if len(pub_info['sample_products']) < 5:
                        pub_info['sample_products'].append(product.get('title', ''))
                    if len(pub_info['sample_links']) < 3:
                        pub_info['sample_links'].append(product.get('link', ''))
            
            # 转换为列表并格式化
            publishers_list = []
            for pub_info in publishers_dict.values():
                # 处理价格范围
                if pub_info['price_range']['min'] == float('inf'):
                    pub_info['price_range'] = 'N/A'
                else:
                    price_range = pub_info['price_range']
                    pub_info['price_range'] = f"${price_range['min']:.2f} - ${price_range['max']:.2f}"
                
                # 转换品牌集合为列表
                pub_info['brands'] = list(pub_info['brands'])
                
                publishers_list.append(pub_info)
            
            # 按产品数量排序
            publishers_list.sort(key=lambda x: x['product_count'], reverse=True)
            
            logger.info(f'成功分析 {len(publishers_list)} 个发布商的详细信息')
            
            return {
                'publishers': publishers_list,
                'total_count': len(publishers_list),
                'total_products_analyzed': len(all_products),
                'available_fields': available_fields,
                'source': 'products_analysis'
            }
        else:
            error_info = json_data.get('errors') if json_data else "No data returned"
            logger.error(f'Products查询失败。错误: {error_info}')
            return {'publishers': [], 'total_count': 0, 'source': 'products_analysis', 'error': str(error_info)}
            
    except requests.exceptions.RequestException as error:
        logger.error(f'发布商信息查询出错: {error}')
        if hasattr(error, 'response'):
            logger.error(f'API响应状态: {error.response.status_code}')
            try:
                logger.error(f'API返回的错误详情: {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                logger.error(f'API返回的原始内容: {error.response.text}')
        return {'publishers': [], 'total_count': 0, 'source': 'products_analysis', 'error': str(error)}

def save_to_json_file(data, filename):
    """
    将数据保存为JSON文件
    
    Args:
        data (dict): 要保存的数据
        filename (str): 文件名
    """
    # 确保输出目录存在
    output_dir = Path('output')
    output_dir.mkdir(exist_ok=True)
    
    # 添加时间戳到文件名
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    file_path = output_dir / f"{timestamp}_{filename}"
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    logger.info(f'数据已保存到 {file_path}')
    # 返回保存的文件路径，以便于其他地方使用
    return file_path

def main():
    """主函数: 命令行入口点"""
    parser = argparse.ArgumentParser(description='CJ商品查询工具')
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # 广告商商品子命令
    advertiser_parser = subparsers.add_parser('advertiser', help='获取指定广告商的商品')
    advertiser_parser.add_argument('advertiser_id', help='广告商ID')
    advertiser_parser.add_argument('--limit', type=int, default=50, help='返回结果数量限制 (默认: 50)')
    
    # 搜索商品子命令
    search_parser = subparsers.add_parser('search', help='搜索商品')
    search_parser.add_argument('keyword', help='搜索关键词')
    search_parser.add_argument('--limit', type=int, default=50, help='返回结果数量限制 (默认: 50)')
    
    # 已加入广告商子命令
    joined_parser = subparsers.add_parser('joined', help='获取已加入广告商的商品')
    joined_parser.add_argument('--limit', type=int, default=50, help='返回结果数量限制 (默认: 50)')
    
    # 广告商列表子命令
    advertisers_parser = subparsers.add_parser('advertisers', help='列出已加入的广告商')
    advertisers_parser.add_argument('--limit', type=int, default=100, help='返回结果数量限制 (默认: 100)')
    
    # Program Terms发布商查询子命令
    publishers_parser = subparsers.add_parser('publishers', help='通过Program Terms查询发布商信息')
    publishers_parser.add_argument('--save-details', action='store_true', help='保存详细的佣金和激励信息')
    
    args = parser.parse_args()
    
    try:
        if args.command == 'advertiser':
            logger.info(f'开始获取广告商 {args.advertiser_id} 的商品 (限制: {args.limit})...')
            data = get_products_by_advertiser(args.advertiser_id, args.limit)
            
            if data and 'data' in data and 'products' in data['data']:
                products_data = data['data']['products']
                logger.info(f'成功获取到 {products_data["count"]} 个商品，总共 {products_data["totalCount"]} 个')
                
                if products_data['count'] > 0:
                    logger.info(f'前5个商品列表:')
                    for i, product in enumerate(products_data['resultList'][:5]):
                        price_display = f"{product['price']['amount']} {product['price']['currency']}" if product.get('price') else '价格不可用'
                        logger.info(f"{i + 1}. {product['title']} - {price_display}")
                    
                    output_file = save_to_json_file(data, f"advertiser_{args.advertiser_id}_products.json")
                    logger.info(f'完整商品数据已保存到: {output_file}')
                else:
                    logger.warning(f'广告商 {args.advertiser_id} 没有符合条件的商品。')
            elif data and 'errors' in data:
                logger.error(f'GraphQL 查询返回错误: {json.dumps(data["errors"], indent=2, ensure_ascii=False)}')
            else:
                logger.warning('未从 API 获取到有效的商品数据结构。')
                logger.debug(f'收到的数据: {json.dumps(data, indent=2, ensure_ascii=False)}')
        
        elif args.command == 'search':
            logger.info(f'开始搜索关键词 "{args.keyword}" 的商品 (限制: {args.limit})...')
            data = search_products(args.keyword, args.limit)
            
            products_data = data.get('data', {}).get('products', {})
            logger.info(f'成功搜索到 {products_data.get("count", 0)} 个商品，总共 {products_data.get("totalCount", 0)} 个')
            
            if products_data.get('count', 0) > 0:
                logger.info(f'前5个搜索结果:')
                for i, product in enumerate(products_data['resultList'][:5]):
                    price = product.get('price', {})
                    price_display = f"{price.get('amount')} {price.get('currency')}" if price else '价格不可用'
                    logger.info(f"{i + 1}. {product['title']} - {price_display}")
                
                output_file = save_to_json_file(data, f"search_{args.keyword}_products.json")
                logger.info(f'完整搜索结果已保存到: {output_file}')
            else:
                logger.warning(f'未找到与 "{args.keyword}" 匹配的商品。')
        
        elif args.command == 'joined':
            logger.info(f'开始获取已加入广告商的商品 (限制: {args.limit})...')
            data = get_joined_advertiser_products(args.limit)
            
            products_data = data.get('data', {}).get('products', {})
            logger.info(f'成功获取到 {products_data.get("count", 0)} 个商品，总共 {products_data.get("totalCount", 0)} 个')
            
            if products_data.get('count', 0) > 0:
                logger.info(f'前5个已加入广告商的商品:')
                for i, product in enumerate(products_data['resultList'][:5]):
                    price = product.get('price', {})
                    price_display = f"{price.get('amount')} {price.get('currency')}" if price else '价格不可用'
                    logger.info(f"{i + 1}. {product['title']} - {price_display}")
                
                timestamp = datetime.now().strftime('%Y-%m-%d')
                output_file = save_to_json_file(data, f"joined_products_{timestamp}.json")
                logger.info(f'完整商品数据已保存到: {output_file}')
            else:
                logger.warning('未找到已加入广告商的商品。')
        
        elif args.command == 'advertisers':
            logger.info(f'开始获取已加入的广告商列表 (限制: {args.limit})...')
            # 使用新的详细方法获取更多广告商信息
            data = get_more_advertisers_via_products(args.limit * 5)
            
            advertisers = data.get('advertisers', [])
            total_count = data.get('total_count', 0)
            
            if total_count > 0:
                # 显示数据源信息
                source_info = ""
                if 'total_products_scanned' in data:
                    source_info = f"(扫描了 {data['total_products_scanned']} 个商品)"
                elif 'graphql_count' in data:
                    source_info = f"GraphQL: {data.get('graphql_count', 0)}, REST API: {data.get('rest_api_count', 0)}"
                
                logger.info(f'已加入的广告商列表 (共 {total_count} 个) {source_info}')
                logger.info('=' * 80)
                
                for i, advertiser in enumerate(advertisers, 1):
                    logger.info(f"{i:2d}. 广告商ID: {advertiser['id']}")
                    logger.info(f"    广告商名称: {advertiser['name']}")
                    
                    # 显示商品数量（如果有）
                    if 'product_count' in advertiser:
                        logger.info(f"    商品数量: {advertiser['product_count']}")
                    
                    # 显示品牌信息
                    if advertiser.get('brands'):
                        brands_str = ', '.join(advertiser['brands'])
                        logger.info(f"    旗下品牌: {brands_str}")
                    
                    # 显示价格范围
                    if advertiser.get('price_range'):
                        logger.info(f"    价格范围: {advertiser['price_range']}")
                    
                    # 显示样品商品
                    if advertiser.get('sample_products'):
                        sample_str = ', '.join(advertiser['sample_products'][:2])
                        logger.info(f"    样品商品: {sample_str}...")
                    
                    # 显示其他信息
                    if advertiser.get('category'):
                        logger.info(f"    类别: {advertiser['category']}")
                    if advertiser.get('seven_day_epc'):
                        logger.info(f"    7天EPC: {advertiser['seven_day_epc']}")
                    if advertiser.get('three_month_epc'):
                        logger.info(f"    3月EPC: {advertiser['three_month_epc']}")
                    
                    logger.info('-' * 60)
                
                # 保存广告商列表到文件
                timestamp = datetime.now().strftime('%Y-%m-%d')
                output_file = save_to_json_file(data, f"advertisers_list_{timestamp}.json")
                logger.info(f'广告商列表已保存到: {output_file}')
            else:
                logger.warning('未找到已加入的广告商。')
        
        elif args.command == 'publishers':
            logger.info('开始通过Program Terms查询发布商信息...')
            data = get_program_terms_and_publishers()
            
            publishers = data.get('publishers', [])
            total_count = data.get('total_count', 0)
            
            if total_count > 0:
                products_analyzed = data.get('total_products_analyzed', 0)
                logger.info(f'通过商品分析获取到的发布商信息 (共 {total_count} 个，分析了 {products_analyzed} 个商品):')
                logger.info('=' * 100)
                
                for i, publisher in enumerate(publishers, 1):
                    logger.info(f"{i:2d}. 广告商ID: {publisher['advertiser_id']}")
                    logger.info(f"    广告商名称: {publisher['advertiser_name']}")
                    logger.info(f"    商品数量: {publisher['product_count']}")
                    
                    # 显示价格范围
                    if publisher.get('price_range') and publisher['price_range'] != 'N/A':
                        logger.info(f"    价格范围: {publisher['price_range']}")
                    
                    # 显示品牌信息
                    if publisher.get('brands'):
                        brands_str = ', '.join(publisher['brands'][:3])
                        if len(publisher['brands']) > 3:
                            brands_str += f' (+{len(publisher["brands"]) - 3} 更多)'
                        logger.info(f"    相关品牌: {brands_str}")
                    
                    # 显示样品商品
                    if publisher.get('sample_products'):
                        samples = publisher['sample_products'][:3]
                        samples_str = ', '.join(samples)
                        if len(publisher['sample_products']) > 3:
                            samples_str += '...'
                        logger.info(f"    样品商品: {samples_str}")
                    
                    # 显示最后更新时间
                    if publisher.get('last_updated'):
                        logger.info(f"    最后更新: {publisher['last_updated']}")
                    
                    # 显示样品链接
                    if publisher.get('sample_links') and args.save_details:
                        logger.info(f"    样品链接数量: {len(publisher['sample_links'])}")
                    
                    logger.info('-' * 80)
                
                # 保存发布商信息到文件
                timestamp = datetime.now().strftime('%Y-%m-%d')
                filename_suffix = "detailed" if args.save_details else "summary"
                output_file = save_to_json_file(data, f"publishers_program_terms_{filename_suffix}_{timestamp}.json")
                logger.info(f'发布商信息已保存到: {output_file}')
                
                # 显示汇总统计
                logger.info(f'\n📊 发布商统计汇总:')
                logger.info(f'   总发布商数量: {total_count}')
                
                # 统计关系状态
                status_counts = {}
                for pub in publishers:
                    status = pub.get('relationship_status', 'Unknown')
                    status_counts[status] = status_counts.get(status, 0) + 1
                
                logger.info(f'   关系状态分布:')
                for status, count in status_counts.items():
                    logger.info(f'     {status}: {count}')
                
            else:
                logger.warning('未找到发布商信息。')
                if 'error' in data:
                    logger.error(f'错误详情: {data["error"]}')
        else:
            logger.error('请指定有效的子命令。使用 -h 查看帮助。')
            parser.print_help()
    
    except Exception as e:
        logger.error(f'执行失败: {e}', exc_info=True)  # 使用exc_info参数记录堆栈跟踪
        # 我们不再需要手动打印traceback，因为logging.error带exc_info=True会自动包含堆栈信息
        # 但如果特别需要，可以让traceback输出更详细的错误信息
        # import traceback
        # logger.debug(f'详细错误: {traceback.format_exc()}')

if __name__ == '__main__':
    main() 