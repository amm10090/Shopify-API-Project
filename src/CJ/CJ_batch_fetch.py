#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
批量查询多个广告商的热销商品并汇总
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# 从product_fetcher.py导入函数
from CJ.CJ_product_fetcher import get_products_by_advertiser

# 加载环境变量
load_dotenv()

# 品牌列表及其广告商ID
BRANDS = [
    {"name": "Best Vet Care", "id": "4247934"},
    {"name": "Budget Pet Care", "id": "4250177"},
    {"name": "Canada Pet Care", "id": "4247933"},
    {"name": "Dreo", "id": "6088764"},
    {"name": "GeorgiaBoot.com", "id": "6284907"},
    {"name": "Power Systems", "id": "3056145"},
    {"name": "RockyBoots.com", "id": "6284903"},
    {"name": "Trina Turk", "id": "5923714"},
    {"name": "Xtratuf", "id": "5535819"}
]

# 每个品牌获取的商品数量
PRODUCTS_PER_BRAND = 10

def batch_fetch_hot_products():
    """批量查询多个品牌的热销商品"""
    print(f"开始批量查询{len(BRANDS)}个品牌的热销商品...")
    
    # 存储所有品牌的商品数据
    all_brand_products = {}
    
    # 遍历查询每个品牌
    for brand in BRANDS:
        try:
            print(f"正在查询 {brand['name']} ({brand['id']}) 的热销商品...")
            # 使用product_fetcher中的函数
            data = get_products_by_advertiser(brand['id'], PRODUCTS_PER_BRAND)
            
            if data and 'data' in data and 'products' in data['data']:
                products_data = data['data']['products']
                products = products_data['resultList']
                print(f"成功获取到 {brand['name']} 的 {len(products)} 个商品，总共 {products_data['totalCount']} 个")
                
                # 格式化商品数据，提取关键信息
                formatted_products = []
                for product in products:
                    price = f"{product['price']['amount']} {product['price']['currency']}" if product.get('price') else "价格不可用"
                    
                    sale_price = None
                    if product.get('salePrice'):
                        sale_price = f"{product['salePrice']['amount']} {product['salePrice']['currency']}"
                    
                    formatted_products.append({
                        "id": product.get('id'),
                        "title": product.get('title'),
                        "description": product.get('description'),
                        "price": price,
                        "brand": product.get('brand') or brand['name'],
                        "imageLink": product.get('imageLink', ''),
                        "link": product.get('link', ''),
                        "availability": product.get('availability'),
                        "condition": product.get('condition'),
                        "salePrice": sale_price,
                        "color": product.get('color'),
                        "size": product.get('size'),
                        "material": product.get('material'),
                        "lastUpdated": product.get('lastUpdated'),
                        "advertiserId": product.get('advertiserId')
                    })
                
                # 按价格排序，尝试通过价格识别热销品
                formatted_products.sort(key=lambda x: float(x['price'].split()[0]) if x['price'] != "价格不可用" else 0, reverse=True)
                
                # 将当前品牌的商品添加到汇总对象
                all_brand_products[brand['name']] = formatted_products
            else:
                print(f"未能获取 {brand['name']} 的商品数据")
                all_brand_products[brand['name']] = []
        except Exception as error:
            print(f"查询 {brand['name']} 商品时出错: {error}")
            all_brand_products[brand['name']] = []
        
        # 在请求之间稍作暂停，避免API限制
        time.sleep(1.5)
    
    return all_brand_products

def save_to_json_file(data):
    """
    保存查询结果到JSON文件
    
    Args:
        data (dict): 查询结果数据
    """
    output_dir = Path(__file__).parent.parent / 'output'
    
    # 确保输出目录存在
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建带时间戳的文件名
    timestamp = datetime.now().strftime('%Y-%m-%d')
    file_path = output_dir / f"hot_products_{timestamp}.json"
    
    # 写入文件
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"数据已保存到 {file_path}")
    
    # 同时创建一个格式化的汇总文件
    summary_path = output_dir / f"hot_products_summary_{timestamp}.md"
    
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write(f"# 品牌热销商品汇总报告 ({timestamp})\n\n")
        
        # 为每个品牌创建一个部分
        for brand_name, products in data.items():
            f.write(f"## {brand_name} ({len(products)} 个热销商品)\n\n")
            
            if not products:
                f.write("无可用热销商品\n\n")
            else:
                for i, product in enumerate(products):
                    f.write(f"### {i + 1}. {product['title']}\n")
                    f.write(f"- **价格**: {product['price']}\n")
                    if product.get('salePrice'):
                        f.write(f"- **促销价**: {product['salePrice']}\n")
                    f.write(f"- **链接**: {product['link']}\n")
                    if product.get('imageLink'):
                        f.write(f"- **图片**: {product['imageLink']}\n")
                    if product.get('availability'):
                        f.write(f"- **库存状态**: {product['availability']}\n")
                    if product.get('color'):
                        f.write(f"- **颜色**: {product['color']}\n")
                    if product.get('size'):
                        f.write(f"- **尺寸**: {product['size']}\n")
                    if product.get('material'):
                        f.write(f"- **材质**: {product['material']}\n")
                    f.write(f"- **ID**: {product['id']}\n")
                    f.write("\n")
            
            f.write("---\n\n")
    
    print(f"热销商品汇总报告已保存到 {summary_path}")

def main():
    """主函数"""
    try:
        all_products = batch_fetch_hot_products()
        save_to_json_file(all_products)
        print("批量查询热销商品完成!")
    except Exception as error:
        print(f"执行批量查询失败: {error}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == "__main__":
    main() 