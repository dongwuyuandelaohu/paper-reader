"""
高亮 API
创建、更新、删除高亮（按解析引擎区分）
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from services.db import Database
from services.dependencies import get_db

router = APIRouter()


class CreateHighlightRequest(BaseModel):
    paper_id: str
    page_number: int
    paragraph_index: Optional[int] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    text: str
    color: str = "#fef08a"
    note: Optional[str] = None
    engine: Optional[str] = None


class UpdateHighlightRequest(BaseModel):
    color: Optional[str] = None
    note: Optional[str] = None


@router.get("/{paper_id}")
async def list_highlights(
    paper_id: str,
    page: Optional[int] = None,
    engine: Optional[str] = Query(None, description="按解析引擎过滤"),
    db: Database = Depends(get_db),
):
    """获取论文高亮（可按页、引擎过滤）"""
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
        f"SELECT * FROM highlights WHERE {where_sql} ORDER BY page_number, created_at",
        tuple(params)
    )

    return {
        "items": [
            {
                "id": row["id"],
                "page_number": row["page_number"],
                "paragraph_index": row["paragraph_index"],
                "start_offset": row["start_offset"],
                "end_offset": row["end_offset"],
                "text": row["text"],
                "color": row["color"],
                "note": row["note"],
                "engine": row["engine"] if "engine" in row.keys() else None,
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@router.post("")
async def create_highlight(
    data: CreateHighlightRequest,
    db: Database = Depends(get_db),
):
    """创建高亮"""
    highlight_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    await db.insert("highlights", {
        "id": highlight_id,
        "paper_id": data.paper_id,
        "page_number": data.page_number,
        "paragraph_index": data.paragraph_index,
        "start_offset": data.start_offset,
        "end_offset": data.end_offset,
        "text": data.text,
        "color": data.color,
        "note": data.note,
        "engine": data.engine,
        "created_at": now,
    })

    return {
        "id": highlight_id,
        "created_at": now,
    }


@router.patch("/{highlight_id}")
async def update_highlight(
    highlight_id: str,
    data: UpdateHighlightRequest,
    db: Database = Depends(get_db),
):
    """更新高亮（颜色/备注）"""
    highlight = await db.get_by_id("highlights", highlight_id)
    if not highlight:
        raise HTTPException(status_code=404, detail="高亮不存在")

    update_data = {}
    if data.color is not None:
        update_data["color"] = data.color
    if data.note is not None:
        update_data["note"] = data.note

    if update_data:
        await db.update("highlights", highlight_id, update_data)

    return {"status": "ok"}


@router.delete("/{highlight_id}")
async def delete_highlight(
    highlight_id: str,
    db: Database = Depends(get_db),
):
    """删除高亮"""
    await db.delete("highlights", highlight_id)
    return {"status": "ok"}
