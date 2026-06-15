"""
翻译 API
单页翻译、段落重翻译、全文翻译
支持后台翻译：即使客户端断开，翻译也会继续完成并存储到数据库
"""

import json
import uuid
import asyncio
import logging
from datetime import datetime
from typing import Dict, Set

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from services.db import Database
from services.dependencies import get_db
from services.ai import AIService, get_ai_service, TRANSLATE_SYSTEM_PROMPT

logger = logging.getLogger("paperlens.translate")

router = APIRouter()

# 跟踪正在进行的翻译任务
_active_translations: Dict[str, asyncio.Task] = {}
_translation_clients: Dict[str, Set[asyncio.Queue]] = {}


class TranslatePageRequest(BaseModel):
    model_id: Optional[str] = None
    engine: Optional[str] = None  # 解析引擎，用于关联翻译缓存
    force: Optional[bool] = False


async def _do_translate_and_save(
    db: Database,
    paper_id: str,
    page_number: int,
    engine: str,
    model: dict,
    markdown: str,
    force: bool = False
):
    """
    执行翻译并保存到数据库（后台任务）
    即使客户端断开也会继续执行
    """
    task_key = f"{paper_id}:{page_number}:{engine}"
    
    try:
        ai_service = await get_ai_service(model)
        
        full_content = ""
        tokens_input = 0
        tokens_output = 0
        
        messages = [
            {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT},
            {"role": "user", "content": markdown},
        ]
        
        # 获取订阅此翻译的客户端队列
        client_queues = _translation_clients.get(task_key, set())
        
        async for event in ai_service.chat_stream(messages, temperature=0.3):
            if event["type"] == "content":
                full_content += event["content"]
                # 推送给所有订阅的客户端
                msg = json.dumps({'type': 'content', 'content': event['content']})
                for queue in list(client_queues):
                    try:
                        queue.put_nowait(msg)
                    except asyncio.QueueFull:
                        pass
            elif event["type"] == "done":
                tokens_input = event.get("tokens_input", 0)
                tokens_output = event.get("tokens_output", 0)
        
        # 保存到数据库（使用 shield 防止取消）
        now = datetime.now().isoformat()
        
        existing_translation = await db.fetch_one(
            """SELECT id FROM translations
               WHERE paper_id = ? AND page_number = ? AND engine = ? AND target_language = ?""",
            (paper_id, page_number, engine, "zh")
        )
        
        if existing_translation:
            # 重翻译：覆盖旧结果
            await db.execute(
                """UPDATE translations SET content=?, model_id=?, model_name=?,
                   tokens_used=?, updated_at=?
                   WHERE id=?""",
                (full_content, model["id"], model["name"],
                 tokens_input + tokens_output, now, existing_translation["id"])
            )
            logger.info(f"[Translate] Updated translation for {task_key}")
        else:
            # 新增翻译
            translation_id = str(uuid.uuid4())
            await db.insert("translations", {
                "id": translation_id,
                "paper_id": paper_id,
                "page_number": page_number,
                "engine": engine,
                "target_language": "zh",
                "content": full_content,
                "model_id": model["id"],
                "model_name": model["name"],
                "tokens_used": tokens_input + tokens_output,
                "created_at": now,
                "updated_at": now,
            })
            
            await db.execute(
                "UPDATE papers SET pages_translated = pages_translated + 1 WHERE id = ?",
                (paper_id,)
            )
            logger.info(f"[Translate] Saved new translation for {task_key}")
        
        # 发送完成消息给客户端
        done_msg = json.dumps({
            'type': 'done',
            'tokens_input': tokens_input,
            'tokens_output': tokens_output
        })
        for queue in list(client_queues):
            try:
                queue.put_nowait(done_msg)
            except asyncio.QueueFull:
                pass
        
    except Exception as e:
        logger.error(f"[Translate] Error translating {task_key}: {e}")
        error_msg = json.dumps({'type': 'error', 'message': str(e)})
        for queue in list(_translation_clients.get(task_key, set())):
            try:
                queue.put_nowait(error_msg)
            except asyncio.QueueFull:
                pass
    finally:
        # 清理
        _active_translations.pop(task_key, None)
        _translation_clients.pop(task_key, None)


