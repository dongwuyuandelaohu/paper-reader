"""
标签 API
创建、删除、重命名标签，管理论文-标签关联
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.db import Database
from services.dependencies import get_db

router = APIRouter()


class CreateTagRequest(BaseModel):
    name: str
    color: str = "#5b8ef5"


class UpdateTagRequest(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class AssignTagRequest(BaseModel):
    paper_id: str


@router.get("")
async def list_tags(db: Database = Depends(get_db)):
    """获取所有标签及其论文数量"""
    rows = await db.fetch_all("""
        SELECT t.id, t.name, t.color, t.created_at,
               COUNT(pt.paper_id) as paper_count
        FROM tags t
        LEFT JOIN paper_tags pt ON t.id = pt.tag_id
        GROUP BY t.id
        ORDER BY t.created_at DESC
    """)
    return {"items": rows}


@router.post("")
async def create_tag(
    data: CreateTagRequest,
    db: Database = Depends(get_db),
):
    """创建标签"""
    # 检查名称是否已存在
    existing = await db.fetch_one(
        "SELECT id FROM tags WHERE name = ?", (data.name,)
    )
    if existing:
        raise HTTPException(status_code=400, detail="标签名称已存在")

    tag_id = str(uuid.uuid4())
    now = datetime.now().isoformat()

    await db.insert("tags", {
        "id": tag_id,
        "name": data.name,
        "color": data.color,
        "created_at": now,
    })

    return {"id": tag_id, "name": data.name, "color": data.color}


@router.patch("/{tag_id}")
async def update_tag(
    tag_id: str,
    data: UpdateTagRequest,
    db: Database = Depends(get_db),
):
    """更新标签"""
    tag = await db.get_by_id("tags", tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    update_data = {}
    if data.name is not None:
        # 检查新名称是否冲突
        existing = await db.fetch_one(
            "SELECT id FROM tags WHERE name = ? AND id != ?", (data.name, tag_id)
        )
        if existing:
            raise HTTPException(status_code=400, detail="标签名称已存在")
        update_data["name"] = data.name
    if data.color is not None:
        update_data["color"] = data.color

    if update_data:
        update_data["updated_at"] = datetime.now().isoformat()
        await db.update("tags", tag_id, update_data)

    return {"status": "ok"}


@router.delete("/{tag_id}")
async def delete_tag(
    tag_id: str,
    db: Database = Depends(get_db),
):
    """删除标签"""
    tag = await db.get_by_id("tags", tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    await db.delete("tags", tag_id)
    return {"status": "ok"}


@router.post("/{tag_id}/papers")
async def assign_tag_to_paper(
    tag_id: str,
    data: AssignTagRequest,
    db: Database = Depends(get_db),
):
    """给论文添加标签"""
    tag = await db.get_by_id("tags", tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    paper = await db.get_by_id("papers", data.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")

    # 检查是否已关联
    existing = await db.fetch_one(
        "SELECT paper_id FROM paper_tags WHERE paper_id = ? AND tag_id = ?",
        (data.paper_id, tag_id)
    )
    if existing:
        return {"status": "already_assigned"}

    await db.insert("paper_tags", {
        "paper_id": data.paper_id,
        "tag_id": tag_id,
    })

    return {"status": "ok"}


@router.delete("/{tag_id}/papers/{paper_id}")
async def remove_tag_from_paper(
    tag_id: str,
    paper_id: str,
    db: Database = Depends(get_db),
):
    """移除论文的标签"""
    await db.execute(
        "DELETE FROM paper_tags WHERE paper_id = ? AND tag_id = ?",
        (paper_id, tag_id)
    )
    return {"status": "ok"}


@router.get("/{tag_id}/papers")
async def list_tagged_papers(
    tag_id: str,
    db: Database = Depends(get_db),
):
    """获取标签下的所有论文"""
    tag = await db.get_by_id("tags", tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="标签不存在")

    rows = await db.fetch_all("""
        SELECT p.* FROM papers p
        JOIN paper_tags pt ON p.id = pt.paper_id
        WHERE pt.tag_id = ?
        ORDER BY p.last_read_at DESC, p.created_at DESC
    """, (tag_id,))

    return {"items": rows}
