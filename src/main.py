import argparse
import os
import sys
from pathlib import Path # 导入 Path 处理文件路径
from loguru import logger # 导入 loguru logger

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
    logger.critical(f"CRITICAL: 无法导入核心模块 (SyncOrchestrator, BRAND_CONFIG)。请确保项目结构正确且依赖已安装。ImportError: {e}")
    sys.exit(1)

def main():
    """主执行函数，处理命令行参数并启动同步。"""
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="Shopify Product Synchronizer using CJ and Pepperjam APIs.")
    
    # 添加互斥组，用户要么指定一个品牌，要么选择所有品牌，要么都不指定（则同步所有品牌）
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--brand", 
        help=f"Specify the single brand name to sync. Available brands (overall): {list(BRAND_CONFIG.keys())}"
    )
    group.add_argument(
        "--all-brands", 
        action="store_true", 
        help="Sync all brands defined in BRAND_CONFIG (potentially filtered by --api-source)."
    )

    parser.add_argument(
        "--api-source",
        choices=['cj', 'pepperjam', 'all'],
        default='all',
        help="Specify the API source to sync from: 'cj', 'pepperjam', or 'all' (default: all)."
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
    
    # 添加 test 参数
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run in test mode: fetch only 1 product per brand instead of the default 75."
    )

    args = parser.parse_args()

    # 配置 Loguru 日志记录
    logger.remove() # 移除默认处理器

    # 控制台 sink
    log_level_console = "DEBUG" if args.verbose else "INFO"
    logger.add(
        sys.stdout, 
        level=log_level_console, 
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        colorize=True
    )
    
    # 文件 sink
    logs_dir = Path(project_root) / "logs"
    logs_dir.mkdir(exist_ok=True)
    log_prefix = "dry_run" if args.dry_run else "sync"
    # Loguru 会在文件名中的 {time} 处自动插入时间戳
    log_file_path_template = logs_dir / f"{log_prefix}_{{time:YYYYMMDD_HHmmss}}.log" 
    
    # 添加文件处理器
    # Loguru 的 logger.add 返回处理器ID，如果需要可以保存，但通常不需要直接操作处理器
    # 为了获取实际生成的文件名，我们可以在日志消息中引用模板，或在首次写入后查找
    logger.add(
        log_file_path_template, 
        level="DEBUG", # 文件日志记录所有 DEBUG 级别信息
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
        rotation="10 MB",
        retention="7 days",
        encoding='utf-8',
        enqueue=True # 异步写入
    )
    
    # 记录日志配置信息
    logger.info(f"启动 Shopify 产品同步程序 ({'DRY RUN 模式' if args.dry_run else '正常模式'})")
    logger.info(f"控制台日志级别: {log_level_console}")
    logger.info(f"文件日志将保存到 (模板): {log_file_path_template}") # 记录模板路径

    # 新的错误日志 sink 定义和添加
    error_log_file_path_template = logs_dir / f"brand_fetch_errors_{{time:YYYYMMDD_HHmmss}}.log"

    def brand_fetch_error_filter(record):
        return record["extra"].get("brand_fetch_error") is True

    logger.add(
        error_log_file_path_template,
        level="WARNING",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
        filter=brand_fetch_error_filter,
        rotation="5 MB",
        retention="10 days",
        encoding='utf-8',
        enqueue=True
    )
    logger.info(f"品牌获取相关的错误将额外记录到 (模板): {error_log_file_path_template}")

    # 如果指定了 verbose，记录详细日志模式已启用
    if args.verbose:
        logger.debug("详细日志模式已启用 - 将记录所有DEBUG级别信息。")
        
    # 如果指定了 test 模式，记录测试模式已启用
    if args.test:
        logger.info("测试模式已启用。将尝试为每个指定关键词获取一个产品；若无关键词，则为该品牌获取一个产品。")

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
        logger.info(f"初始化 SyncOrchestrator... (Dry Run: {args.dry_run}, Test Mode: {args.test})")
        orchestrator = SyncOrchestrator(dry_run=args.dry_run, test_mode=args.test)
        logger.debug(f"在 main.py 中创建 orchestrator 后，传递的 test_mode={args.test}, orchestrator.test_mode={orchestrator.test_mode}")
    except Exception as init_e:
        logger.error(f"初始化 SyncOrchestrator 失败: {init_e}", exc_info=True)
        sys.exit(1)

    # 确定要同步的品牌和关键词
    brands_to_sync = []
    keywords_for_sync = {}

    # 1. 根据 API source 筛选可用品牌
    available_brands_config = {}
    if args.api_source == 'cj':
        available_brands_config = {name: conf for name, conf in BRAND_CONFIG.items() if conf['api_type'] == 'cj'}
        logger.info("根据 API source 'cj' 进行筛选。")
    elif args.api_source == 'pepperjam':
        available_brands_config = {name: conf for name, conf in BRAND_CONFIG.items() if conf['api_type'] == 'pepperjam'}
        logger.info("根据 API source 'pepperjam' 进行筛选。")
    else: # 'all'
        available_brands_config = BRAND_CONFIG
        logger.info("API source 为 'all'，将考虑所有已配置的品牌。")

    if not available_brands_config:
        logger.warning(f"根据 API source '{args.api_source}' 筛选后，没有可用的品牌。退出。")
        sys.exit(0)

    # 2. 根据 --brand 或 --all-brands 进一步确定同步列表
    if args.brand:
        if args.brand in BRAND_CONFIG: # 首先检查是否是已知的品牌
            if args.brand in available_brands_config: # 然后检查是否符合 API source
                brands_to_sync.append(args.brand)
                if args.keywords:
                    keywords_for_sync[args.brand] = args.keywords
                if args.keywords_json:
                    logger.warning("同时指定了 --brand 和 --keywords-json。将使用 JSON 文件中为该品牌定义的关键词 (如果有)。")
                    try:
                        import json
                        with open(args.keywords_json, 'r') as f:
                            json_keywords = json.load(f)
                            if args.brand in json_keywords:
                                keywords_for_sync[args.brand] = json_keywords[args.brand]
                            # elif args.brand in keywords_for_sync: # 保留命令行提供的，如果JSON中没有
                            #     pass 
                            # else: # JSON 和命令行都没有，则移除 (如果之前已通过通用keywords设置)
                            #     keywords_for_sync.pop(args.brand, None)
                    except Exception as json_e:
                        logger.error(f"无法读取或解析关键词 JSON 文件 '{args.keywords_json}': {json_e}", exc_info=True)
                        sys.exit(1)
            else:
                logger.error(f"指定的品牌 '{args.brand}' (API类型: {BRAND_CONFIG[args.brand]['api_type']}) 与指定的 API source '{args.api_source}' 不符。")
                logger.info(f"符合 API source '{args.api_source}' 的可用品牌有: {list(available_brands_config.keys())}")
                sys.exit(1)
        else:
            logger.error(f"指定的品牌 '{args.brand}' 未在 BRAND_CONFIG 中找到。所有已配置品牌: {list(BRAND_CONFIG.keys())}")
            sys.exit(1)
            
    elif args.all_brands:
        brands_to_sync = list(available_brands_config.keys())
        if args.keywords: # 通用关键词应用于所有从指定source选出的品牌
            for brand_name in brands_to_sync:
                keywords_for_sync[brand_name] = args.keywords
        if args.keywords_json:
            try:
                import json
                with open(args.keywords_json, 'r') as f:
                    json_keywords = json.load(f)
                    # keywords_for_sync.update(json_keywords) # 这会覆盖所有，需要筛选
                    for brand_name, kws in json_keywords.items():
                        if brand_name in available_brands_config: #只更新筛选后列表中的品牌
                             keywords_for_sync[brand_name] = kws
            except Exception as json_e:
                logger.error(f"无法读取或解析关键词 JSON 文件 '{args.keywords_json}': {json_e}", exc_info=True)
                sys.exit(1)
                
    else:
        # 默认行为：同步由 API source 筛选后的所有品牌
        brands_to_sync = list(available_brands_config.keys())
        logger.info(f"未指定 --brand 或 --all-brands。将默认同步 API source '{args.api_source}' 中的所有品牌: {brands_to_sync}")
        # 默认情况下，不使用关键词，除非通过 keywords.json 指定
        if args.keywords:
             logger.warning("检测到 --keywords 参数，但未指定 --brand 或 --all-brands。此处的 --keywords 将被忽略，除非通过 --keywords-json 为特定品牌指定。")
        if args.keywords_json:
            try:
                import json
                with open(args.keywords_json, 'r') as f:
                    json_keywords = json.load(f)
                    for brand_name, kws in json_keywords.items():
                        if brand_name in available_brands_config: 
                             keywords_for_sync[brand_name] = kws
            except Exception as json_e:
                logger.error(f"无法读取或解析关键词 JSON 文件 '{args.keywords_json}': {json_e}", exc_info=True)
                sys.exit(1)

    # 执行同步
    if not brands_to_sync:
        logger.info("没有要同步的品牌。退出。")
        sys.exit(0)
        
    logger.info(f"准备同步以下品牌: {brands_to_sync}")
    logger.debug(f"使用的关键词配置 (调试): {keywords_for_sync}") # 改为 debug 级别更合适

    if args.dry_run:
        logger.warning("*** DRY RUN 模式已启用，不会对 Shopify 进行任何实际更改。 ***")
        
    if args.test:
        logger.warning("*** 测试模式已启用，每个品牌只会获取1个产品。 ***")

    try:
        if len(brands_to_sync) == 1:
            brand = brands_to_sync[0]
            keywords = keywords_for_sync.get(brand)
            orchestrator.run_sync_for_brand(brand, user_keywords_str=keywords)
        else:
            orchestrator.run_full_sync(brands_to_process=brands_to_sync, keywords_by_brand=keywords_for_sync)
    except Exception as sync_e:
        logger.error(f"同步过程中发生未捕获的错误: {sync_e}", exc_info=True)
        sys.exit(1)
    
    logger.info("同步过程执行完毕。")
    
    # 在dry run模式下添加日志文件位置提示
    if args.dry_run:
        logger.info(f"Dry Run完成，完整日志已保存到模板路径: {log_file_path_template} (实际文件名会包含时间戳)")
        
    # 在测试模式下添加提示
    if args.test:
        logger.info(f"测试模式执行完毕。请检查日志以确认每个品牌的产品获取和同步是否正常。")

if __name__ == "__main__":
    main() 