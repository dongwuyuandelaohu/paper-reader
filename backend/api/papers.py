"""
论文管理 API
上传、列表、详情、删除、阅读位置
"""

import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.db import Database
from services.dependencies import get_db
from config.paths import get_data_dir

router = APIRouter()


# ========== 请求/响应模型 ==========

class PaperResponse(BaseModel):
    id: str
    title: str
    authors: Optional[list[str]] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    total_pages: int
    pages_parsed: int = 0
    pages_translated: int = 0
    parse_status: str = "pending"
    reading_page: int = 1
    is_favorite: bool = False
    tags: list[dict] = []
    created_at: str
    last_read_at: Optional[str] = None


class PaperListResponse(BaseModel):
    items: list[PaperResponse]
    total: int
    page: int
    page_size: int


class ReadingPositionUpdate(BaseModel):
    page: int
    scroll: float = 0.0


class PaperUpdate(BaseModel):
    title: Optional[str] = None
    is_favorite: Optional[bool] = None


# ========== API 端点 ==========

@router.get("", response_model=PaperListResponse)
async def list_papers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at", regex="^(created_at|last_read_at|title)$"),
    order: str = Query("desc", regex="^(asc|desc)$"),
    filter: str = Query("all", regex="^(all|favorite|recent|translated|translating|untranslated)$"),
    tag_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Database = Depends(get_db),
):
    """获取论文列表"""
    # 构建 WHERE 条件
    where_clauses = []
    params = []
    
    if filter == "favorite":
        where_clauses.append("is_favorite = 1")
    elif filter == "translated":
        where_clauses.append("pages_translated = total_pages")
    elif filter == "translating":
        where_clauses.append("pages_translated > 0 AND pages_translated < total_pages")
    elif filter == "untranslated":
        where_clauses.append("pages_translated = 0")
    elif filter == "recent":
        where_clauses.append("last_read_at IS NOT NULL")
    
    if tag_id:
        where_clauses.append("id IN (SELECT paper_id FROM paper_tags WHERE tag_id = ?)")
        params.append(tag_id)
    
    if search:
        where_clauses.append("(title LIKE ? OR authors LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    
    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
    
    # 查询总数
    count_result = await db.fetch_one(
        f"SELECT COUNT(*) as count FROM papers WHERE {where_sql}",
        tuple(params)
    )
    total = count_result["count"] if count_result else 0
    
    # 查询列表
    offset = (page - 1) * page_size
    order_sql = f"ORDER BY {sort} {order.upper()}"
    
    rows = await db.fetch_all(
        f"SELECT * FROM papers WHERE {where_sql} {order_sql} LIMIT ? OFFSET ?",
        tuple(params) + (page_size, offset)
    )
    
    # 批量查询所有标签（避免 N+1 查询）
    paper_ids = [row["id"] for row in rows]
    if paper_ids:
        placeholders = ",".join(["?" for _ in paper_ids])
        all_tags = await db.fetch_all(
            f"""SELECT pt.paper_id, t.id, t.name, t.color FROM tags t
               JOIN paper_tags pt ON t.id = pt.tag_id
               WHERE pt.paper_id IN ({placeholders})""",
            tuple(paper_ids)
        )
        
        # 按 paper_id 分组
        tags_by_paper = {}
        for tag in all_tags:
            paper_id = tag["paper_id"]
            if paper_id not in tags_by_paper:
                tags_by_paper[paper_id] = []
            tags_by_paper[paper_id].append({
                "id": tag["id"],
                "name": tag["name"],
                "color": tag["color"]
            })
    else:
        tags_by_paper = {}
    
    # 构建响应
    items = []
    for row in rows:
        tags = tags_by_paper.get(row["id"], [])
        item = PaperResponse(
            id=row["id"],
            title=row["title"],
            authors=row["authors"].split(",") if row["authors"] else None,
            year=row["year"],
            venue=row["venue"],
            total_pages=row["total_pages"],
            pages_parsed=row["pages_parsed"],
            pages_translated=row["pages_translated"],
            parse_status=row["parse_status"],
            reading_page=row["reading_page"],
            is_favorite=bool(row["is_favorite"]),
            tags=tags,
            created_at=row["created_at"],
            last_read_at=row["last_read_at"],
        )
        items.append(item)
    
    return PaperListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(paper_id: str, db: Database = Depends(get_db)):
    """获取论文详情"""
    row = await db.get_by_id("papers", paper_id)
    if not row:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    tags = await db.fetch_all(
        """SELECT t.id, t.name, t.color FROM tags t
           JOIN paper_tags pt ON t.id = pt.tag_id
           WHERE pt.paper_id = ?""",
        (paper_id,)
    )
    
    return PaperResponse(
        id=row["id"],
        title=row["title"],
        authors=row["authors"].split(",") if row["authors"] else None,
        year=row["year"],
        venue=row["venue"],
        total_pages=row["total_pages"],
        pages_parsed=row["pages_parsed"],
        pages_translated=row["pages_translated"],
        parse_status=row["parse_status"],
        reading_page=row["reading_page"],
        is_favorite=bool(row["is_favorite"]),
        tags=tags,
        created_at=row["created_at"],
        last_read_at=row["last_read_at"],
    )


@router.post("/upload")
async def upload_paper(
    file: UploadFile = File(...),
    title: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
    db: Database = Depends(get_db),
):
    """上传论文（本地 PDF 文件）"""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="只支持 PDF 文件")
    
    # 生成论文 ID
    paper_id = str(uuid.uuid4())
    
    # 保存文件
    papers_dir = get_data_dir() / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = papers_dir / f"{paper_id}.pdf"
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # 获取文件信息
    file_size = file_path.stat().st_size
    
    # 获取页数（使用 PyMuPDF）
    total_pages = 0
    try:
        import fitz
        doc = fitz.open(str(file_path))
        total_pages = len(doc)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法读取 PDF: {str(e)}")
    
    # 创建论文记录
    now = datetime.now().isoformat()
    await db.insert("papers", {
        "id": paper_id,
        "title": title or file.filename.replace(".pdf", ""),
        "file_path": str(file_path),
        "file_size": file_size,
        "total_pages": total_pages,
        "created_at": now,
        "updated_at": now,
    })
    
    # 不自动触发解析，由用户手动选择引擎
    return {
        "id": paper_id,
        "title": title or file.filename.replace(".pdf", ""),
        "total_pages": total_pages,
        "parse_status": "pending",
    }


