#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Pepperjam发布者API工具
使用Pepperjam API获取发布者商品数据
"""

import os
import json
import argparse
import time
from pathlib import Path
from datetime import datetime
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# API配置
PEPPERJAM_API_BASE_URL = os.getenv('PEPPERJAM_API_BASE_URL', 'https://api.pepperjamnetwork.com')
PEPPERJAM_API_KEY = os.getenv('PEPPERJAM_API_KEY', os.getenv('ASCEND_API_KEY'))
PEPPERJAM_API_VERSION = os.getenv('PEPPERJAM_API_VERSION', '20120402')

class PepperjamPublisherAPI:
    """Pepperjam Publisher API客户端"""
    
    def __init__(self, api_key=None, api_version=None, base_url=None):
        """
        初始化API客户端
        
        Args:
            api_key (str): API密钥，如果未提供则从环境变量读取
            api_version (str): API版本，如果未提供则从环境变量读取，默认为 '20120402'
            base_url (str): API基础URL，如果未提供则从环境变量读取
        """
        self.api_key = api_key or PEPPERJAM_API_KEY
        self.api_version = api_version or PEPPERJAM_API_VERSION
        self.base_url = base_url or PEPPERJAM_API_BASE_URL
        
        if not self.api_key:
            raise ValueError("缺少API密钥，请设置PEPPERJAM_API_KEY环境变量")
        
        # 创建一个带有重试功能的会话
        self.session = requests.Session()
        retries = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "DELETE"]
        )
        self.session.mount('http://', HTTPAdapter(max_retries=retries))
        self.session.mount('https://', HTTPAdapter(max_retries=retries))
    
    def _make_request(self, resource, method="GET", params=None, data=None, verify_ssl=True, max_retries=3):
        """
        发送API请求
        
        Args:
            resource (str): API资源
            method (str): HTTP方法 (GET, POST, PUT, DELETE)
            params (dict): URL参数
            data (dict): 请求体数据
            verify_ssl (bool): 是否验证SSL证书
            max_retries (int): 最大重试次数
            
        Returns:
            dict: API响应
        """
        # 修正URL构造，确保斜杠正确
        url = f"{self.base_url.rstrip('/')}/{self.api_version}/{resource}"
        
        # 构建请求参数
        request_params = {
            "apiKey": self.api_key,
            "format": "json"
        }
        
        # 如果有额外参数，添加到请求参数中
        if params:
            request_params.update(params)
        
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "PepperjamAPI-Python/1.0",
            "Accept": "application/json"
        }
        
        # 重试逻辑
        retry_count = 0
        last_error = None
        
        while retry_count < max_retries:
            try:
                print(f"正在请求 {resource} 资源...")
                print(f"URL: {url}")
                print(f"参数: {request_params}")
                
                if method == "GET":
                    response = self.session.get(
                        url, 
                        headers=headers, 
                        params=request_params,
                        verify=verify_ssl,
                        timeout=30
                    )
                elif method == "POST":
                    response = self.session.post(
                        url, 
                        headers=headers, 
                        params=request_params, 
                        json=data,
                        verify=verify_ssl,
                        timeout=30
                    )
                elif method == "PUT":
                    response = self.session.put(
                        url, 
                        headers=headers, 
                        params=request_params, 
                        json=data,
                        verify=verify_ssl,
                        timeout=30
                    )
                elif method == "DELETE":
                    response = self.session.delete(
                        url, 
                        headers=headers, 
                        params=request_params,
                        verify=verify_ssl,
                        timeout=30
                    )
                else:
                    raise ValueError(f"不支持的HTTP方法: {method}")
                
                # 检查状态码，如果是可重试的错误，继续重试
                if response.status_code >= 500:
                    print(f"服务器错误 (状态码: {response.status_code})，正在重试...")
                    retry_count += 1
                    time.sleep(1 * retry_count)  # 指数退避
                    continue
                
                # 检查HTTP状态码
                response.raise_for_status()
                
                # 打印响应内容以便调试
                print(f"响应状态码: {response.status_code}")
                print(f"响应头: {response.headers}")
                
                # 尝试解析响应
                try:
                    response_data = response.json()
                    print(f"请求成功, 状态码: {response_data.get('meta', {}).get('status', {}).get('code')}")
                    return response_data
                except json.JSONDecodeError:
                    print(f"JSON解析错误，原始响应内容: {response.text[:500]}...")
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        time.sleep(2 ** retry_count)
                        continue
                    return {"error": "无法解析JSON响应", "raw_response": response.text}
                
            except requests.exceptions.SSLError as error:
                print(f"SSL错误: {error}")
                if not verify_ssl:
                    # 如果已经禁用了SSL验证但仍然出错，说明问题不在SSL验证
                    last_error = error
                    break
                else:
                    # 尝试禁用SSL验证再试一次
                    print("尝试禁用SSL验证...")
                    verify_ssl = False
                    continue
                    
            except requests.exceptions.RequestException as error:
                print(f"请求错误 (尝试 {retry_count + 1}/{max_retries}): {error}")
                if hasattr(error, 'response') and error.response is not None:
                    print(f"状态码: {error.response.status_code}")
                    try:
                        print(f"错误详情: {error.response.json()}")
                    except:
                        print(f"错误内容: {error.response.text[:500]}...")
                
                last_error = error
                retry_count += 1
                
                if retry_count < max_retries:
                    sleep_time = 2 ** retry_count  # 指数退避
                    print(f"等待 {sleep_time} 秒后重试...")
                    time.sleep(sleep_time)
                else:
                    break
        
        # 如果所有重试都失败了
        if last_error:
            print(f"请求 {resource} 失败，已达到最大重试次数 ({max_retries})")
            raise last_error
        
        return None
        
    def get_publisher_product_creatives(self, program_ids=None, categories=None, 
                                         keywords=None, refurl=None, page=1, limit=2500,
                                         sort_by=None, sort_order=None):
        """
        获取发布者产品创意素材
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            categories (str): 逗号分隔的类别ID列表 (可选)
            keywords (str): 空格分隔的关键词列表 (可选)
            refurl (str): 关联流量和转化的URL (可选)
            page (int): 页码
            limit (int): 每页数量 (API限制最多2500条)
            sort_by (str): 排序字段 (例如: 'popularity', 'price', 'name' 等)
            sort_order (str): 排序顺序 ('asc' 或 'desc')
            
        Returns:
            dict: 产品创意素材数据
        """
        resource = "publisher/creative/product"
        params = {
            "page": page
        }
        
        if program_ids:
            params["programIds"] = program_ids
            
        if categories:
            params["categories"] = categories
            
        if keywords:
            params["keywords"] = keywords
            
        if refurl:
            params["refurl"] = refurl
            
        if sort_by:
            params["sortBy"] = sort_by
            
        if sort_order:
            params["sortOrder"] = sort_order
            
        # 添加数量限制参数 (如果API支持)
        if limit and limit != 2500:
            params["limit"] = limit
            
        return self._make_request(resource, params=params)
    
    def get_categories(self):
        """
        获取产品类别列表 (创意分类资源)
        
        Returns:
            dict: 类别列表
        """
        resource = "publisher/creative/category"
        return self._make_request(resource)
    
    def get_creative_categories(self):
        """
        获取创意分类资源 (与get_categories相同)
        
        Returns:
            dict: 创意分类数据
        """
        return self.get_categories()
    
    def get_generic_creatives(self, program_ids=None, category_ids=None, page=1):
        """
        获取通用创意资源
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            category_ids (str): 逗号分隔的分类ID列表 (可选)
            page (int): 页码
            
        Returns:
            dict: 通用创意数据
        """
        resource = "publisher/creative/generic"
        params = {
            "page": page
        }
        
        if program_ids:
            params["programIds"] = program_ids
            
        if category_ids:
            params["categoryIds"] = category_ids
            
        return self._make_request(resource, params=params)
    
    def get_text_creatives(self, program_ids=None, category_ids=None, page=1):
        """
        获取文本创意资源
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            category_ids (str): 逗号分隔的分类ID列表 (可选)
            page (int): 页码
            
        Returns:
            dict: 文本创意数据
        """
        resource = "publisher/creative/text"
        params = {
            "page": page
        }
        
        if program_ids:
            params["programIds"] = program_ids
            
        if category_ids:
            params["categoryIds"] = category_ids
            
        return self._make_request(resource, params=params)
    
    def get_coupon_creatives(self, program_ids=None, category_ids=None, page=1):
        """
        获取优惠券创意资源
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            category_ids (str): 逗号分隔的分类ID列表 (可选)
            page (int): 页码
            
        Returns:
            dict: 优惠券创意数据
        """
        resource = "publisher/creative/coupon"
        params = {
            "page": page
        }
        
        if program_ids:
            params["programIds"] = program_ids
            
        if category_ids:
            params["categoryIds"] = category_ids
            
        return self._make_request(resource, params=params)
    
    def get_banner_creatives(self, program_ids=None, category_ids=None, page=1):
        """
        获取横幅创意资源
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            category_ids (str): 逗号分隔的分类ID列表 (可选)
            page (int): 页码
            
        Returns:
            dict: 横幅创意数据
        """
        resource = "publisher/creative/banner"
        params = {
            "page": page
        }
        
        if program_ids:
            params["programIds"] = program_ids
            
        if category_ids:
            params["categoryIds"] = category_ids
            
        return self._make_request(resource, params=params)
    
    def get_advanced_links_creatives(self, program_ids=None, category_ids=None, page=1):
        """
        获取高级链接创意资源
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            category_ids (str): 逗号分隔的分类ID列表 (可选)
            page (int): 页码
            
        Returns:
            dict: 高级链接创意数据
        """
        resource = "publisher/creative/advanced-link"
        params = {
            "page": page
        }
        
        if program_ids:
            params["programIds"] = program_ids
            
        if category_ids:
            params["categoryIds"] = category_ids
            
        return self._make_request(resource, params=params)

def save_to_json_file(data, filename, limit=None):
    """
    将数据保存为JSON文件
    
    Args:
        data (dict): 要保存的数据
        filename (str): 文件名
        limit (int): 如果提供，则只保存指定数量的数据条目
    """
    # 创建输出目录
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    
    # 构造完整的文件路径
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = output_dir / f"{filename}_{timestamp}.json"
    
    # 如果需要限制结果数量，在这里处理
    if limit and isinstance(data, dict) and 'data' in data and isinstance(data['data'], list):
        print(f"API返回了 {len(data['data'])} 条数据，但根据您的设置将只保存前 {limit} 条")
        data['data'] = data['data'][:limit]
        # 也更新元数据中的总结果数
        if 'meta' in data and 'pagination' in data['meta'] and 'total_results' in data['meta']['pagination']:
            original_count = data['meta']['pagination']['total_results']
            data['meta']['pagination']['total_results'] = min(limit, original_count)
            print(f"原始数据总数: {original_count}，限制后数据总数: {data['meta']['pagination']['total_results']}")
    
    # 写入JSON文件
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, indent=2, ensure_ascii=False, fp=f)
    
    print(f"数据已保存到: {file_path}")
    return file_path

def main():
    """命令行入口函数"""
    parser = argparse.ArgumentParser(description='Pepperjam 发布者API工具')
    
    # 创建子命令
    subparsers = parser.add_subparsers(dest='command', help='子命令')
     
    # 获取发布者产品创意素材
    publisher_products_parser = subparsers.add_parser('publisher-products', help='获取发布者产品创意素材')
    publisher_products_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    publisher_products_parser.add_argument('--categories', help='逗号分隔的类别ID列表 (可选)')
    publisher_products_parser.add_argument('--keywords', help='空格分隔的关键词列表 (可选)')
    publisher_products_parser.add_argument('--refurl', help='关联流量和转化的URL (可选)')
    publisher_products_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    publisher_products_parser.add_argument('--limit', '-l', type=int, help='返回结果数量限制')
    publisher_products_parser.add_argument('--sort-by', choices=['popularity', 'price', 'name', 'date'], 
                                          help='排序字段 (例如: popularity, price, name, date)')
    publisher_products_parser.add_argument('--sort-order', choices=['asc', 'desc'], default='desc',
                                          help='排序顺序 (asc: 升序, desc: 降序)')
    
    # 获取类别
    categories_parser = subparsers.add_parser('categories', help='获取产品类别列表')
    
    # 获取通用创意
    generic_creatives_parser = subparsers.add_parser('generic-creatives', help='获取通用创意资源')
    generic_creatives_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    generic_creatives_parser.add_argument('--category-ids', help='逗号分隔的分类ID列表 (可选)')
    generic_creatives_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    generic_creatives_parser.add_argument('--limit', '-l', type=int, help='返回结果数量限制')
    
    # 获取文本创意
    text_creatives_parser = subparsers.add_parser('text-creatives', help='获取文本创意资源')
    text_creatives_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    text_creatives_parser.add_argument('--category-ids', help='逗号分隔的分类ID列表 (可选)')
    text_creatives_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    text_creatives_parser.add_argument('--limit', '-l', type=int, help='返回结果数量限制')
    
    # 获取优惠券创意
    coupon_creatives_parser = subparsers.add_parser('coupon-creatives', help='获取优惠券创意资源')
    coupon_creatives_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    coupon_creatives_parser.add_argument('--category-ids', help='逗号分隔的分类ID列表 (可选)')
    coupon_creatives_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    coupon_creatives_parser.add_argument('--limit', '-l', type=int, help='返回结果数量限制')
    
    # 获取横幅创意
    banner_creatives_parser = subparsers.add_parser('banner-creatives', help='获取横幅创意资源')
    banner_creatives_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    banner_creatives_parser.add_argument('--category-ids', help='逗号分隔的分类ID列表 (可选)')
    banner_creatives_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    banner_creatives_parser.add_argument('--limit', '-l', type=int, help='返回结果数量限制')
    
    # 获取高级链接创意
    advanced_links_parser = subparsers.add_parser('advanced-links', help='获取高级链接创意资源')
    advanced_links_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    advanced_links_parser.add_argument('--category-ids', help='逗号分隔的分类ID列表 (可选)')
    advanced_links_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    advanced_links_parser.add_argument('--limit', '-l', type=int, help='返回结果数量限制')

    # 添加全局选项
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--no-ssl-verify', action='store_true', help='禁用SSL验证')
    
    args = parser.parse_args()
    
    # 启用调试模式
    if args.debug:
        import logging
        logging.basicConfig(level=logging.DEBUG)
        requests_log = logging.getLogger("requests.packages.urllib3")
        requests_log.setLevel(logging.DEBUG)
        requests_log.propagate = True
    
    # 实例化API客户端
    try:
        client = PepperjamPublisherAPI()
        
        # 是否禁用SSL验证
        verify_ssl = not args.no_ssl_verify if hasattr(args, 'no_ssl_verify') else True
        
        # 处理发布者产品创意素材子命令
        if args.command == 'publisher-products':
            data = client.get_publisher_product_creatives(
                program_ids=args.program_ids,
                categories=args.categories,
                keywords=args.keywords,
                refurl=args.refurl,
                page=args.page,
                limit=args.limit,
                sort_by=args.sort_by,
                sort_order=args.sort_order
            )
            if data:
                filename_parts = ["publisher_products"]
                if args.keywords:
                    safe_keywords = "".join(filter(str.isalnum, args.keywords[:20])) 
                    filename_parts.append(f"kw_{safe_keywords}")
                if args.program_ids:
                    safe_program_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_program_ids}")
                if args.sort_by:
                    filename_parts.append(f"sort_{args.sort_by}")
                if args.limit:
                    filename_parts.append(f"limit_{args.limit}")
                # 将用户设置的限制传递给保存函数
                save_to_json_file(data, "_".join(filename_parts), limit=args.limit)
        
        # 处理类别子命令
        elif args.command == 'categories':
            data = client.get_categories()
            if data:
                save_to_json_file(data, "categories")
        
        # 处理通用创意子命令
        elif args.command == 'generic-creatives':
            data = client.get_generic_creatives(
                program_ids=args.program_ids,
                category_ids=args.category_ids,
                page=args.page
            )
            if data:
                filename_parts = ["generic_creatives"]
                if args.program_ids:
                    safe_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_ids}")
                save_to_json_file(data, "_".join(filename_parts), limit=args.limit)
        
        # 处理文本创意子命令
        elif args.command == 'text-creatives':
            data = client.get_text_creatives(
                program_ids=args.program_ids,
                category_ids=args.category_ids,
                page=args.page
            )
            if data:
                filename_parts = ["text_creatives"]
                if args.program_ids:
                    safe_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_ids}")
                save_to_json_file(data, "_".join(filename_parts), limit=args.limit)
        
        # 处理优惠券创意子命令
        elif args.command == 'coupon-creatives':
            data = client.get_coupon_creatives(
                program_ids=args.program_ids,
                category_ids=args.category_ids,
                page=args.page
            )
            if data:
                filename_parts = ["coupon_creatives"]
                if args.program_ids:
                    safe_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_ids}")
                save_to_json_file(data, "_".join(filename_parts), limit=args.limit)
        
        # 处理横幅创意子命令
        elif args.command == 'banner-creatives':
            data = client.get_banner_creatives(
                program_ids=args.program_ids,
                category_ids=args.category_ids,
                page=args.page
            )
            if data:
                filename_parts = ["banner_creatives"]
                if args.program_ids:
                    safe_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_ids}")
                save_to_json_file(data, "_".join(filename_parts), limit=args.limit)
        
        # 处理高级链接创意子命令
        elif args.command == 'advanced-links':
            data = client.get_advanced_links_creatives(
                program_ids=args.program_ids,
                category_ids=args.category_ids,
                page=args.page
            )
            if data:
                filename_parts = ["advanced_links"]
                if args.program_ids:
                    safe_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_ids}")
                save_to_json_file(data, "_".join(filename_parts), limit=args.limit)
        
        else:
            parser.print_help()
    
    except Exception as e:
        print(f"错误: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    main() 