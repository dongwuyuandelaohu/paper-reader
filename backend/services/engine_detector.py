"""
引擎检测服务
启动时检测所有可用引擎，结果保存到数据库
"""
import shutil
import logging
import importlib.metadata
from datetime import datetime
from typing import Dict, Any

logger = logging.getLogger(__name__)


def detect_engines() -> Dict[str, Dict[str, Any]]:
    """
    检测所有引擎的可用状态和版本信息
    
    Returns:
        dict: {engine_name: {available, version, checked_at}}
    """
    engines = {}
    checked_at = datetime.now().isoformat()
    
    # 1. PyMuPDF - 内置引擎
    try:
        import fitz
        version = fitz.version[0] if hasattr(fitz, "version") else "unknown"
        engines["pymupdf"] = {
            "available": True,
            "version": version,
            "checked_at": checked_at,
            "error": None
        }
        logger.info(f"[Engine] pymupdf: available (v{version})")
    except ImportError as e:
        engines["pymupdf"] = {
            "available": False,
            "version": None,
            "checked_at": checked_at,
            "error": str(e)
        }
        logger.warning(f"[Engine] pymupdf: not available - {e}")
    
    # 2. Marker
    try:
        # 优先使用 importlib（快速）
        version = importlib.metadata.version("marker-pdf")
        available = shutil.which("marker_single") is not None
        
        if available:
            engines["marker"] = {
                "available": True,
                "version": version,
                "checked_at": checked_at,
                "error": None
            }
            logger.info(f"[Engine] marker: available (v{version})")
        else:
            engines["marker"] = {
                "available": False,
                "version": version,
                "checked_at": checked_at,
                "error": "marker-pdf 已安装但 marker_single 命令不可用"
            }
            logger.warning("[Engine] marker: package installed but command not found")
    except importlib.metadata.PackageNotFoundError:
        engines["marker"] = {
            "available": False,
            "version": None,
            "checked_at": checked_at,
            "error": "marker-pdf 未安装"
        }
        logger.info("[Engine] marker: not installed")
    except Exception as e:
        engines["marker"] = {
            "available": False,
            "version": None,
            "checked_at": checked_at,
            "error": str(e)
        }
        logger.error(f"[Engine] marker: detection failed - {e}")
    
    # 3. MinerU
    try:
        # 优先使用 importlib（快速）
        version = importlib.metadata.version("mineru")
        available = shutil.which("mineru") is not None
        
        if available:
            engines["mineru"] = {
                "available": True,
                "version": version,
                "checked_at": checked_at,
                "error": None
            }
            logger.info(f"[Engine] mineru: available (v{version})")
        else:
            engines["mineru"] = {
                "available": False,
                "version": version,
                "checked_at": checked_at,
                "error": "mineru 已安装但 mineru 命令不可用"
            }
            logger.warning("[Engine] mineru: package installed but command not found")
    except importlib.metadata.PackageNotFoundError:
        engines["mineru"] = {
            "available": False,
            "version": None,
            "checked_at": checked_at,
            "error": "mineru 未安装"
        }
        logger.info("[Engine] mineru: not installed")
    except Exception as e:
        engines["mineru"] = {
            "available": False,
            "version": None,
            "checked_at": checked_at,
            "error": str(e)
        }
        logger.error(f"[Engine] mineru: detection failed - {e}")
    
    return engines


async def save_engines_to_db(db, engines: Dict[str, Dict[str, Any]]):
    """
    将引擎检测结果保存到数据库
    
    Args:
        db: 数据库连接
        engines: 引擎检测结果
    """
    import json
    now = datetime.now().isoformat()
    
    try:
        # settings 表结构: key TEXT PRIMARY KEY, value TEXT, updated_at TEXT
        await db.execute(
            """INSERT INTO settings (key, value, updated_at) 
               VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
            ("parse_engines", json.dumps(engines, ensure_ascii=False), now)
        )
        
        logger.info(f"[Engine] Saved detection results to database")
    except Exception as e:
        logger.error(f"[Engine] Failed to save to database: {e}")
        raise


async def load_engines_from_db(db) -> Dict[str, Dict[str, Any]]:
    """
    从数据库加载引擎检测结果
    
    Args:
        db: 数据库连接
    
    Returns:
        dict: 引擎检测结果
    """
    import json
    
    try:
        row = await db.fetch_one(
            "SELECT value FROM settings WHERE key = ?",
            ("parse_engines",)
        )
        
        if row:
            return json.loads(row["value"])
        else:
            # 如果没有记录，返回空
            logger.warning("[Engine] No engine detection results in database")
            return {}
    except Exception as e:
        logger.error(f"[Engine] Failed to load from database: {e}")
        return {}


async def update_single_engine(db, engine_name: str, status: Dict[str, Any]):
    """
    更新单个引擎的状态（用于解析失败时更新）
    
    Args:
        db: 数据库连接
        engine_name: 引擎名称
        status: 引擎状态
    """
    import json
    
    try:
        engines = await load_engines_from_db(db)
        engines[engine_name] = status
        await save_engines_to_db(db, engines)
        logger.info(f"[Engine] Updated {engine_name} status")
    except Exception as e:
        logger.error(f"[Engine] Failed to update {engine_name}: {e}")
