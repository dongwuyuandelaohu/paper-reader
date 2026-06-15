"""
数据库服务层
封装 SQLite 操作，提供异步接口
"""

import sqlite3
import aiosqlite
from pathlib import Path
from typing import Any, Optional
from datetime import datetime

from config.paths import is_frozen, get_base_dir


class Database:
    """数据库管理类"""
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.conn: Optional[aiosqlite.Connection] = None
    
    async def init(self):
        """初始化数据库连接"""
        # 确保目录存在
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # 连接数据库
        self.conn = await aiosqlite.connect(str(self.db_path))
        
        # 启用外键约束
        await self.conn.execute("PRAGMA foreign_keys = ON")
        
        # 启用 WAL 模式，允许并发读写（解析线程写入时不阻塞主线程读取）
        await self.conn.execute("PRAGMA journal_mode = WAL")
        await self.conn.execute("PRAGMA busy_timeout = 5000")
        
        # 检查并执行迁移
        await self._run_migrations()
    
    async def _run_migrations(self):
        """执行数据库迁移"""
        # 打包后的版本，数据库结构已经是最新的，不需要迁移
        if is_frozen():
            return
        
        migrations_dir = get_base_dir() / "database" / "migrations"
        
        if not migrations_dir.exists():
            return
        
        # 获取当前版本
        try:
            cursor = await self.conn.execute("SELECT MAX(version) FROM schema_version")
            row = await cursor.fetchone()
            current_version = row[0] if row[0] else 0
        except sqlite3.OperationalError:
            current_version = 0
        
        # 获取所有迁移文件
        migrations = []
        for f in migrations_dir.glob("*.sql"):
            try:
                version = int(f.stem.split("_")[0])
                migrations.append((version, f))
            except (ValueError, IndexError):
                continue
        
        migrations.sort(key=lambda x: x[0])
        
        # 执行未应用的迁移
        for version, sql_path in migrations:
            if version > current_version:
                with open(sql_path, "r", encoding="utf-8") as f:
                    sql = f.read()
                await self.conn.executescript(sql)
                await self.conn.commit()
        
        # 安全的增量列迁移
        safe_columns = [
            ("models", "supports_vision", "INTEGER DEFAULT 0"),
            ("messages", "images", "TEXT"),
        ]
        for table, column, col_type in safe_columns:
            try:
                await self.conn.execute(f"SELECT {column} FROM {table} LIMIT 1")
            except (sqlite3.OperationalError, Exception):
                try:
                    await self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
                    await self.conn.commit()
                except Exception:
                    pass  # 表可能不存在
    
    async def close(self):
        """关闭数据库连接"""
        if self.conn:
            await self.conn.close()
    
    # ========== 通用 CRUD 方法 ==========
    
    async def execute(self, sql: str, params: tuple = ()) -> aiosqlite.Cursor:
        """执行 SQL 语句"""
        cursor = await self.conn.execute(sql, params)
        await self.conn.commit()
        return cursor
    
    async def fetch_one(self, sql: str, params: tuple = ()) -> Optional[dict]:
        """查询单行"""
        cursor = await self.conn.execute(sql, params)
        row = await cursor.fetchone()
        if row is None:
            return None
        columns = [desc[0] for desc in cursor.description]
        return dict(zip(columns, row))
    
    async def fetch_all(self, sql: str, params: tuple = ()) -> list[dict]:
        """查询多行"""
        cursor = await self.conn.execute(sql, params)
        rows = await cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in rows]
    
    async def insert(self, table: str, data: dict) -> str:
        """插入数据，返回 ID"""
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?" for _ in data])
        sql = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        await self.conn.execute(sql, tuple(data.values()))
        await self.conn.commit()
        return data.get("id", "")
    
    async def update(self, table: str, id: str, data: dict):
        """更新数据"""
        data["updated_at"] = datetime.now().isoformat()
        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        sql = f"UPDATE {table} SET {set_clause} WHERE id = ?"
        await self.conn.execute(sql, tuple(data.values()) + (id,))
        await self.conn.commit()
    
    async def delete(self, table: str, id: str):
        """删除数据"""
        sql = f"DELETE FROM {table} WHERE id = ?"
        await self.conn.execute(sql, (id,))
        await self.conn.commit()
    
    async def get_by_id(self, table: str, id: str) -> Optional[dict]:
        """根据 ID 查询"""
        return await self.fetch_one(f"SELECT * FROM {table} WHERE id = ?", (id,))
    
    async def count(self, table: str, where: str = "1=1", params: tuple = ()) -> int:
        """统计数量"""
        result = await self.fetch_one(f"SELECT COUNT(*) as count FROM {table} WHERE {where}", params)
        return result["count"] if result else 0
