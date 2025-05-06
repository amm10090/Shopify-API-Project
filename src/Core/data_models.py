from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

@dataclass
class UnifiedProduct:
    """统一的产品数据模型，用于整合来自不同API的商品信息并映射到Shopify。"""
    source_api: str  # API来源 ('cj' 或 'pepperjam')
    source_product_id: str  # API提供的原始产品ID
    brand_name: str  # 品牌名称
    source_advertiser_id: str  # CJ的advertiserId或Pepperjam的programId
    title: str  # 商品标题
    description: str  # 商品描述
    price: float  # 商品价格
    currency: str  # 货币单位 (e.g., 'USD')
    product_url: str  # 联盟链接 (最终用户点击的链接)
    image_url: str  # 商品主图片链接
    sku: Optional[str] = None  # Shopify中的SKU，将由品牌名、API来源和API产品ID组合生成
    availability: bool = True  # 库存状态 (True: 有货, False: 缺货)
    
    sale_price: Optional[float] = None  # 促销价 (可选)
    categories: List[str] = field(default_factory=list)  # 从API获取的分类信息 (可选)
    keywords_matched: List[str] = field(default_factory=list) # 匹配到的用户提供的关键词 (可选)
    
    # Shopify 相关字段，同步后填充
    shopify_product_id: Optional[int] = None  # 对应的Shopify产品ID
    shopify_variant_id: Optional[int] = None # 对应的Shopify变体ID (如果只有一个默认变体)
    shopify_inventory_item_id: Optional[int] = None # Shopify库存项目ID

    # 存储原始API响应，供调试或未来扩展 (可选)
    raw_data: Optional[Dict[str, Any]] = field(default_factory=dict)

    def __post_init__(self):
        # SKU可以在实例化后根据其他字段生成，如果未提供
        if not self.sku:
            brand_slug = self.brand_name.upper().replace(' ', '_').replace('.', '')
            api_slug = self.source_api.upper()
            self.sku = f"{brand_slug}-{api_slug}-{self.source_product_id}"
        
        # 确保价格是浮点数
        if isinstance(self.price, str):
            try:
                self.price = float(self.price)
            except ValueError:
                # 处理无法转换的情况，例如记录错误或设置默认值
                print(f"警告: 无法将价格 '{self.price}' 转换为浮点数，产品ID: {self.source_product_id}")
                self.price = 0.0 # 或者更合适的默认值/错误处理
        
        if self.sale_price is not None and isinstance(self.sale_price, str):
            try:
                self.sale_price = float(self.sale_price)
            except ValueError:
                print(f"警告: 无法将促销价格 '{self.sale_price}' 转换为浮点数，产品ID: {self.source_product_id}")
                self.sale_price = None

# 示例用法 (非必需，仅为演示):
if __name__ == '__main__':
    product_cj = UnifiedProduct(
        source_api='cj',
        source_product_id='12345',
        brand_name='Test Brand CJ',
        source_advertiser_id='adv1',
        title='CJ Product Title',
        description='This is a great product from CJ.',
        price=19.99,
        currency='USD',
        product_url='http://cj.example.com/product/12345',
        image_url='http://cj.example.com/image/12345.jpg',
        availability=True
    )
    print(f"Generated SKU for CJ product: {product_cj.sku}")

    product_pepperjam = UnifiedProduct(
        source_api='pepperjam',
        source_product_id='PJ67890',
        brand_name='Pepperjam Brand Example',
        source_advertiser_id='pj_adv2',
        title='Pepperjam Awesome Item',
        description='Super awesome item from Pepperjam feed.',
        price=29.50,
        currency='USD',
        product_url='http://pepperjam.example.com/product/PJ67890',
        image_url='http://pepperjam.example.com/image/PJ67890.jpg',
        availability=False,
        sale_price=25.00,
        categories=['Electronics', 'Gadgets']
    )
    print(f"Generated SKU for Pepperjam product: {product_pepperjam.sku}") 