"""
系统 API
健康检查、引擎状态、引擎管理
"""

import logging
import asyncio
import json
from typing import Dict, Set
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from services.db import Database
from services.dependencies import get_db
from services.engine_detector import detect_engines, save_engines_to_db, load_engines_from_db
from services.engine_installer import install_engine_background, get_install_status

logger = logging.getLogger(__name__)

router = APIRouter()

# 安装任务追踪
_install_tasks: Dict[str, asyncio.Task] = {}
_install_clients: Dict[str, Set[asyncio.Queue]] = {}


@router.get("/health")
async def health_check(db: Database = Depends(get_db)):
    """健康检查 - 只要服务能响应就返回 ok"""
    paper_count = 0
    engines_info = {}
    try:
        result = await db.fetch_one("SELECT COUNT(*) as count FROM papers")
        paper_count = result["count"] if result else 0
        engines_info = await load_engines_from_db(db)
    except Exception as e:
        logger.warning(f"Health check DB error (non-fatal): {e}")

    return {
        "status": "ok",
        "version": "0.1.2",
        "paper_count": paper_count,
        "engines": engines_info,
    }


@router.get("/engines")
async def list_engines(db: Database = Depends(get_db)):
    """
    列出所有解析引擎及状态
    从数据库读取启动时的检测结果，瞬间返回
    """
    engines_info = await load_engines_from_db(db)
    
    if not engines_info:
        logger.warning("[Engines] No engine data in database, triggering detection")
        engines_info = detect_engines()
        await save_engines_to_db(db, engines_info)
    
    # 构建引擎列表（兼容前端格式）
    engines = []
    
    engine_metadata = {
        "pymupdf": {
            "description": "轻量级文本提取，无需 ML 模型",
            "install_size_mb": 15,
            "built_in": True,
        },
        "marker": {
            "description": "高质量 PDF→Markdown，支持表格/公式/图片",
            "install_size_mb": 1500,
            "built_in": False,
        },
        "mineru": {
            "description": "MinerU 高质量 PDF 解析，支持复杂版面/公式/表格",
            "install_size_mb": 2000,
            "built_in": False,
        },
    }
    
    for name, info in engines_info.items():
        meta = engine_metadata.get(name, {})
        engines.append({
            "name": name,
            "available": info.get("available", False),
            "version": info.get("version"),
            "description": meta.get("description", ""),
            "install_size_mb": meta.get("install_size_mb", 0),
            "built_in": meta.get("built_in", False),
            "error": info.get("error"),
            "checked_at": info.get("checked_at"),
        })
    
    # 确定默认引擎
    default_engine = "pymupdf"
    for preferred in ["mineru", "marker"]:
        if engines_info.get(preferred, {}).get("available"):
            default_engine = preferred
            break
    
    return {
        "engines": engines,
        "default_engine": default_engine,
    }


@router.post("/engines/recheck")
async def recheck_engines(db: Database = Depends(get_db)):
    """
    重新检测所有引擎状态
    用于安装/卸载引擎后刷新
    """
    logger.info("[Engines] Rechecking all engines...")
    engines_info = detect_engines()
    await save_engines_to_db(db, engines_info)
    
    available_count = sum(1 for e in engines_info.values() if e.get("available"))
    logger.info(f"[Engines] Recheck complete: {available_count}/{len(engines_info)} available")
    
    return {
        "status": "ok",
        "engines": engines_info,
        "message": f"检测完成，{available_count}/{len(engines_info)} 个引擎可用",
    }


@router.post("/engines/{engine_name}/install")
async def install_engine(
    engine_name: str, 
    use_precompiled: bool = True,
    db: Database = Depends(get_db)
):
    """
    安装解析引擎
    支持 marker 和 mineru
    
    Args:
        engine_name: 引擎名称
        use_precompiled: 是否优先使用预编译包（默认 True）
    """
    if engine_name not in ["marker", "mineru"]:
        raise HTTPException(status_code=400, detail=f"不支持的引擎: {engine_name}")
    
    # 检查是否已经在安装
    if engine_name in _install_tasks and not _install_tasks[engine_name].done():
        return {
            "status": "already_installing",
            "message": f"{engine_name} 正在安装中",
        }
    
    # 启动后台安装任务
    install_type = "预编译包" if use_precompiled else "pip"
    logger.info(f"[Engines] Starting installation of {engine_name} using {install_type}")
    task = asyncio.create_task(install_engine_background(engine_name, use_precompiled=use_precompiled))
    _install_tasks[engine_name] = task
    
    return {
        "status": "started",
        "message": f"开始安装 {engine_name}（使用{install_type}）",
        "use_precompiled": use_precompiled,
    }


@router.get("/engines/{engine_name}/install/status")
async def get_engine_install_status(engine_name: str, stream: bool = False):
    """
    获取引擎安装状态

    Args:
        engine_name: 引擎名称
        stream: 是否 SSE 流式返回（默认 False，返回一次 JSON 快照）
    """
    if engine_name not in ["marker", "mineru"]:
        raise HTTPException(status_code=400, detail=f"不支持的引擎: {engine_name}")

    if not stream:
        # 快照模式：直接返回当前状态 JSON
        return get_install_status(engine_name)

    # SSE 流式模式
    async def event_generator():
        # 创建客户端队列
        client_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        if engine_name not in _install_clients:
            _install_clients[engine_name] = set()
        _install_clients[engine_name].add(client_queue)
        
        try:
            # 发送初始状态
            status = get_install_status(engine_name)
            yield f"data: {json.dumps(status)}\n\n"
            
            # 如果还没开始安装，等待一下
            if status["status"] == "not_started":
                await asyncio.sleep(1)
            
            # 持续推送状态更新
            last_log_count = len(status.get("logs", []))
            while True:
                await asyncio.sleep(1)
                
                # 获取最新状态
                current_status = get_install_status(engine_name)
                current_log_count = len(current_status.get("logs", []))
                
                # 只有状态变化时才推送
                if current_log_count > last_log_count or current_status["status"] != status["status"]:
                    yield f"data: {json.dumps(current_status)}\n\n"
                    last_log_count = current_log_count
                    status = current_status
                    
                    # 如果安装完成，结束流
                    if current_status["status"] in ["completed", "failed"]:
                        break
            
        finally:
            # 清理客户端队列
            if engine_name in _install_clients:
                _install_clients[engine_name].discard(client_queue)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
