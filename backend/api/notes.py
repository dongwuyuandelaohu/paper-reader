"""
笔记 API
创建、更新、删除、导出笔记（按解析引擎区分）
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from services.db import Database
from services.dependencies import get_db

router = APIRouter()


class CreateNoteRequest(BaseModel):
    paper_id: str
    page_number: int
    paragraph_index: Optional[int] = None
    content: str
    cited_text: Optional[str] = None
    color: str = "#fbbf24"
    engine: Optional[str] = None


class UpdateNoteRequest(BaseModel):
    content: Optional[str] = None
    color: Optional[str] = None


@router.get("/{paper_id}")
async def list_notes(
    paper_id: str,
    page: Optional[int] = None,
    engine: Optional[str] = Query(None, description="按解析引擎过滤"),
    db: Database = Depends(get_db),
):
    """获取论文笔记（可按页、引擎过滤）"""
    where_clauses = ["paper_id = ?"]
    params = [paper_id]

    if page is not None:
        where_clauses.append("page_number = ?")
        params.append(page)
    if engine is not None:
        where_clauses.append("(engine = ? OR engine IS NULL)")
        params.append(engine)

    where_sql = " AND ".join(where_clauses)
    rows = await db.fetch_all(
        f"SELECT * FROM notes WHERE {where_sql} ORDER BY page_number, created_at",
        tuple(params)
    )

    return {
        "items": [
            {
                "id": row["id"],
                "page_number": row["page_number"],
                "paragraph_index": row["paragraph_index"],
                "content": row["content"],
                "cited_text": row["cited_text"],
                "color": row["color"],
                "engine": row["engine"] if "engine" in row.keys() else None,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
    }


@router.post("")
async def create_note(
    data: CreateNoteRequest,
    db: Database = Depends(get_db),
):
    """创建笔记"""
    note_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    await db.insert("notes", {
        "id": note_id,
        "paper_id": data.paper_id,
        "page_number": data.page_number,
        "paragraph_index": data.paragraph_index,
        "content": data.content,
        "cited_text": data.cited_text,
        "color": data.color,
        "engine": data.engine,
        "created_at": now,
        "updated_at": now,
    })

    return {
        "id": note_id,
        "created_at": now,
    }


@router.patch("/{note_id}")
async def update_note(
    note_id: str,
    data: UpdateNoteRequest,
    db: Database = Depends(get_db),
):
    """更新笔记"""
    note = await db.get_by_id("notes", note_id)
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")

    update_data = {}
    if data.content is not None:
        update_data["content"] = data.content
    if data.color is not None:
        update_data["color"] = data.color

    if update_data:
        update_data["updated_at"] = datetime.now().isoformat()
        await db.update("notes", note_id, update_data)

    return {"status": "ok"}


@router.delete("/{note_id}")
async def delete_note(
    note_id: str,
    db: Database = Depends(get_db),
):
    """删除笔记"""
    await db.delete("notes", note_id)
    return {"status": "ok"}


@router.get("/{paper_id}/export")
async def export_notes(
    paper_id: str,
    format: str = Query("markdown", regex="^(markdown|json)$"),
    engine: Optional[str] = Query(None, description="按解析引擎过滤"),
    db: Database = Depends(get_db),
):
    """导出笔记"""
    where_clauses = ["paper_id = ?"]
    params = [paper_id]
    if engine is not None:
        where_clauses.append("(engine = ? OR engine IS NULL)")
        params.append(engine)
    where_sql = " AND ".join(where_clauses)

    rows = await db.fetch_all(
        f"SELECT * FROM notes WHERE {where_sql} ORDER BY page_number, created_at",
        tuple(params)
    )

    if format == "json":
        return {
            "paper_id": paper_id,
            "notes": [dict(row) for row in rows],
        }
    else:  # markdown
        lines = [f"# 论文笔记\n\n"]
        current_page = None

        for row in rows:
            if row["page_number"] != current_page:
                current_page = row["page_number"]
                lines.append(f"\n## 第 {current_page} 页\n\n")

            lines.append(f"- {row['content']}\n")
            if row["cited_text"]:
                lines.append(f"  > {row['cited_text']}\n")
            lines.append("\n")

        return {"content": "".join(lines)}
