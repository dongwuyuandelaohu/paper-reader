"""
PDF 解析 API
触发解析、查询状态、获取解析结果
支持按引擎分别保存解析结果，切换引擎时加载缓存

架构说明：
- 解析任务通过 threading.Thread 在独立线程中运行
- 每个解析线程使用独立的 sqlite3 连接，不共享主线程的 async 连接
- 主线程的 asyncio 事件循环不会被阻塞，其他 API 请求正常响应
- 解析进度通过 SSE (Server-Sent Events) 推送给前端，无需轮询
"""

import json
import uuid
import logging
import sqlite3
import threading
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from services.db import Database
from services.dependencies import get_db
from config.paths import get_data_dir

logger = logging.getLogger("paperlens.parse")

router = APIRouter()


class ParseRequest(BaseModel):
    engine: Optional[str] = None


# ── Active parse threads tracking ──
_active_threads: dict[str, threading.Thread] = {}

# ── SSE progress queues ──
# key: paper_id, value: asyncio.Queue
_progress_queues: dict[str, asyncio.Queue] = {}
_progress_queues_lock = threading.Lock()
_event_loop: Optional[asyncio.AbstractEventLoop] = None


def set_event_loop(loop: asyncio.AbstractEventLoop):
    """Set the event loop for cross-thread communication."""
    global _event_loop
    _event_loop = loop


def push_progress(paper_id: str, data: dict):
    """Push progress update to SSE queue (thread-safe)."""
    if not _event_loop:
        return
    
    def _push():
        with _progress_queues_lock:
            if paper_id in _progress_queues:
                try:
                    _progress_queues[paper_id].put_nowait(data)
                except asyncio.QueueFull:
                    pass  # Drop old updates if queue is full
    
    _event_loop.call_soon_threadsafe(_push)


# ── DB migration ──

_engine_column_checked = False


async def _ensure_engine_column(db: Database):
    global _engine_column_checked
    if _engine_column_checked:
        return
    try:
        await db.execute("SELECT engine FROM paper_pages LIMIT 1")
    except Exception:
        try:
            await db.execute("ALTER TABLE paper_pages ADD COLUMN engine TEXT DEFAULT 'pymupdf'")
            logger.info("Added 'engine' column to paper_pages table")
        except Exception:
            pass
    _engine_column_checked = True


def _sync_ensure_engine_column(db_path: str):
    """Synchronous migration for background threads."""
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("SELECT engine FROM paper_pages LIMIT 1")
    except sqlite3.OperationalError:
        try:
            conn.execute("ALTER TABLE paper_pages ADD COLUMN engine TEXT DEFAULT 'pymupdf'")
            conn.commit()
            logger.info("[THREAD] Added 'engine' column to paper_pages")
        except sqlite3.OperationalError:
            pass
    finally:
        conn.close()


# ── API endpoints ──

@router.post("/{paper_id}/parse")
async def trigger_parse(
    paper_id: str,
    data: ParseRequest = ParseRequest(),
    db: Database = Depends(get_db),
):
    """触发 PDF 解析 — 在独立线程中运行，不阻塞其他请求"""
    # Set event loop for cross-thread communication
    if not _event_loop:
        set_event_loop(asyncio.get_event_loop())
    
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")

    await _ensure_engine_column(db)
    engine_name = data.engine or "pymupdf"

    # Check if already fully parsed with this engine
    existing_pages = await db.fetch_all(
        "SELECT page_number FROM paper_pages WHERE paper_id = ? AND engine = ? AND parse_status = 'parsed'",
        (paper_id, engine_name)
    )
    if existing_pages and len(existing_pages) >= paper["total_pages"]:
        logger.info(f"[{engine_name}] Paper {paper_id} already parsed ({len(existing_pages)} pages cached)")
        # Update paper status
        now = datetime.now().isoformat()
        await db.execute(
            "UPDATE papers SET parse_status='parsed', parse_engine=?, pages_parsed=?, updated_at=? WHERE id=?",
            (engine_name, len(existing_pages), now, paper_id)
        )
        return {
            "status": "already_parsed",
            "engine": engine_name,
            "pages_parsed": len(existing_pages),
            "total_pages": paper["total_pages"],
        }

    # Check if a parse thread is already running for this paper
    thread_key = f"{paper_id}:{engine_name}"
    if thread_key in _active_threads and _active_threads[thread_key].is_alive():
        return {
            "status": "already_running",
            "engine": engine_name,
            "message": "解析任务正在运行中",
        }

    job_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    await db.execute(
        """INSERT INTO parse_jobs (id, paper_id, engine, status, progress, pages_total, pages_done, started_at, created_at)
           VALUES (?, ?, ?, 'running', 0, ?, 0, ?, ?)""",
        (job_id, paper_id, engine_name, paper["total_pages"], now, now)
    )

    await db.execute(
        "UPDATE papers SET parse_status = 'parsing', parse_engine = ?, updated_at = ? WHERE id = ?",
        (engine_name, now, paper_id)
    )

    # Launch parse in a real OS thread — completely independent from the event loop
    db_path = str(db.db_path)
    thread = threading.Thread(
        target=_run_parse_in_thread,
        args=(paper_id, job_id, paper["file_path"], paper["total_pages"], engine_name, db_path),
        daemon=True,
        name=f"parse-{engine_name}-{paper_id[:8]}",
    )
    _active_threads[thread_key] = thread
    thread.start()

    logger.info(f"[PARSE] Thread started: {thread.name} (pid={threading.get_ident()})")

    return {
        "status": "started",
        "engine": engine_name,
        "job_id": job_id,
    }


