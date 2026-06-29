"""
书签 API
创建、更新、删除书签
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.db import Database
from services.dependencies import get_db

router = APIRouter()


class CreateBookmarkRequest(BaseModel):
    paper_id: str
    page_number: int
    title: Optional[str] = None
    note: Optional[str] = None


class UpdateBookmarkRequest(BaseModel):
    title: Optional[str] = None
    note: Optional[str] = None


@router.get("/{paper_id}")
async def list_bookmarks(
    paper_id: str,
    db: Database = Depends(get_db),
):
    """获取论文书签"""
    rows = await db.fetch_all(
        "SELECT * FROM bookmarks WHERE paper_id = ? ORDER BY page_number, created_at",
        (paper_id,)
    )

    return {
        "items": [
            {
                "id": row["id"],
                "page_number": row["page_number"],
                "title": row["title"],
                "note": row["note"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@router.post("")
async def create_bookmark(
    data: CreateBookmarkRequest,
    db: Database = Depends(get_db),
):
    """创建书签"""
    bookmark_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    await db.insert("bookmarks", {
        "id": bookmark_id,
        "paper_id": data.paper_id,
        "page_number": data.page_number,
        "title": data.title,
        "note": data.note,
        "created_at": now,
    })

    return {
        "id": bookmark_id,
        "created_at": now,
    }


@router.patch("/{bookmark_id}")
async def update_bookmark(
    bookmark_id: str,
    data: UpdateBookmarkRequest,
    db: Database = Depends(get_db),
):
    """更新书签"""
    bookmark = await db.get_by_id("bookmarks", bookmark_id)
    if not bookmark:
        raise HTTPException(status_code=404, detail="书签不存在")

    update_data = {}
    if data.title is not None:
        update_data["title"] = data.title
    if data.note is not None:
        update_data["note"] = data.note

    if update_data:
        await db.update("bookmarks", bookmark_id, update_data)

    return {"status": "ok"}


@router.delete("/{bookmark_id}")
async def delete_bookmark(
    bookmark_id: str,
    db: Database = Depends(get_db),
):
    """删除书签"""
    await db.delete("bookmarks", bookmark_id)
    return {"status": "ok"}
