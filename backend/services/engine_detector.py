"""
引擎检测服务
支持两种引擎来源：
1. 系统安装 (pip install) - 开发环境
2. 独立打包引擎 (engines/ 目录) - 生产环境
"""
import os
import sys
import shutil
import logging
import importlib.metadata
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def get_engines_dir() -> Path:
    """获取引擎安装目录"""
    # 优先使用环境变量
    if os.getenv("PAPERLENS_ENGINES_DIR"):
        return Path(os.getenv("PAPERLENS_ENGINES_DIR"))
    
    # 检查应用目录下的 engines/
    app_dir = Path(__file__).parent.parent.parent
    engines_in_app = app_dir / "engines"
    if engines_in_app.exists():
        return engines_in_app
    
    # 用户主目录下的 .paperlens/engines/
    user_engines = Path.home() / ".paperlens" / "engines"
    if user_engines.exists():
        return user_engines
    
    # 默认使用用户目录
    return user_engines


def detect_isolated_engine(engine_name: str) -> Optional[Dict[str, Any]]:
    """
    检测独立打包的引擎
    支持两种打包方式:
    1. PyInstaller 打包 (旧): 直接的可执行文件
    2. venv + wrapper (新): wrapper 脚本 + .venv 目录
    
    Args:
        engine_name: 引擎名称 (marker, mineru)
    
    Returns:
        引擎信息 dict 或 None
    """
    import json as _json
    
    engines_dir = get_engines_dir()
    engine_dir = engines_dir / f"{engine_name}-engine"
    
    if not engine_dir.exists():
        return None
    
    # 确定可执行文件路径
    if sys.platform == "win32":
        exe_file = engine_dir / f"{engine_name}-engine.exe"
        bat_file = engine_dir / f"{engine_name}-engine.bat"
        # Windows 上优先使用 .exe (PyInstaller)，回退到 .bat (venv wrapper)
        if exe_file.exists():
            executable = exe_file
        elif bat_file.exists():
            executable = bat_file
        else:
            return None
    else:
        exe_file = engine_dir / f"{engine_name}-engine"
        if not exe_file.exists():
            return None
        executable = exe_file
    
    # 检查版本文件
    version_file = engine_dir / "VERSION"
    version = "unknown"
    if version_file.exists():
        version = version_file.read_text().strip()
    
    # 判断引擎类型: PyInstaller 还是 venv
    engine_json = engine_dir / "engine.json"
    has_venv = (engine_dir / ".venv").is_dir()
    
    if engine_json.exists():
        try:
            meta = _json.loads(engine_json.read_text())
            engine_type = f"isolated-{meta.get('type', 'unknown')}"
        except Exception:
            engine_type = "isolated-venv" if has_venv else "isolated"
    elif has_venv:
        engine_type = "isolated-venv"
    else:
        engine_type = "isolated"
    
    return {
        "type": engine_type,
        "exe_path": str(executable),
        "engine_dir": str(engine_dir),
        "version": version
    }


def detect_system_engine(engine_name: str) -> Optional[Dict[str, Any]]:
    """
    检测系统安装的引擎
    
    Args:
        engine_name: 引擎名称 (marker, mineru)
    
    Returns:
        引擎信息 dict 或 None
    """
    if engine_name == "marker":
        try:
            version = importlib.metadata.version("marker-pdf")
            cmd_path = shutil.which("marker_single")
            if cmd_path:
                return {
                    "type": "system",
                    "cmd_path": cmd_path,
                    "version": version
                }
        except importlib.metadata.PackageNotFoundError:
            pass
    
    elif engine_name == "mineru":
        try:
            version = importlib.metadata.version("mineru")
            cmd_path = shutil.which("mineru")
            if cmd_path:
                return {
                    "type": "system",
                    "cmd_path": cmd_path,
                    "version": version
                }
        except importlib.metadata.PackageNotFoundError:
            pass
    
    return None


def detect_engines() -> Dict[str, Dict[str, Any]]:
    """
    检测所有引擎的可用状态和版本信息
    
    Returns:
        dict: {engine_name: {available, version, checked_at, source}}
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
            "source": "builtin",
            "error": None
        }
        logger.info(f"[Engine] pymupdf: available (v{version})")
    except ImportError as e:
        engines["pymupdf"] = {
            "available": False,
            "version": None,
            "checked_at": checked_at,
            "source": "builtin",
            "error": str(e)
        }
        logger.warning(f"[Engine] pymupdf: not available - {e}")
    
    # 2. Marker - 优先检测独立打包版本
    marker_info = detect_isolated_engine("marker")
    if marker_info:
        engines["marker"] = {
            "available": True,
            "version": marker_info["version"],
            "checked_at": checked_at,
            "source": marker_info["type"],
            "exe_path": marker_info.get("exe_path") or marker_info.get("cmd_path"),
            "error": None
        }
        logger.info(f"[Engine] marker: available (v{marker_info['version']}, {marker_info['type']})")
    else:
        marker_info = detect_system_engine("marker")
        if marker_info:
            engines["marker"] = {
                "available": True,
                "version": marker_info["version"],
                "checked_at": checked_at,
                "source": marker_info["type"],
                "exe_path": marker_info["cmd_path"],
                "error": None
            }
            logger.info(f"[Engine] marker: available (v{marker_info['version']}, system)")
        else:
            engines["marker"] = {
                "available": False,
                "version": None,
                "checked_at": checked_at,
                "source": None,
                "error": "未安装或不可用",
                "download_available": True
            }
            logger.info("[Engine] marker: not installed")
    
    # 3. MinerU - 优先检测独立打包版本
    mineru_info = detect_isolated_engine("mineru")
    if mineru_info:
        engines["mineru"] = {
            "available": True,
            "version": mineru_info["version"],
            "checked_at": checked_at,
            "source": mineru_info["type"],
            "exe_path": mineru_info.get("exe_path") or mineru_info.get("cmd_path"),
            "error": None
        }
        logger.info(f"[Engine] mineru: available (v{mineru_info['version']}, {mineru_info['type']})")
    else:
        mineru_info = detect_system_engine("mineru")
        if mineru_info:
            engines["mineru"] = {
                "available": True,
                "version": mineru_info["version"],
                "checked_at": checked_at,
                "source": mineru_info["type"],
                "exe_path": mineru_info["cmd_path"],
                "error": None
            }
            logger.info(f"[Engine] mineru: available (v{mineru_info['version']}, system)")
        else:
            engines["mineru"] = {
                "available": False,
                "version": None,
                "checked_at": checked_at,
                "source": None,
                "error": "未安装或不可用",
                "download_available": True
            }
            logger.info("[Engine] mineru: not installed")
    
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