def _run_parse_in_thread(paper_id: str, job_id: str, file_path: str, total_pages: int, engine_name: str, db_path: str):
    """
    在独立线程中运行解析任务。
    使用独立的 sqlite3 连接，完全不阻塞主线程的 asyncio 事件循环。
    """
    thread_name = threading.current_thread().name
    logger.info(f"[{thread_name}] === Starting parse with engine: {engine_name} ===")
    logger.info(f"[{thread_name}] Paper: {paper_id}")
    logger.info(f"[{thread_name}] File: {file_path}")
    logger.info(f"[{thread_name}] Total pages: {total_pages}")

    _sync_ensure_engine_column(db_path)

    # Independent DB connection for this thread
    conn = sqlite3.connect(db_path, timeout=30)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")  # WAL mode allows concurrent reads
    conn.row_factory = sqlite3.Row

    output_dir = get_data_dir() / "images" / paper_id / engine_name
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"[{thread_name}] Output dir: {output_dir}")

    # Push initial progress
    push_progress(paper_id, {
        "type": "started",
        "engine": engine_name,
        "job_id": job_id,
        "total_pages": total_pages,
    })

    # Import and create engine
    if engine_name == "marker":
        from engines.marker_engine import MarkerEngine
        logger.info(f"[{thread_name}] Engine: MarkerEngine")
        engine = MarkerEngine(output_dir=str(output_dir))
    elif engine_name == "mineru":
        from engines.mineru_engine import MinerUEngine
        logger.info(f"[{thread_name}] Engine: MinerUEngine")
        engine = MinerUEngine(output_dir=str(output_dir))
    else:
        from engines.pymupdf_engine import PyMuPDFEngine
        logger.info(f"[{thread_name}] Engine: PyMuPDFEngine")
        engine = PyMuPDFEngine(output_dir=str(output_dir / "images"))

    try:
        logger.info(f"[{thread_name}] Calling engine.parse_all()...")
        results = engine.parse_all(file_path, paper_id=paper_id)
        logger.info(f"[{thread_name}] Engine returned {len(results)} page results")

        for i, result in enumerate(results):
            page_number = result["page_number"]
            now = datetime.now().isoformat()
            page_id = str(uuid.uuid4())

            # Check existing for this specific engine
            cursor = conn.execute(
                "SELECT id FROM paper_pages WHERE paper_id = ? AND page_number = ? AND engine = ?",
                (paper_id, page_number, engine_name)
            )
            existing = cursor.fetchone()

            if existing:
                conn.execute(
                    """UPDATE paper_pages SET markdown=?, text_content=?, images=?, tables=?,
                       headings=?, parse_status='parsed', word_count=?, updated_at=?
                       WHERE id=?""",
                    (result["markdown"], result["text_content"],
                     json.dumps(result["images"]), json.dumps(result["tables"]),
                     json.dumps(result["headings"]), result["word_count"],
                     now, existing["id"])
                )
            else:
                conn.execute(
                    """INSERT INTO paper_pages
                       (id, paper_id, page_number, engine, markdown, text_content, images, tables,
                        headings, parse_status, word_count, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'parsed', ?, ?, ?)""",
                    (page_id, paper_id, page_number, engine_name, result["markdown"],
                     result["text_content"], json.dumps(result["images"]),
                     json.dumps(result["tables"]), json.dumps(result["headings"]),
                     result["word_count"], now, now)
                )

            conn.commit()

            progress = (i + 1) / total_pages
            conn.execute(
                "UPDATE parse_jobs SET progress=?, pages_done=? WHERE id=?",
                (progress, i + 1, job_id)
            )
            conn.commit()
            logger.info(f"[{thread_name}] Page {page_number}/{total_pages} done ({engine_name})")
            
            # Push progress via SSE
            push_progress(paper_id, {
                "type": "progress",
                "page_number": page_number,
                "pages_done": i + 1,
                "total_pages": total_pages,
                "progress": progress,
            })

        now = datetime.now().isoformat()
        conn.execute(
            "UPDATE parse_jobs SET status='completed', progress=1.0, pages_done=?, completed_at=? WHERE id=?",
            (total_pages, now, job_id)
        )
        conn.execute(
            "UPDATE papers SET parse_status='parsed', pages_parsed=?, parse_engine=?, updated_at=? WHERE id=?",
            (total_pages, engine_name, now, paper_id)
        )
        conn.commit()

        logger.info(f"[{thread_name}] === Completed: {engine_name} ({total_pages} pages) ===")
        
        # Push completion via SSE
        push_progress(paper_id, {
            "type": "completed",
            "engine": engine_name,
            "total_pages": total_pages,
        })

    except Exception as e:
        logger.error(f"[{thread_name}] Failed: {e}", exc_info=True)
        now = datetime.now().isoformat()
        error_msg = str(e)
        try:
            conn.execute(
                "UPDATE parse_jobs SET status='failed', error_message=?, completed_at=? WHERE id=?",
                (error_msg, now, job_id)
            )
            conn.execute(
                "UPDATE papers SET parse_status='failed', parse_error=?, updated_at=? WHERE id=?",
                (error_msg, now, paper_id)
            )
            conn.commit()
        except Exception as db_err:
            logger.error(f"[{thread_name}] DB error update failed: {db_err}")
        
        # Push error via SSE
        push_progress(paper_id, {
            "type": "error",
            "engine": engine_name,
            "error": error_msg,
        })
    finally:
        conn.close()
        thread_key = f"{paper_id}:{engine_name}"
        _active_threads.pop(thread_key, None)
        logger.info(f"[{thread_name}] Thread finished, connection closed")


