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
COMPANY_ID = os.getenv('BRAND_CID', '7520009')
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
    # 构建GraphQL查询
    query = f"""
    {{
      productSearch(companyId: "{COMPANY_ID}", keyword: "{keyword}", limit: {limit}) {{
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
          linkCode(pid: "{CJ_PID}") {{
            clickUrl
          }}
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
    # 构建GraphQL查询
    query = f"""
    {{
      productSearch(companyId: "{COMPANY_ID}", limit: {limit}) {{
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
          advertiserWebsite
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
          linkCode(pid: "{CJ_PID}") {{
            clickUrl
          }}
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
            
            product_search = data.get('data', {}).get('productSearch', {})
            logger.info(f'成功搜索到 {product_search.get("count", 0)} 个商品，总共 {product_search.get("totalCount", 0)} 个')
            
            if product_search.get('count', 0) > 0:
                logger.info(f'前5个搜索结果:')
                for i, product in enumerate(product_search['resultList'][:5]):
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
            
            product_search = data.get('data', {}).get('productSearch', {})
            logger.info(f'成功获取到 {product_search.get("count", 0)} 个商品，总共 {product_search.get("totalCount", 0)} 个')
            
            if product_search.get('count', 0) > 0:
                logger.info(f'前5个已加入广告商的商品:')
                for i, product in enumerate(product_search['resultList'][:5]):
                    price = product.get('price', {})
                    price_display = f"{price.get('amount')} {price.get('currency')}" if price else '价格不可用'
                    logger.info(f"{i + 1}. {product['title']} - {price_display}")
                
                timestamp = datetime.now().strftime('%Y-%m-%d')
                output_file = save_to_json_file(data, f"joined_products_{timestamp}.json")
                logger.info(f'完整商品数据已保存到: {output_file}')
            else:
                logger.warning('未找到已加入广告商的商品。')
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