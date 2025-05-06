#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Pepperjam商品查询工具
使用Pepperjam API (原Ascendpartner)获取商品数据
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
from loguru import logger # 导入 loguru logger

# 加载环境变量
load_dotenv()

# API配置
PEPPERJAM_API_BASE_URL = os.getenv('PEPPERJAM_API_BASE_URL', 'https://api.pepperjamnetwork.com')
PEPPERJAM_API_KEY = os.getenv('ASCEND_API_KEY', os.getenv('ASCEND_API_KEY'))
PEPPERJAM_API_VERSION = os.getenv('PEPPERJAM_API_VERSION', '20120402')

class PepperjamAPI:
    """Pepperjam API客户端 (原Ascendpartner)"""
    
    def __init__(self, api_key=None, api_version=None, base_url=None):
        """
        初始化API客户端
        
        Args:
            api_key (str): API密钥，如果未提供则从环境变量读取
            api_version (str): API版本，如果未提供则从环境变量读取，默认为 '1'
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
                logger.info(f"正在请求 {resource} 资源...")
                logger.debug(f"URL: {url}")
                logger.debug(f"参数: {request_params}")
                
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
                    logger.warning(f"服务器错误 (状态码: {response.status_code})，正在重试...")
                    retry_count += 1
                    time.sleep(1 * retry_count)  # 指数退避
                    continue
                
                # 检查HTTP状态码
                response.raise_for_status()
                
                # 打印响应内容以便调试
                logger.debug(f"响应状态码: {response.status_code}")
                logger.debug(f"响应头: {response.headers}")
                
                # 尝试解析响应
                try:
                    response_data = response.json()
                    logger.info(f"请求成功, 状态码: {response_data.get('meta', {}).get('status', {}).get('code')}")
                    return response_data
                except json.JSONDecodeError:
                    logger.error(f"JSON解析错误，原始响应内容: {response.text[:500]}...")
                    if retry_count < max_retries - 1:
                        retry_count += 1
                        time.sleep(2 ** retry_count)
                        continue
                    return {"error": "无法解析JSON响应", "raw_response": response.text}
                
            except requests.exceptions.SSLError as error:
                logger.error(f"SSL错误: {error}")
                if not verify_ssl:
                    # 如果已经禁用了SSL验证但仍然出错，说明问题不在SSL验证
                    last_error = error
                    break
                else:
                    # 尝试禁用SSL验证再试一次
                    logger.warning("尝试禁用SSL验证...")
                    verify_ssl = False
                    continue
                    
            except requests.exceptions.RequestException as error:
                logger.error(f"请求错误 (尝试 {retry_count + 1}/{max_retries}): {error}")
                if hasattr(error, 'response') and error.response is not None:
                    logger.error(f"状态码: {error.response.status_code}")
                    try:
                        logger.error(f"错误详情: {error.response.json()}")
                    except:
                        logger.error(f"错误内容: {error.response.text[:500]}...")
                
                last_error = error
                retry_count += 1
                
                if retry_count < max_retries:
                    sleep_time = 2 ** retry_count  # 指数退避
                    logger.info(f"等待 {sleep_time} 秒后重试...")
                    time.sleep(sleep_time)
                else:
                    break
        
        # 如果所有重试都失败了
        if last_error:
            logger.error(f"请求 {resource} 失败，已达到最大重试次数 ({max_retries})")
            raise last_error
        
        return None
    
    def get_advertiser_details(self, advertiser_id=None):
        """
        获取广告商详情
        
        Args:
            advertiser_id (str): 广告商ID，如果不提供则返回所有广告商
            
        Returns:
            dict: 广告商详情
        """
        resource = "advertiser-details"
        params = {}
        
        if advertiser_id:
            params["id"] = advertiser_id
        
        return self._make_request(resource, params=params)
    
    def get_products(self, advertiser_id=None, page=1, limit=2500):
        """
        获取商品列表
        
        Args:
            advertiser_id (str): 广告商ID
            page (int): 页码
            limit (int): 每页数量 (API限制最多2500条)
            
        Returns:
            dict: 商品列表
        """
        resource = "product"
        params = {
            "page": page
        }
        
        if advertiser_id:
            params["programId"] = advertiser_id
        
        return self._make_request(resource, params=params)
    
    def get_product_by_id(self, product_id):
        """
        根据ID获取商品详情
        
        Args:
            product_id (str): 商品ID
            
        Returns:
            dict: 商品详情
        """
        resource = "product"
        params = {
            "id": product_id
        }
        
        return self._make_request(resource, params=params)
    
    def search_products(self, keyword, advertiser_id=None, page=1, limit=2500):
        """
        搜索商品
        
        Args:
            keyword (str): 搜索关键词
            advertiser_id (str): 广告商ID (可选)
            page (int): 页码
            limit (int): 每页数量 (API限制最多2500条)
            
        Returns:
            dict: 搜索结果
        """
        resource = "product"
        params = {
            "keyword": keyword,
            "page": page
        }
        
        if advertiser_id:
            params["programId"] = advertiser_id
        
        return self._make_request(resource, params=params)
    
    def get_transactions(self, start_date=None, end_date=None, page=1, limit=2500):
        """
        获取交易记录
        
        Args:
            start_date (str): 开始日期 (YYYY-MM-DD)
            end_date (str): 结束日期 (YYYY-MM-DD)
            page (int): 页码
            limit (int): 每页数量 (API限制最多2500条)
            
        Returns:
            dict: 交易记录
        """
        resource = "transaction"
        params = {
            "page": page
        }
        
        if start_date:
            params["startDate"] = start_date
        
        if end_date:
            params["endDate"] = end_date
        
        return self._make_request(resource, params=params)
    
    def get_transaction_by_id(self, transaction_id):
        """
        根据ID获取交易详情
        
        Args:
            transaction_id (str): 交易ID
            
        Returns:
            dict: 交易详情
        """
        resource = "transaction"
        params = {
            "id": transaction_id
        }
        
        return self._make_request(resource, params=params)
    
    def get_transaction_items(self, transaction_id, page=1, limit=2500):
        """
        获取交易项目
        
        Args:
            transaction_id (str): 交易ID
            page (int): 页码
            limit (int): 每页数量 (API限制最多2500条)
            
        Returns:
            dict: 交易项目
        """
        resource = "transactionItem"
        params = {
            "transactionId": transaction_id,
            "page": page
        }
        
        return self._make_request(resource, params=params)
    
    def get_term_defaults(self):
        """
        获取默认条款
        
        Returns:
            dict: 默认条款
        """
        resource = "termDefault"
        
        return self._make_request(resource)

    def get_itemized_list_products(self, list_id, product_ids=None, page=1, limit=2500):
        """
        获取特定清单中的商品

        Args:
            list_id (str): 商品清单的ID (必需)
            product_ids (str): 商品ID或逗号分隔的商品ID列表 (可选)
            page (int): 页码
            limit (int): 每页数量 (API限制最多2500条)

        Returns:
            dict: 清单中的商品数据
        """
        resource = "advertiser/itemized-list/product" # 使用新的资源路径
        params = {
            "listId": list_id, # 必需参数
            "page": page
            # 注意：文档没有明确说明此端点是否支持 limit 参数，但我们保留它以防万一
            # "limit": limit  # 如果需要，可以取消注释并传递
        }

        if product_ids:
            params["id"] = product_ids # 可选参数，用于获取特定商品

        return self._make_request(resource, params=params)
        
    def get_publisher_product_creatives(self, program_ids=None, categories=None, 
                                         keywords=None, refurl=None, page=1, limit=2500):
        """
        获取发布者产品创意素材
        
        Args:
            program_ids (str): 逗号分隔的项目ID列表 (可选)
            categories (str): 逗号分隔的类别ID列表 (可选)
            keywords (str): 空格分隔的关键词列表 (可选)
            refurl (str): 关联流量和转化的URL (可选)
            page (int): 页码
            limit (int): 返回的最大结果数量，API最多返回2500条，如需限制则在客户端截取
            
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
            
        response = self._make_request(resource, params=params)
        
        # 如果需要限制结果数量，在客户端进行截取
        if response and 'data' in response and isinstance(response['data'], list) and limit < 2500:
            logger.info(f"API返回了 {len(response['data'])} 条结果，根据限制将截取前 {limit} 条")
            response['data'] = response['data'][:limit]
            
        return response