@router.get("/{paper_id}/parse/status")
async def get_parse_status(
    paper_id: str,
    engine: Optional[str] = None,
    db: Database = Depends(get_db),
):
    """查询解析状态（可按引擎过滤）"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")

    await _ensure_engine_column(db)

    if engine:
        job = await db.fetch_one(
            "SELECT * FROM parse_jobs WHERE paper_id = ? AND engine = ? ORDER BY created_at DESC LIMIT 1",
            (paper_id, engine)
        )
    else:
        job = await db.fetch_one(
            "SELECT * FROM parse_jobs WHERE paper_id = ? ORDER BY created_at DESC LIMIT 1",
            (paper_id,)
        )

    if engine:
        pages = await db.fetch_all(
            "SELECT page_number, parse_status FROM paper_pages WHERE paper_id = ? AND engine = ? ORDER BY page_number",
            (paper_id, engine)
        )
    else:
        pages = await db.fetch_all(
            "SELECT page_number, parse_status FROM paper_pages WHERE paper_id = ? ORDER BY page_number",
            (paper_id,)
        )

    page_statuses = {p["page_number"]: p["parse_status"] for p in pages}
    pages_parsed = len([p for p in pages if p["parse_status"] == "parsed"])

    engine_results = await db.fetch_all(
        """SELECT engine, COUNT(*) as page_count
           FROM paper_pages WHERE paper_id = ? AND parse_status = 'parsed'
           GROUP BY engine""",
        (paper_id,)
    )
    cached_engines = {r["engine"]: r["page_count"] for r in engine_results}

    # Check if thread is still running
    thread_key_running = None
    for key, t in _active_threads.items():
        if key.startswith(paper_id) and t.is_alive():
            thread_key_running = key
            break

    return {
        "paper_id": paper_id,
        "parse_status": paper["parse_status"],
        "total_pages": paper["total_pages"],
        "pages_parsed": pages_parsed,
        "current_engine": engine or paper.get("parse_engine"),
        "cached_engines": cached_engines,
        "thread_running": thread_key_running is not None,
        "job": {
            "id": job["id"],
            "engine": job["engine"],
            "status": job["status"],
            "progress": job["progress"],
            "pages_done": job["pages_done"],
            "pages_total": job["pages_total"],
            "error_message": job.get("error_message"),
        } if job else None,
        "page_statuses": page_statuses,
    }


@router.get("/{paper_id}/parse/stream")
async def parse_stream(paper_id: str):
    """
    SSE endpoint for parse progress.
    Client connects and receives real-time progress updates.
    """
    # Create queue for this client
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    
    with _progress_queues_lock:
        _progress_queues[paper_id] = queue
    
    async def event_generator():
        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            
            while True:
                try:
                    # Wait for progress update with timeout
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(data)}\n\n"
                    
                    # If completed or error, close stream
                    if data.get("type") in ("completed", "error"):
                        break
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
        finally:
            # Clean up queue
            with _progress_queues_lock:
                _progress_queues.pop(paper_id, None)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/{paper_id}/pages")
async def get_parsed_pages(
    paper_id: str,
    engine: Optional[str] = None,
    db: Database = Depends(get_db),
):
    """获取解析后的页面内容（可按引擎过滤）"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")

    await _ensure_engine_column(db)

    if engine:
        pages = await db.fetch_all(
            "SELECT * FROM paper_pages WHERE paper_id = ? AND engine = ? ORDER BY page_number",
            (paper_id, engine)
        )
    else:
        current_engine = paper.get("parse_engine", "pymupdf")
        pages = await db.fetch_all(
            "SELECT * FROM paper_pages WHERE paper_id = ? AND engine = ? ORDER BY page_number",
            (paper_id, current_engine)
        )
        if not pages:
            pages = await db.fetch_all(
                "SELECT * FROM paper_pages WHERE paper_id = ? ORDER BY page_number",
                (paper_id,)
            )

    return {
        "paper_id": paper_id,
        "total_pages": paper["total_pages"],
        "engine": engine or paper.get("parse_engine"),
        "pages": [
            {
                "page_number": p["page_number"],
                "markdown": p["markdown"],
                "text_content": p["text_content"],
                "headings": json.loads(p["headings"]) if p["headings"] else [],
                "images": json.loads(p["images"]) if p["images"] else [],
                "parse_status": p["parse_status"],
                "word_count": p["word_count"],
            }
            for p in pages
        ],
    }


