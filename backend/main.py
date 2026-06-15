"""
PaperLens 后端服务
FastAPI 应用入口
"""

import os
import sys
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from config.paths import get_db_path, get_static_dir, is_frozen
from services.db import Database
from services.dependencies import set_db
from services.engine_detector import detect_engines, save_engines_to_db
from api import papers, translate, conversations, models, settings, notes, glossary, system, parse, tags


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时：初始化数据库
    db_path = os.environ.get("PAPERLENS_DB_PATH")
    if db_path:
        db_path = Path(db_path)
    else:
        # 使用统一的路径配置
        db_path = get_db_path()
    
    db = Database(db_path)
    await db.init()
    set_db(db)
    
    print(f"✓ 数据库已连接: {db_path}")
    
    # 启动时检测所有引擎
    print("⚙ 正在检测解析引擎...")
    engines = detect_engines()
    await save_engines_to_db(db, engines)
    
    available_count = sum(1 for e in engines.values() if e.get("available"))
    print(f"✓ 引擎检测完成: {available_count}/{len(engines)} 个引擎可用")
    for name, info in engines.items():
        status = "✓" if info["available"] else "✗"
        version = f" (v{info['version']})" if info["version"] else ""
        print(f"  {status} {name}{version}")
    
    print(f"✓ PaperLens 后端服务已启动")
    
    yield
    
    # 关闭时：清理资源
    await db.close()
    print("✓ PaperLens 后端服务已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="PaperLens API",
    description="论文双语阅读工具后端服务",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 配置（允许前端访问）
# 开发模式允许 localhost:5173 和 localhost:3000
# 打包后前端由后端直接提供，不需要 CORS
allow_origins = ["http://localhost:5173", "http://localhost:3000"]
if is_frozen():
    # 打包后，允许所有本地访问（因为前端和后端在同一进程）
    allow_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(papers.router, prefix="/api/v1/papers", tags=["论文管理"])
app.include_router(translate.router, prefix="/api/v1/translate", tags=["翻译"])
app.include_router(conversations.router, prefix="/api/v1/conversations", tags=["对话"])
app.include_router(models.router, prefix="/api/v1/models", tags=["模型管理"])
app.include_router(settings.router, prefix="/api/v1/settings", tags=["设置"])
app.include_router(notes.router, prefix="/api/v1/notes", tags=["笔记"])
app.include_router(glossary.router, prefix="/api/v1/glossary", tags=["术语"])
app.include_router(system.router, prefix="/api/v1/system", tags=["系统"])
app.include_router(parse.router, prefix="/api/v1/parse", tags=["解析"])
app.include_router(tags.router, prefix="/api/v1/tags", tags=["标签"])


@app.get("/")
async def root():
    """根路径"""
    # 如果是打包后的版本，提供前端静态文件
    if is_frozen():
        static_dir = get_static_dir()
        index_file = static_dir / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
    
    return {
        "name": "PaperLens API",
        "version": "0.1.0",
        "docs": "/docs",
    }


# 如果是打包后的版本，挂载前端静态文件
if is_frozen():
    static_dir = get_static_dir()
    if static_dir.exists():
        # 挂载 /assets 目录
        assets_dir = static_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        
        # 为所有其他路径提供 index.html（支持前端路由）
        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str):
            """提供前端静态文件（支持 SPA 路由）"""
            # 先检查是否是静态文件
            file_path = static_dir / full_path
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)
            
            # 否则返回 index.html（SPA 路由）
            index_file = static_dir / "index.html"
            if index_file.exists():
                return FileResponse(index_file)
            
            return {"detail": "Not found"}, 404
        
        print(f"✓ 前端静态文件已挂载: {static_dir}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8765,
        reload=not is_frozen(),  # 打包后禁用热重载
    )
