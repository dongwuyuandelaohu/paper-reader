"""
路径配置模块
处理开发模式和打包后的路径差异
"""

import os
import sys
from pathlib import Path


def is_frozen():
    """检查是否在 PyInstaller 打包环境中运行"""
    return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')


def get_base_dir():
    """获取应用基础目录"""
    if is_frozen():
        # 打包后：使用 exe 所在目录
        return Path(sys.executable).parent
    else:
        # 开发模式：使用项目根目录
        return Path(__file__).parent.parent.parent


def get_data_dir():
    """获取数据目录（数据库、图片等）"""
    base = get_base_dir()
    
    # Windows: 使用 AppData
    if sys.platform == 'win32':
        appdata = os.environ.get('APPDATA')
        if appdata:
            data_dir = Path(appdata) / 'PaperLens' / 'data'
        else:
            data_dir = base / 'data'
    else:
        # macOS/Linux: 使用 ~/.paperlens
        data_dir = Path.home() / '.paperlens' / 'data'
    
    # 确保目录存在
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_db_path():
    """获取数据库文件路径"""
    return get_data_dir() / 'data.db'


def get_static_dir():
    """获取前端静态文件目录"""
    if is_frozen():
        # 打包后：使用 exe 同目录下的 static 文件夹
        return Path(sys.executable).parent / 'static'
    else:
        # 开发模式：使用 frontend/dist
        return Path(__file__).parent.parent.parent / 'frontend' / 'dist'


def get_logs_dir():
    """获取日志目录"""
    logs_dir = get_data_dir() / 'logs'
    logs_dir.mkdir(parents=True, exist_ok=True)
    return logs_dir


def get_temp_dir():
    """获取临时文件目录"""
    temp_dir = get_data_dir() / 'temp'
    temp_dir.mkdir(parents=True, exist_ok=True)
    return temp_dir


def get_api_base_url() -> str:
    """获取后端 API 基础 URL（供引擎生成图片完整 URL 使用）"""
    return "http://localhost:8765/api/v1"
BASE_DIR = get_base_dir()
DATA_DIR = get_data_dir()
DB_PATH = get_db_path()
STATIC_DIR = get_static_dir()
LOGS_DIR = get_logs_dir()
TEMP_DIR = get_temp_dir()


if __name__ == '__main__':
    print(f"Frozen: {is_frozen()}")
    print(f"Base Dir: {BASE_DIR}")
    print(f"Data Dir: {DATA_DIR}")
    print(f"DB Path: {DB_PATH}")
    print(f"Static Dir: {STATIC_DIR}")
    print(f"Logs Dir: {LOGS_DIR}")
    print(f"Temp Dir: {TEMP_DIR}")
