import argparse
import os
import sys
import logging # 导入 logging 模块
from datetime import datetime # 导入 datetime 用于生成时间戳
from pathlib import Path # 导入 Path 处理文件路径

# 确保 src 目录在 Python 路径中，以便可以导入 Core, Shopify 等模块
# 这在使用 vscode-remote 或类似环境时可能需要
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# 将导入移至顶层，并处理可能的 ImportError
try:
    from Core.sync_orchestrator import SyncOrchestrator, BRAND_CONFIG
except ImportError as e:
    # 在此处使用 print 因为 logger 可能尚未配置
    print(f"CRITICAL: 无法导入核心模块 (SyncOrchestrator, BRAND_CONFIG)。请确保项目结构正确且依赖已安装。ImportError: {e}")
    sys.exit(1)

def main():
    """主执行函数，处理命令行参数并启动同步。"""
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="Shopify Product Synchronizer using CJ and Pepperjam APIs.")
    
    # 添加互斥组，用户要么指定一个品牌，要么选择所有品牌，要么都不指定（则同步所有品牌）
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--brand", 
        help=f"Specify the single brand name to sync. Available brands: {list(BRAND_CONFIG.keys())}"
    )
    group.add_argument(
        "--all-brands", 
        action="store_true", 
        help="Sync all brands defined in BRAND_CONFIG."
    )

    parser.add_argument(
        "--keywords", 
        help="Comma-separated keywords to filter products. If syncing all brands, these keywords apply to ALL brands unless overridden by --keywords-json."
    )
    
    parser.add_argument(
        "--keywords-json", 
        help="Path to a JSON file containing brand-specific keywords. Overrides --keywords if provided. Format: {'Brand Name': 'kw1,kw2', ...}"
    )
    
    # 添加 dry-run 参数 (Checklist Item 10)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run the sync process without making any actual changes to Shopify. Logs intended actions instead."
    )
    # 添加 verbose/debug 参数 (可选，用于更详细日志)
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose logging (DEBUG level)."
    )

    args = parser.parse_args()

    # 配置日志记录 - 改进为在所有模式下都保存日志到文件
    log_handlers = [logging.StreamHandler(sys.stdout)]  # 总是将日志输出到控制台
    log_level = logging.DEBUG if args.verbose else logging.INFO
    
    # 创建logs目录（如果不存在）
    logs_dir = Path(project_root) / "logs"
    logs_dir.mkdir(exist_ok=True)
    
    # 生成带时间戳的日志文件名，根据模式区分前缀
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_prefix = "dry_run" if args.dry_run else "sync"
    log_filename = logs_dir / f"{log_prefix}_{timestamp}.log"
    
    # 创建文件处理器并添加到处理器列表
    file_handler = logging.FileHandler(log_filename, encoding='utf-8')
    log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s')
    file_handler.setFormatter(log_formatter)
    log_handlers.append(file_handler)
    
    # 配置日志系统
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s',
        handlers=log_handlers
    )
    
    # 获取根日志记录器
    logger = logging.getLogger(__name__)
    
    # 记录日志配置信息
    logger.info(f"启动 Shopify 产品同步程序 ({'DRY RUN 模式' if args.dry_run else '正常模式'})")
    logger.info(f"日志级别: {logging.getLevelName(log_level)}")
    logger.info(f"日志将保存到文件: {log_filename}")

    # 如果指定了 verbose，记录详细日志模式已启用
    if args.verbose:
        logger.debug("详细日志模式已启用 - 将记录所有DEBUG级别信息。")

    # 检查必要的环境变量是否设置
    required_env_vars = [
        'CJ_API_TOKEN', # CJ
        'ASCEND_API_KEY', # Pepperjam
        'SHOPIFY_STORE_NAME' # Shopify
        # Shopify token/password is checked inside ShopifyConnector
    ]
    missing_envs = [var for var in required_env_vars if not os.getenv(var)]
    if missing_envs:
        logger.error(f"缺少必要的环境变量: {missing_envs}。请确保 .env 文件已配置。")
        sys.exit(1)

    # 初始化编排器 (传递 dry_run 标志 - Checklist Item 11)
    try:
        logger.info(f"初始化 SyncOrchestrator... (Dry Run: {args.dry_run})")
        orchestrator = SyncOrchestrator(dry_run=args.dry_run)
    except Exception as init_e:
        logger.error("初始化 SyncOrchestrator 失败。", exc_info=True)
        sys.exit(1)

    # 确定要同步的品牌和关键词
    brands_to_sync = []
    keywords_for_sync = {}

    if args.brand:
        if args.brand in BRAND_CONFIG:
            brands_to_sync.append(args.brand)
            # 如果为单个品牌指定了关键词
            if args.keywords:
                 keywords_for_sync[args.brand] = args.keywords
            # 注意：--keywords-json 在指定单个品牌时通常不适用，但可以允许它覆盖
            if args.keywords_json:
                 logger.warning("同时指定了 --brand 和 --keywords-json。将使用 JSON 文件中为该品牌定义的关键词 (如果有)。")
                 try:
                     import json
                     with open(args.keywords_json, 'r') as f:
                         json_keywords = json.load(f)
                         if args.brand in json_keywords:
                             keywords_for_sync[args.brand] = json_keywords[args.brand]
                         elif args.brand in keywords_for_sync: # 如果JSON中没有，但命令行有，则保留命令行的
                             pass 
                         else: # JSON 和命令行都没有
                             keywords_for_sync.pop(args.brand, None)
                 except Exception as json_e:
                     logger.error(f"无法读取或解析关键词 JSON 文件 '{args.keywords_json}'", exc_info=True)
                     sys.exit(1)
        else:
            logger.error(f"指定的品牌 '{args.brand}' 未在 BRAND_CONFIG 中找到。可用品牌: {list(BRAND_CONFIG.keys())}")
            sys.exit(1)
            
    elif args.all_brands:
        brands_to_sync = list(BRAND_CONFIG.keys())
        # 如果为所有品牌指定了通用关键词
        if args.keywords:
            for brand in brands_to_sync:
                keywords_for_sync[brand] = args.keywords
        # 如果提供了 JSON 文件，它将覆盖通用关键词
        if args.keywords_json:
            try:
                import json
                with open(args.keywords_json, 'r') as f:
                    json_keywords = json.load(f)
                    # 合并 JSON 关键词，覆盖通用关键词
                    keywords_for_sync.update(json_keywords) 
            except Exception as json_e:
                logger.error(f"无法读取或解析关键词 JSON 文件 '{args.keywords_json}'", exc_info=True)
                sys.exit(1)
                
    else:
        # 默认行为：同步所有品牌，不使用关键词
        logger.info("未指定 --brand 或 --all-brands，将默认同步所有已配置的品牌，不使用关键词过滤。")
        brands_to_sync = list(BRAND_CONFIG.keys())

    # 执行同步
    if not brands_to_sync:
        logger.info("没有要同步的品牌。退出。")
        sys.exit(0)
        
    logger.info(f"准备同步以下品牌: {brands_to_sync}")
    logger.debug(f"使用的关键词配置 (调试): {keywords_for_sync}") # 改为 debug 级别更合适

    if args.dry_run:
        logger.warning("*** DRY RUN 模式已启用，不会对 Shopify 进行任何实际更改。 ***")

    try:
        if len(brands_to_sync) == 1:
            brand = brands_to_sync[0]
            keywords = keywords_for_sync.get(brand)
            orchestrator.run_sync_for_brand(brand, user_keywords_str=keywords)
        else:
            orchestrator.run_full_sync(keywords_by_brand=keywords_for_sync)
    except Exception as sync_e:
        logger.error("同步过程中发生未捕获的错误。", exc_info=True)
        sys.exit(1)
    
    logger.info("同步过程执行完毕。")
    
    # 在dry run模式下添加日志文件位置提示
    if args.dry_run:
        logger.info(f"Dry Run完成，完整日志已保存到: {log_filename}")

if __name__ == "__main__":
    main() 