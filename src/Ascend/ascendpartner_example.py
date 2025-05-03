#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Ascendpartner API 使用示例
演示如何使用 PepperjamAPI 类获取商品数据
"""

import os
import json
from dotenv import load_dotenv
from ascendpartner_api import PepperjamAPI, save_to_json_file

# 加载环境变量
load_dotenv()

def main():
    """主函数"""
    try:
        # 初始化API客户端
        client = PepperjamAPI()
        print("成功初始化 Pepperjam API 客户端")
        
        # 示例1：获取广告商列表
        print("\n1. 获取广告商列表")
        advertisers = client.get_advertiser_details()
        print(f"获取到 {len(advertisers.get('data', []))} 个广告商")
        save_to_json_file(advertisers, "advertisers_example")
        
        # 如果获取到广告商列表，则获取第一个广告商的ID用于后续示例
        advertiser_id = None
        if advertisers.get('data') and len(advertisers.get('data', [])) > 0:
            advertiser_id = advertisers['data'][0]['id']
            print(f"使用广告商ID: {advertiser_id}")
        
        # 示例2：获取商品列表
        print("\n2. 获取商品列表")
        products = client.get_products(advertiser_id=advertiser_id, page=1)
        print(f"获取到 {len(products.get('data', []))} 个商品")
        save_to_json_file(products, "products_example")
        
        # 如果获取到商品列表，则获取第一个商品的ID用于后续示例
        product_id = None
        if products.get('data') and len(products.get('data', [])) > 0:
            product_id = products['data'][0]['id']
            
            # 示例3：获取商品详情
            if product_id:
                print(f"\n3. 获取商品 {product_id} 的详情")
                product_detail = client.get_product_by_id(product_id)
                print(f"商品名称: {product_detail.get('data', {}).get('name', '未知')}")
                save_to_json_file(product_detail, f"product_detail_{product_id}_example")
        
        # 示例4：搜索商品
        search_keyword = "phone"
        print(f"\n4. 搜索关键词 '{search_keyword}' 的商品")
        search_results = client.search_products(search_keyword, advertiser_id)
        print(f"找到 {len(search_results.get('data', []))} 个匹配商品")
        save_to_json_file(search_results, f"search_{search_keyword}_example")
        
        # 示例5：获取交易记录
        print("\n5. 获取最近交易记录")
        transactions = client.get_transactions(page=1)
        print(f"获取到 {len(transactions.get('data', []))} 条交易记录")
        save_to_json_file(transactions, "transactions_example")
        
        # 如果获取到交易记录，则获取第一条交易的ID用于后续示例
        transaction_id = None
        if transactions.get('data') and len(transactions.get('data', [])) > 0:
            transaction_id = transactions['data'][0]['id']
            
            # 示例6：获取交易详情
            if transaction_id:
                print(f"\n6. 获取交易 {transaction_id} 的详情")
                transaction_detail = client.get_transaction_by_id(transaction_id)
                print(f"交易金额: {transaction_detail.get('data', {}).get('amount', '未知')}")
                save_to_json_file(transaction_detail, f"transaction_detail_{transaction_id}_example")
                
                # 示例7：获取交易项目
                print(f"\n7. 获取交易 {transaction_id} 的项目")
                transaction_items = client.get_transaction_items(transaction_id)
                print(f"获取到 {len(transaction_items.get('data', []))} 个交易项目")
                save_to_json_file(transaction_items, f"transaction_items_{transaction_id}_example")
        
        # 示例8：获取默认条款
        print("\n8. 获取默认条款")
        term_defaults = client.get_term_defaults()
        print(f"获取到 {len(term_defaults.get('data', []))} 条默认条款")
        save_to_json_file(term_defaults, "term_defaults_example")
        
        print("\n示例运行完成！所有数据已保存到 output/ 目录")
        
    except Exception as e:
        print(f"示例运行出错: {e}")

if __name__ == "__main__":
    main() 