@router.patch("/{paper_id}")
async def update_paper(
    paper_id: str,
    data: PaperUpdate,
    db: Database = Depends(get_db),
):
    """更新论文信息"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    update_data = {}
    if data.title is not None:
        update_data["title"] = data.title
    if data.is_favorite is not None:
        update_data["is_favorite"] = 1 if data.is_favorite else 0
    
    if update_data:
        await db.update("papers", paper_id, update_data)
    
    return {"status": "ok"}


@router.delete("/{paper_id}")
async def delete_paper(paper_id: str, db: Database = Depends(get_db)):
    """删除论文（包括所有相关文件和数据库记录）"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    # 1. 删除 PDF 文件
    file_path = Path(paper["file_path"])
    if file_path.exists():
        file_path.unlink()
    
    # 2. 删除解析结果目录（包含 markdown、图片等）
    images_dir = get_data_dir() / "images" / paper_id
    if images_dir.exists():
        shutil.rmtree(images_dir, ignore_errors=True)
    
    # 3. 删除数据库记录（级联删除会自动删除相关表）
    # - paper_pages
    # - translations  
    # - parse_jobs
    # - conversations (及其 messages)
    # - notes
    # - highlights
    # - bookmarks
    # - paper_tags
    await db.delete("papers", paper_id)
    
    return {"status": "ok"}


@router.put("/{paper_id}/reading-position")
async def update_reading_position(
    paper_id: str,
    data: ReadingPositionUpdate,
    db: Database = Depends(get_db),
):
    """更新阅读位置"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    await db.update("papers", paper_id, {
        "reading_page": data.page,
        "reading_scroll": data.scroll,
        "last_read_at": datetime.now().isoformat(),
    })
    
    return {"status": "ok"}


@router.get("/{paper_id}/file")
async def get_paper_file(
    paper_id: str,
    db: Database = Depends(get_db),
):
    """获取论文 PDF 文件"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    file_path = Path(paper["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF 文件不存在")
    
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=f"{paper['title']}.pdf",
    )