@router.get("/{paper_id}/pages/{page_number}")
async def get_parsed_page(
    paper_id: str,
    page_number: int,
    engine: Optional[str] = None,
    db: Database = Depends(get_db),
):
    """获取单页解析结果"""
    await _ensure_engine_column(db)

    if engine:
        page = await db.fetch_one(
            "SELECT * FROM paper_pages WHERE paper_id = ? AND page_number = ? AND engine = ?",
            (paper_id, page_number, engine)
        )
    else:
        page = await db.fetch_one(
            "SELECT * FROM paper_pages WHERE paper_id = ? AND page_number = ? ORDER BY rowid DESC LIMIT 1",
            (paper_id, page_number)
        )

    if not page:
        raise HTTPException(status_code=404, detail="页面未解析")

    return {
        "page_number": page["page_number"],
        "engine": page.get("engine", "pymupdf"),
        "markdown": page["markdown"],
        "text_content": page["text_content"],
        "headings": json.loads(page["headings"]) if page["headings"] else [],
        "images": json.loads(page["images"]) if page["images"] else [],
        "parse_status": page["parse_status"],
        "word_count": page["word_count"],
    }


@router.get("/{paper_id}/images/{filename}")
async def get_paper_image(
    paper_id: str,
    filename: str,
):
    """获取论文图片"""
    base_dir = get_data_dir() / "images" / paper_id

    # Check if base directory exists
    if not base_dir.exists():
        raise HTTPException(status_code=404, detail="图片不存在")

    image_path = base_dir / filename
    if not image_path.exists():
        image_path = base_dir / "images" / filename
    if not image_path.exists():
        for engine_dir in base_dir.iterdir():
            if engine_dir.is_dir():
                candidate = engine_dir / filename
                if candidate.exists():
                    image_path = candidate
                    break
                candidate = engine_dir / "images" / filename
                if candidate.exists():
                    image_path = candidate
                    break

    if not image_path.exists():
        raise HTTPException(status_code=404, detail="图片不存在")

    media_type = "image/png"
    if filename.endswith(".jpg") or filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif filename.endswith(".gif"):
        media_type = "image/gif"

    return FileResponse(image_path, media_type=media_type)
