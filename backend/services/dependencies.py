"""
依赖注入
"""

from services.db import Database

# 全局数据库实例（由 main.py 初始化）
_db: Database = None


def set_db(db: Database):
    """设置数据库实例"""
    global _db
    _db = db


def get_db() -> Database:
    """获取数据库实例（FastAPI 依赖注入）"""
    return _db


def get_db_instance() -> Database:
    """获取数据库实例（非依赖注入，用于后台任务）"""
    return _db
