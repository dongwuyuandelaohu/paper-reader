"""
数据库服务层
封装 SQLite 操作，提供异步接口
"""

import sqlite3
import aiosqlite
import logging
from pathlib import Path
from typing import Any, Optional
from datetime import datetime

from config.paths import is_frozen, get_base_dir

logger = logging.getLogger(__name__)


# 内嵌完整 schema，确保 frozen 模式下无需外部 SQL 文件即可初始化
_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, authors TEXT, year INTEGER,
    venue TEXT, abstract TEXT, abstract_translated TEXT, doi TEXT, arxiv_id TEXT,
    file_path TEXT NOT NULL, file_size INTEGER, total_pages INTEGER NOT NULL,
    pages_parsed INTEGER DEFAULT 0, pages_translated INTEGER DEFAULT 0,
    parse_status TEXT DEFAULT 'pending', parse_engine TEXT DEFAULT 'marker',
    parse_error TEXT, reading_page INTEGER DEFAULT 1, reading_scroll REAL DEFAULT 0,
    is_favorite INTEGER DEFAULT 0, source_url TEXT, language TEXT DEFAULT 'en',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_papers_favorite ON papers(is_favorite);
CREATE INDEX IF NOT EXISTS idx_papers_last_read ON papers(last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_parse_status ON papers(parse_status);

CREATE TABLE IF NOT EXISTS paper_pages (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL, engine TEXT DEFAULT 'pymupdf',
    markdown TEXT, text_content TEXT, images TEXT, tables TEXT, headings TEXT,
    parse_status TEXT DEFAULT 'pending', parse_error TEXT,
    word_count INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(paper_id, page_number, engine)
);
CREATE INDEX IF NOT EXISTS idx_pages_paper ON paper_pages(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_pages_engine ON paper_pages(engine);

CREATE TABLE IF NOT EXISTS translations (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL, engine TEXT DEFAULT 'pymupdf',
    target_language TEXT NOT NULL DEFAULT 'zh', content TEXT NOT NULL,
    model_id TEXT, model_name TEXT, tokens_used INTEGER DEFAULT 0,
    translate_status TEXT DEFAULT 'completed', translate_error TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(paper_id, page_number, engine, target_language)
);
CREATE INDEX IF NOT EXISTS idx_trans_paper ON translations(paper_id, page_number, target_language);
CREATE INDEX IF NOT EXISTS idx_trans_engine ON translations(engine);
CREATE INDEX IF NOT EXISTS idx_trans_language ON translations(target_language);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    title TEXT, model_id TEXT NOT NULL, model_name TEXT, system_prompt TEXT,
    message_count INTEGER DEFAULT 0, tokens_used INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_paper ON conversations(paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_archived ON conversations(is_archived);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT, tool_calls TEXT,
    images TEXT, model_id TEXT, tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0, duration_ms INTEGER, is_error INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_role ON messages(role);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL, paragraph_index INTEGER, content TEXT NOT NULL,
    cited_text TEXT, color TEXT DEFAULT '#fbbf24',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id, page_number);

CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL, paragraph_index INTEGER,
    start_offset INTEGER, end_offset INTEGER, text TEXT NOT NULL,
    color TEXT DEFAULT '#fef08a', note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hl_paper ON highlights(paper_id, page_number);

CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL, title TEXT, note TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bm_paper ON bookmarks(paper_id, page_number);

CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, api_base_url TEXT NOT NULL,
    api_key TEXT NOT NULL, model_id TEXT NOT NULL, is_verified INTEGER DEFAULT 0,
    is_default_translate TEXT, is_default_chat TEXT, sort_order INTEGER DEFAULT 0,
    supports_vision INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_models_default ON models(is_default_translate, is_default_chat);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#3b82f6', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_tags (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
);

CREATE TABLE IF NOT EXISTS glossary_entries (
    id TEXT PRIMARY KEY, paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
    term TEXT NOT NULL, phonetic TEXT, translation TEXT NOT NULL,
    explanation TEXT, source TEXT DEFAULT 'local', lookup_count INTEGER DEFAULT 1,
    is_pinned INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_glossary_term ON glossary_entries(term);
CREATE INDEX IF NOT EXISTS idx_glossary_paper ON glossary_entries(paper_id);
CREATE INDEX IF NOT EXISTS idx_glossary_pinned ON glossary_entries(is_pinned);

CREATE TABLE IF NOT EXISTS parse_jobs (
    id TEXT PRIMARY KEY, paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    engine TEXT NOT NULL DEFAULT 'marker', status TEXT DEFAULT 'pending',
    progress REAL DEFAULT 0, pages_total INTEGER DEFAULT 0, pages_done INTEGER DEFAULT 0,
    error_message TEXT, started_at TEXT, completed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_paper ON parse_jobs(paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON parse_jobs(status);

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, description TEXT
);
"""

_DEFAULT_SETTINGS_SQL = """
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('target_language', '"zh"', datetime('now')),
    ('translate_style', '"academic"', datetime('now')),
    ('auto_translate', 'true', datetime('now')),
    ('preload_next_page', 'true', datetime('now')),
    ('qa_temperature', '0.3', datetime('now')),
    ('qa_max_tokens', '4096', datetime('now')),
    ('qa_system_prompt', '"你是一个专业的学术论文阅读助手。用户正在阅读论文时会向你提问，你需要基于用户提供的论文内容和引用段落，给出准确、专业、有条理的回答。"', datetime('now')),
    ('auto_expand_sidebar', 'true', datetime('now')),
    ('font_size', '16', datetime('now')),
    ('line_height', '1.75', datetime('now')),
    ('theme', '"dark"', datetime('now')),
    ('panel_ratio', '"1:1"', datetime('now')),
    ('sync_scroll', 'true', datetime('now')),
    ('pdf_display_mode', '"original"', datetime('now')),
    ('parse_engine', '"marker"', datetime('now')),
    ('parse_service_url', '"http://localhost:8010"', datetime('now')),
    ('vision_model_id', 'null', datetime('now'));
"""


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
        
        # 确保所有表存在（内嵌 schema，无需外部 SQL 文件）
        await self._create_tables()
        
        # 开发模式下执行增量迁移
        await self._run_migrations()
    
    async def _create_tables(self):
        """创建所有基础表（幂等，使用 IF NOT EXISTS）"""
        try:
            await self.conn.executescript(_SCHEMA_SQL)
            await self.conn.executescript(_DEFAULT_SETTINGS_SQL)
            await self.conn.commit()
            logger.info("[DB] All tables created successfully")
        except Exception as e:
            logger.error(f"[DB] _create_tables failed: {e}")
            raise
        
        # Verify critical tables exist
        try:
            cursor = await self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('papers', 'settings', 'models')"
            )
            tables = [row[0] for row in await cursor.fetchall()]
            logger.info(f"[DB] Verified tables exist: {tables}")
            if 'settings' not in tables:
                raise RuntimeError("settings table was not created")
        except Exception as e:
            logger.error(f"[DB] Table verification failed: {e}")
            raise
    
    async def _run_migrations(self):
        """执行数据库迁移（仅开发模式）"""
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
                    pass
    
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