@router.post("/{paper_id}/pages/{page_number}")
async def translate_page(
    paper_id: str,
    page_number: int,
    data: TranslatePageRequest = TranslatePageRequest(),
    db: Database = Depends(get_db),
):
    """
    翻译单页（SSE 流式返回，支持后台运行）
    - 如果已有缓存且 force=false，直接返回缓存
    - 如果已有正在进行的翻译，加入订阅获取进度
    - 否则启动新的后台翻译任务
    """
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 确定使用的解析引擎
    engine = data.engine or paper.get("parse_engine", "pymupdf")
    
    page = await db.fetch_one(
        "SELECT * FROM paper_pages WHERE paper_id = ? AND page_number = ? AND engine = ?",
        (paper_id, page_number, engine)
    )
    
    if not page or not page.get("markdown"):
        raise HTTPException(status_code=404, detail="页面内容不存在，请先解析 PDF")
    
    # 检查缓存（除非强制重翻译）
    if not data.force:
        existing = await db.fetch_one(
            """SELECT * FROM translations
               WHERE paper_id = ? AND page_number = ? AND engine = ? AND target_language = ?""",
            (paper_id, page_number, engine, "zh")
        )
        
        if existing:
            return {
                "page_number": page_number,
                "content": existing["content"],
                "model_name": existing["model_name"],
                "tokens_used": existing["tokens_used"],
                "translated_at": existing["created_at"],
                "cached": True,
            }
    
    # 获取模型
    model = None
    if data.model_id:
        model = await db.get_by_id("models", data.model_id)
    else:
        model = await db.fetch_one(
            "SELECT * FROM models WHERE is_default_translate IS NOT NULL LIMIT 1"
        )
        if not model:
            model = await db.fetch_one("SELECT * FROM models LIMIT 1")
    
    if not model:
        raise HTTPException(status_code=400, detail="未配置 AI 模型，请先在设置中添加模型")
    
    task_key = f"{paper_id}:{page_number}:{engine}"
    
    # 创建客户端消息队列
    client_queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
    if task_key not in _translation_clients:
        _translation_clients[task_key] = set()
    _translation_clients[task_key].add(client_queue)
    
    # 如果已有正在进行的翻译，直接订阅
    if task_key in _active_translations:
        logger.info(f"[Translate] Joining existing translation for {task_key}")
    else:
        # 启动新的后台翻译任务
        logger.info(f"[Translate] Starting new translation for {task_key}")
        task = asyncio.create_task(
            _do_translate_and_save(db, paper_id, page_number, engine, model, page["markdown"], data.force)
        )
        _active_translations[task_key] = task
    
    # 流式返回给客户端
    async def stream_to_client():
        try:
            # 发送开始消息
            yield f"data: {json.dumps({'type': 'started'})}\n\n"
            
            while True:
                try:
                    # 等待消息，超时 30 秒发送心跳
                    msg = await asyncio.wait_for(client_queue.get(), timeout=30.0)
                    yield f"data: {msg}\n\n"
                    
                    # 如果是完成或错误消息，结束流
                    parsed = json.loads(msg)
                    if parsed.get("type") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    # 心跳
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except asyncio.CancelledError:
            logger.info(f"[Translate] Client disconnected from {task_key}")
        finally:
            # 从客户端集合中移除
            if task_key in _translation_clients:
                _translation_clients[task_key].discard(client_queue)
    
    return StreamingResponse(
        stream_to_client(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/{paper_id}/translations/{page_number}")
async def get_translation(
    paper_id: str,
    page_number: int,
    engine: str = "pymupdf",
    language: str = "zh",
    db: Database = Depends(get_db),
):
    """
    获取已翻译内容
    同时返回翻译状态（是否正在进行中）
    """
    task_key = f"{paper_id}:{page_number}:{engine}"
    is_translating = task_key in _active_translations
    
    result = await db.fetch_one(
        """SELECT * FROM translations
           WHERE paper_id = ? AND page_number = ? AND engine = ? AND target_language = ?""",
        (paper_id, page_number, engine, language)
    )
    
    if not result:
        return {
            "page_number": page_number,
            "content": None,
            "translating": is_translating,
            "cached": False,
        }
    
    return {
        "page_number": result["page_number"],
        "content": result["content"],
        "model_name": result["model_name"],
        "tokens_used": result["tokens_used"],
        "translated_at": result["created_at"],
        "translating": is_translating,
        "cached": True,
    }


@router.get("/{paper_id}/translations")
async def get_all_translations(
    paper_id: str,
    engine: str = "pymupdf",
    language: str = "zh",
    db: Database = Depends(get_db),
):
    """获取某篇论文某引擎的所有页面翻译"""
    results = await db.fetch_all(
        """SELECT page_number, content, model_name, tokens_used, created_at
           FROM translations
           WHERE paper_id = ? AND engine = ? AND target_language = ?
           ORDER BY page_number""",
        (paper_id, engine, language)
    )
    
    return {
        "translations": {
            r["page_number"]: {
                "content": r["content"],
                "model_name": r["model_name"],
                "tokens_used": r["tokens_used"],
                "translated_at": r["created_at"],
            }
            for r in results
        }
    }


@router.post("/{paper_id}/pages/{page_number}/paragraphs/{paragraph_index}")
async def retranslate_paragraph(
    paper_id: str,
    page_number: int,
    paragraph_index: int,
    db: Database = Depends(get_db),
):
    """重新翻译某段"""
    return {"status": "not_implemented"}


@router.post("/{paper_id}/all")
async def translate_all(
    paper_id: str,
    db: Database = Depends(get_db),
):
    """翻译全文"""
    return {"status": "not_implemented"}


@router.get("/{paper_id}/all/status")
async def translate_all_status(
    paper_id: str,
    db: Database = Depends(get_db),
):
    """查询全文翻译进度"""
    return {"status": "not_implemented"}
