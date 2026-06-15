"""
PaperLens 数据库初始化脚本
用法: python init_db.py [db_path]
默认路径: ~/.paperlens/data.db
"""

import sqlite3
import os
import sys
from pathlib import Path


def get_default_db_path() -> Path:
    """获取默认数据库路径"""
    # 开发阶段：使用项目目录下的 data 文件夹
    # 生产环境：使用系统用户数据目录
    dev_dir = Path(__file__).parent.parent / "data"
    if dev_dir.exists() or os.environ.get("PAPERLENS_DEV_MODE", "1") == "1":
        db_dir = dev_dir
    else:
        if sys.platform == "win32":
            base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
        elif sys.platform == "darwin":
            base = Path.home() / "Library" / "Application Support"
        else:
            base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
        db_dir = base / "PaperLens"
    
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "data.db"


def get_migrations_dir() -> Path:
    """获取迁移文件目录"""
    return Path(__file__).parent / "migrations"


def get_current_version(conn: sqlite3.Connection) -> int:
    """获取当前数据库版本"""
    try:
        cursor = conn.execute("SELECT MAX(version) FROM schema_version")
        result = cursor.fetchone()
        return result[0] if result[0] else 0
    except sqlite3.OperationalError:
        # schema_version 表不存在
        return 0


def get_available_migrations() -> list[tuple[int, Path]]:
    """获取所有可用的迁移文件"""
    migrations_dir = get_migrations_dir()
    if not migrations_dir.exists():
        return []
    
    migrations = []
    for f in migrations_dir.glob("*.sql"):
        try:
            version = int(f.stem.split("_")[0])
            migrations.append((version, f))
        except (ValueError, IndexError):
            continue
    
    return sorted(migrations, key=lambda x: x[0])


def apply_migration(conn: sqlite3.Connection, version: int, sql_path: Path):
    """应用单个迁移文件"""
    print(f"  应用迁移 {version}: {sql_path.name}")
    
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()
    
    conn.executescript(sql)
    conn.commit()
    print(f"  ✓ 迁移 {version} 应用成功")


def init_database(db_path: Path | None = None):
    """初始化数据库"""
    if db_path is None:
        db_path = get_default_db_path()
    
    print(f"数据库路径: {db_path}")
    
    # 确保目录存在
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    # 连接数据库
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    
    try:
        current_version = get_current_version(conn)
        print(f"当前数据库版本: {current_version}")
        
        migrations = get_available_migrations()
        print(f"可用迁移文件: {len(migrations)} 个")
        
        # 应用未执行的迁移
        applied = 0
        for version, sql_path in migrations:
            if version > current_version:
                apply_migration(conn, version, sql_path)
                applied += 1
        
        if applied == 0:
            print("数据库已是最新版本，无需迁移")
        else:
            print(f"成功应用 {applied} 个迁移")
        
        # 安全的增量列迁移：添加 supports_vision 列到 models 表
        try:
            conn.execute("SELECT supports_vision FROM models LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE models ADD COLUMN supports_vision INTEGER DEFAULT 0")
            conn.commit()
            print("  ✓ 已添加 models.supports_vision 列")
        
        # 验证表结构
        cursor = conn.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """)
        tables = [row[0] for row in cursor.fetchall()]
        print(f"\n数据库表 ({len(tables)} 个):")
        for table in tables:
            cursor = conn.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  - {table}: {count} 行")
        
    finally:
        conn.close()
    
    print(f"\n✓ 数据库初始化完成: {db_path}")
    return db_path


if __name__ == "__main__":
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    init_database(db_path)