def save_to_json_file(data, filename):
    """
    将数据保存为JSON文件
    
    Args:
        data (dict): 要保存的数据
        filename (str): 文件名
    """
    # 创建输出目录
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)
    
    # 构造完整的文件路径
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = output_dir / f"{filename}_{timestamp}.json"
    
    # 写入JSON文件
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, indent=2, ensure_ascii=False, fp=f)
    
    logger.info(f"数据已保存到: {file_path}")
    return file_path

def main():
    """命令行入口函数"""
    parser = argparse.ArgumentParser(description='Pepperjam API商品查询工具')
    
    # 创建子命令
    subparsers = parser.add_subparsers(dest='command', help='子命令')
    
    # 获取广告商详情
    advertiser_parser = subparsers.add_parser('advertiser', help='获取广告商详情')
    advertiser_parser.add_argument('id', nargs='?', help='广告商ID（可选）')
    
    # 获取商品
    products_parser = subparsers.add_parser('products', help='获取商品列表')
    products_parser.add_argument('--advertiser', '-a', help='广告商ID（可选）')
    products_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    
    # 获取商品详情
    product_parser = subparsers.add_parser('product', help='获取商品详情')
    product_parser.add_argument('id', help='商品ID')
    
    # 搜索商品
    search_parser = subparsers.add_parser('search', help='搜索商品')
    search_parser.add_argument('keyword', help='搜索关键词')
    search_parser.add_argument('--advertiser', '-a', help='广告商ID（可选）')
    search_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    search_parser.add_argument('--no-ssl-verify', action='store_true', help='禁用SSL验证')
    
    # 获取交易
    transactions_parser = subparsers.add_parser('transactions', help='获取交易记录')
    transactions_parser.add_argument('--start', help='开始日期 (YYYY-MM-DD)')
    transactions_parser.add_argument('--end', help='结束日期 (YYYY-MM-DD)')
    transactions_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    
    # 获取交易详情
    transaction_parser = subparsers.add_parser('transaction', help='获取交易详情')
    transaction_parser.add_argument('id', help='交易ID')
    
    # 获取交易项目
    transaction_items_parser = subparsers.add_parser('transaction-items', help='获取交易项目')
    transaction_items_parser.add_argument('id', help='交易ID')
    transaction_items_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    
    # 获取默认条款
    term_defaults_parser = subparsers.add_parser('term-defaults', help='获取默认条款')
    
    # 新增：获取清单商品
    itemized_parser = subparsers.add_parser('itemized-products', help='获取特定清单中的商品')
    itemized_parser.add_argument('--list-id', '-l', required=True, help='商品清单ID (必需)')
    itemized_parser.add_argument('--product-ids', '-i', help='商品ID或逗号分隔的商品ID列表 (可选)')
    itemized_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    
    # 新增：获取发布者产品创意素材
    publisher_products_parser = subparsers.add_parser('publisher-products', help='获取发布者产品创意素材')
    publisher_products_parser.add_argument('--program-ids', help='逗号分隔的项目ID列表 (可选)')
    publisher_products_parser.add_argument('--categories', help='逗号分隔的类别ID列表 (可选)')
    publisher_products_parser.add_argument('--keywords', help='空格分隔的关键词列表 (可选)')
    publisher_products_parser.add_argument('--refurl', help='关联流量和转化的URL (可选)')
    publisher_products_parser.add_argument('--page', '-p', type=int, default=1, help='页码')
    publisher_products_parser.add_argument('--limit', '-l', type=int, default=2500, help='返回的最大结果数量 (默认2500，API限制最多2500条)')

    # 添加全局选项
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--no-ssl-verify', action='store_true', help='禁用SSL验证')
    
    args = parser.parse_args()
    
    # 启用调试模式 - Loguru 的级别主要由 main.py 控制
    # 如果此脚本独立运行，可以按需在这里添加/修改 sink 的级别
    if args.debug:
        # import logging # No longer need standard logging
        # logging.basicConfig(level=logging.DEBUG)
        # requests_log = logging.getLogger("requests.packages.urllib3")
        # requests_log.setLevel(logging.DEBUG)
        # requests_log.propagate = True
        logger.info("调试模式已通过命令行参数请求 (此脚本独立运行时，依赖Loguru默认或此处临时配置)")
    
    # 实例化API客户端
    try:
        client = PepperjamAPI()
        
        # 是否禁用SSL验证
        verify_ssl = not args.no_ssl_verify if hasattr(args, 'no_ssl_verify') else True
        
        if args.command == 'advertiser':
            # 获取广告商详情
            data = client.get_advertiser_details(args.id)
            if data:
                save_to_json_file(data, "advertiser")
        
        elif args.command == 'products':
            # 获取商品列表
            data = client.get_products(args.advertiser, args.page)
            if data:
                save_to_json_file(data, "products")
        
        elif args.command == 'product':
            # 获取商品详情
            data = client.get_product_by_id(args.id)
            if data:
                save_to_json_file(data, f"product_{args.id}")
        
        elif args.command == 'search':
            # 搜索商品
            data = client.search_products(args.keyword, args.advertiser, args.page)
            if data:
                save_to_json_file(data, f"search_{args.keyword}")
            else:
                logger.warning("搜索未返回结果")
        
        elif args.command == 'transactions':
            # 获取交易记录
            data = client.get_transactions(args.start, args.end, args.page)
            if data:
                save_to_json_file(data, "transactions")
        
        elif args.command == 'transaction':
            # 获取交易详情
            data = client.get_transaction_by_id(args.id)
            if data:
                save_to_json_file(data, f"transaction_{args.id}")
        
        elif args.command == 'transaction-items':
            # 获取交易项目
            data = client.get_transaction_items(args.id, args.page)
            if data:
                save_to_json_file(data, f"transaction_items_{args.id}")
        
        elif args.command == 'term-defaults':
            # 获取默认条款
            data = client.get_term_defaults()
            if data:
                save_to_json_file(data, "term_defaults")
        
        # 新增：处理新子命令
        elif args.command == 'itemized-products':
            data = client.get_itemized_list_products(args.list_id, args.product_ids, args.page)
            if data:
                filename_parts = ["itemized_products", f"list_{args.list_id}"]
                if args.product_ids:
                    # 避免文件名过长或包含非法字符
                    safe_product_ids = "".join(filter(str.isalnum, args.product_ids[:20])) 
                    filename_parts.append(f"ids_{safe_product_ids}")
                save_to_json_file(data, "_".join(filename_parts))
                
        # 新增：处理发布者产品创意素材子命令
        elif args.command == 'publisher-products':
            data = client.get_publisher_product_creatives(
                program_ids=args.program_ids,
                categories=args.categories,
                keywords=args.keywords,
                refurl=args.refurl,
                page=args.page,
                limit=args.limit
            )
            if data:
                filename_parts = ["publisher_products"]
                if args.keywords:
                    safe_keywords = "".join(filter(str.isalnum, args.keywords[:20])) 
                    filename_parts.append(f"kw_{safe_keywords}")
                if args.program_ids:
                    safe_program_ids = "".join(filter(str.isalnum, args.program_ids[:20])) 
                    filename_parts.append(f"prog_{safe_program_ids}")
                if args.limit < 2500:
                    filename_parts.append(f"limit_{args.limit}")
                save_to_json_file(data, "_".join(filename_parts))

        else:
            parser.print_help()
    
    except Exception as e:
        logger.error(f"错误: {e}", exc_info=True)
        # if args.debug: # exc_info=True in logger.error should provide stack trace
            # import traceback
            # traceback.print_exc()

if __name__ == "__main__":
    main() 