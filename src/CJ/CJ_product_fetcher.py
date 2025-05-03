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

# 加载环境变量
load_dotenv()

# API配置
CJ_API_ENDPOINT = os.getenv('CJ_API_ENDPOINT', 'https://ads.api.cj.com/query')
CJ_API_TOKEN = os.getenv('CJ_API_TOKEN')
COMPANY_ID = os.getenv('BRAND_CID', '7520009')
CJ_PID = os.getenv('CJ_PID', '')

def get_products_by_advertiser(advertiser_id, limit=50):
    """
    根据广告商ID查询商品
    
    Args:
        advertiser_id (str): 广告商ID
        limit (int): 返回结果数量限制
        
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
        print(f'正在查询广告商 {advertiser_id} 的商品...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        
        # 获取原始响应文本
        response_text = response.text
        print('--- API 原始响应文本 ---')
        print(response_text)
        print('--- API 原始响应文本结束 ---')
        
        # 检查HTTP状态码
        response.raise_for_status()
        
        # 解析JSON响应
        try:
            json_data = response.json()
            print('--- JSON 解析结果 ---')
            print(json.dumps(json_data, indent=2, ensure_ascii=False))
            print('--- JSON 解析结束 ---')
            return json_data
        except json.JSONDecodeError as parse_error:
            print(f'解析 JSON 响应出错: {parse_error}')
            print(f'无法解析的响应文本: {response_text}')
            raise Exception('无法解析 API 返回的 JSON 数据')
            
    except requests.exceptions.RequestException as error:
        print(f'查询广告商 {advertiser_id} 的商品时出错:')
        if hasattr(error, 'response'):
            print(f'API响应状态: {error.response.status_code}')
            try:
                print(f'API返回的错误详情: {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                print(f'API返回的原始内容: {error.response.text}')
        else:
            print(f'原始错误: {error}')
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
        print(f'正在搜索关键词 "{keyword}" 的商品...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        response.raise_for_status()
        
        json_data = response.json()
        return json_data
        
    except requests.exceptions.RequestException as error:
        print(f'搜索商品出错: {error}')
        if hasattr(error, 'response'):
            try:
                print(f'GraphQL错误: {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                print(f'API返回的原始内容: {error.response.text}')
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
        print('正在查询已加入广告商的商品...')
        
        response = requests.post(CJ_API_ENDPOINT, headers=headers, data=body)
        response.raise_for_status()
        
        json_data = response.json()
        return json_data
        
    except requests.exceptions.RequestException as error:
        print(f'查询商品出错: {error}')
        if hasattr(error, 'response'):
            try:
                print(f'GraphQL错误: {json.dumps(error.response.json(), indent=2, ensure_ascii=False)}')
            except:
                print(f'API返回的原始内容: {error.response.text}')
        raise error

def save_to_json_file(data, filename):
    """
    保存查询结果到JSON文件
    
    Args:
        data (dict): 查询结果数据
        filename (str): 文件名
    """
    output_dir = Path(__file__).parent.parent / 'output'
    
    # 确保输出目录存在
    output_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = output_dir / filename
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f'数据已保存到 {file_path}')

def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='CJ商品查询工具')
    subparsers = parser.add_subparsers(dest='command', help='可用命令')
    
    # 查询特定广告商的商品
    advertiser_parser = subparsers.add_parser('advertiser', help='查询特定广告商的商品')
    advertiser_parser.add_argument('advertiser_id', help='广告商ID')
    advertiser_parser.add_argument('limit', nargs='?', type=int, default=50, help='返回结果数量限制')
    
    # 搜索关键词商品
    search_parser = subparsers.add_parser('search', help='搜索关键词商品')
    search_parser.add_argument('keyword', help='搜索关键词')
    search_parser.add_argument('limit', nargs='?', type=int, default=50, help='返回结果数量限制')
    
    # 查询所有已加入广告商的商品
    joined_parser = subparsers.add_parser('joined', help='查询所有已加入广告商的商品')
    joined_parser.add_argument('limit', nargs='?', type=int, default=50, help='返回结果数量限制')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        if args.command == 'advertiser':
            data = get_products_by_advertiser(args.advertiser_id, args.limit)
            
            if data and 'data' in data and 'products' in data['data']:
                products_data = data['data']['products']
                print(f'成功获取到 {products_data["count"]} 个商品，总共 {products_data["totalCount"]} 个')
                
                if products_data['count'] > 0:
                    print('\n前5个商品:')
                    for i, product in enumerate(products_data['resultList'][:5]):
                        price_display = f"{product['price']['amount']} {product['price']['currency']}" if product.get('price') else '价格不可用'
                        print(f"{i + 1}. {product['title']} - {price_display}")
                    
                    save_to_json_file(data, f"advertiser_{args.advertiser_id}_products.json")
            elif data and 'errors' in data:
                print(f'GraphQL 查询返回错误: {json.dumps(data["errors"], indent=2, ensure_ascii=False)}')
            else:
                print('未从 API 获取到有效的商品数据结构。')
                print(f'收到的数据: {json.dumps(data, indent=2, ensure_ascii=False)}')
        
        elif args.command == 'search':
            data = search_products(args.keyword, args.limit)
            
            product_search = data.get('data', {}).get('productSearch', {})
            print(f'成功搜索到 {product_search.get("count", 0)} 个商品，总共 {product_search.get("totalCount", 0)} 个')
            
            if product_search.get('count', 0) > 0:
                print('\n前5个商品:')
                for i, product in enumerate(product_search['resultList'][:5]):
                    price = product.get('price', {})
                    print(f"{i + 1}. {product['title']} - {price.get('amount')} {price.get('currency')}")
                
                save_to_json_file(data, f"search_{args.keyword}_products.json")
        
        elif args.command == 'joined':
            data = get_joined_advertiser_products(args.limit)
            
            product_search = data.get('data', {}).get('productSearch', {})
            print(f'成功获取到 {product_search.get("count", 0)} 个商品，总共 {product_search.get("totalCount", 0)} 个')
            
            if product_search.get('count', 0) > 0:
                print('\n前5个商品:')
                for i, product in enumerate(product_search['resultList'][:5]):
                    price = product.get('price', {})
                    print(f"{i + 1}. {product['title']} - {price.get('amount')} {price.get('currency')}")
                
                timestamp = datetime.now().strftime('%Y-%m-%d')
                save_to_json_file(data, f"joined_products_{timestamp}.json")
    
    except Exception as e:
        print(f'执行失败: {e}')
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == '__main__':
    main() 