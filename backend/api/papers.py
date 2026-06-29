"""
论文管理 API
上传、列表、详情、删除、阅读位置
"""

import uuid
import re
import shutil
import httpx
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
    abstract: Optional[str] = None
    doi: Optional[str] = None
    arxiv_id: Optional[str] = None
    source_url: Optional[str] = None
    total_pages: int
    pages_parsed: int = 0
    pages_translated: int = 0
    parse_status: str = "pending"
    reading_page: int = 1
    is_favorite: bool = False
    tags: list[dict] = []
    created_at: str
    last_read_at: Optional[str] = None


# ========== 元数据提取 ==========

# 匹配 arxiv ID 的多种格式
_ARXIV_RE = re.compile(r'(?:arxiv[:\s/])?(\d{4}\.\d{4,5}(?:v\d+)?)', re.IGNORECASE)
# 匹配 DOI
_DOI_RE = re.compile(r'10\.\d{4,9}/[^\s"<>]+', re.IGNORECASE)


def extract_metadata_from_pdf(file_path: Path, doc=None) -> dict:
    """从 PDF 元数据中提取标题、作者、年份、DOI、arxiv_id 等。

    返回 dict，仅包含成功提取到的字段（键值可能为 None）。
    """
    import fitz

    meta = {}
    close_doc = False
    if doc is None:
        doc = fitz.open(str(file_path))
        close_doc = True

    try:
        info = doc.metadata or {}

        # 标题：优先 metadata.title，避免空字符串
        title = (info.get("title") or "").strip()
        if title:
            meta["title"] = title

        # 作者：metadata.author 可能是逗号分隔
        author_raw = (info.get("author") or "").strip()
        if author_raw:
            # 拆分成列表再重新用逗号连接存为字符串（保持 DB 中 authors 为 TEXT）
            authors_list = [a.strip() for a in re.split(r'[;,]', author_raw) if a.strip()]
            if authors_list:
                meta["authors"] = ", ".join(authors_list)

        # 关键词中提取年份
        keywords = (info.get("keywords") or "") + " " + (info.get("subject") or "")
        year_match = re.search(r'\b(19|20)\d{2}\b', keywords)
        if year_match:
            meta["year"] = int(year_match.group(0))

        # 从首页文本提取 DOI 和 arxiv ID
        try:
            first_page_text = doc[0].get_text("text")[:3000] if len(doc) > 0 else ""
        except Exception:
            first_page_text = ""

        if first_page_text:
            doi_match = _DOI_RE.search(first_page_text)
            if doi_match:
                meta["doi"] = doi_match.group(0).rstrip(".,;)")

            arxiv_match = _ARXIV_RE.search(first_page_text)
            if arxiv_match:
                meta["arxiv_id"] = arxiv_match.group(1)

        # 从首页文本提取摘要（Abstract / ABSTRACT 之后的内容）
        if first_page_text:
            abs_match = re.search(
                r'(?:ABSTRACT|Abstract)\s*[:\n]+\s*(.+?)(?:\n\s*\n|Keywords|1\.?\s+Introduction)',
                first_page_text,
                re.DOTALL,
            )
            if abs_match:
                abstract = abs_match.group(1).strip()
                # 截断过长的摘要
                if len(abstract) > 2000:
                    abstract = abstract[:2000] + "..."
                if len(abstract) > 50:  # 太短的不当作摘要
                    meta["abstract"] = abstract

    finally:
        if close_doc:
            doc.close()

    return meta


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
            abstract=row["abstract"] if "abstract" in row.keys() else None,
            doi=row["doi"] if "doi" in row.keys() else None,
            arxiv_id=row["arxiv_id"] if "arxiv_id" in row.keys() else None,
            source_url=row["source_url"] if "source_url" in row.keys() else None,
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
        abstract=row["abstract"] if "abstract" in row.keys() else None,
        doi=row["doi"] if "doi" in row.keys() else None,
        arxiv_id=row["arxiv_id"] if "arxiv_id" in row.keys() else None,
        source_url=row["source_url"] if "source_url" in row.keys() else None,
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
    
    # 读取 PDF 并提取页数 + 元数据
    import fitz
    try:
        doc = fitz.open(str(file_path))
        total_pages = len(doc)
        extracted = extract_metadata_from_pdf(file_path, doc=doc)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法读取 PDF: {str(e)}")
    
    # 标题：优先用户传入 title，其次元数据提取，最后文件名
    final_title = title or extracted.get("title") or file.filename.replace(".pdf", "")
    
    # 创建论文记录（合并元数据）
    now = datetime.now().isoformat()
    record = {
        "id": paper_id,
        "title": final_title,
        "file_path": str(file_path),
        "file_size": file_size,
        "total_pages": total_pages,
        "created_at": now,
        "updated_at": now,
    }
    # 合并提取到的元数据（仅覆盖非空字段）
    for key in ("authors", "year", "venue", "abstract", "doi", "arxiv_id"):
        if key in extracted and extracted[key]:
            record[key] = extracted[key]
    
    await db.insert("papers", record)
    
    # 不自动触发解析，由用户手动选择引擎
    return {
        "id": paper_id,
        "title": final_title,
        "total_pages": total_pages,
        "parse_status": "pending",
        "authors": record.get("authors"),
        "year": record.get("year"),
        "doi": record.get("doi"),
        "arxiv_id": record.get("arxiv_id"),
    }


class UploadUrlRequest(BaseModel):
    url: str
    title: Optional[str] = None


@router.post("/upload-url")
async def upload_paper_from_url(
    data: UploadUrlRequest,
    db: Database = Depends(get_db),
):
    """从 URL 下载论文 PDF"""
    url = data.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL 不能为空")

    # 下载 PDF
    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "PaperLens/1.0"})
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail=f"下载失败: HTTP {resp.status_code}")
            content_type = resp.headers.get("content-type", "")
            if "pdf" not in content_type and not url.lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail="URL 不是有效的 PDF 文件")
            pdf_bytes = resp.content
    except httpx.RequestError as e:
        raise HTTPException(status_code=400, detail=f"下载失败: {str(e)}")

    # 生成论文 ID 并保存
    paper_id = str(uuid.uuid4())
    papers_dir = get_data_dir() / "papers"
    papers_dir.mkdir(parents=True, exist_ok=True)
    file_path = papers_dir / f"{paper_id}.pdf"

    with open(file_path, "wb") as f:
        f.write(pdf_bytes)

    file_size = file_path.stat().st_size

    # 读取 PDF 并提取页数 + 元数据
    import fitz
    try:
        doc = fitz.open(str(file_path))
        total_pages = len(doc)
        extracted = extract_metadata_from_pdf(file_path, doc=doc)
        doc.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法读取 PDF: {str(e)}")

    # 从 URL 提取 arxiv_id（如 arxiv 链接）
    if "arxiv_id" not in extracted:
        arxiv_match = _ARXIV_RE.search(url)
        if arxiv_match:
            extracted["arxiv_id"] = arxiv_match.group(1)

    # 文件名：从 URL 末段或用 ID
    url_filename = url.rstrip("/").split("/")[-1]
    fallback_name = url_filename if url_filename.lower().endswith(".pdf") else f"paper_{paper_id[:8]}"
    final_title = data.title or extracted.get("title") or fallback_name.replace(".pdf", "")

    now = datetime.now().isoformat()
    record = {
        "id": paper_id,
        "title": final_title,
        "file_path": str(file_path),
        "file_size": file_size,
        "total_pages": total_pages,
        "source_url": url,
        "created_at": now,
        "updated_at": now,
    }
    for key in ("authors", "year", "venue", "abstract", "doi", "arxiv_id"):
        if key in extracted and extracted[key]:
            record[key] = extracted[key]

    await db.insert("papers", record)

    return {
        "id": paper_id,
        "title": final_title,
        "total_pages": total_pages,
        "parse_status": "pending",
        "authors": record.get("authors"),
        "year": record.get("year"),
        "doi": record.get("doi"),
        "arxiv_id": record.get("arxiv_id"),
    }


@router.patch("/{paper_id}/metadata")
async def reextract_metadata(
    paper_id: str,
    db: Database = Depends(get_db),
):
    """重新从 PDF 文件提取元数据"""
    paper = await db.get_by_id("papers", paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")

    file_path = Path(paper["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF 文件不存在")

    extracted = extract_metadata_from_pdf(file_path)

    update_data = {}
    for key in ("title", "authors", "year", "venue", "abstract", "doi", "arxiv_id"):
        if key in extracted and extracted[key]:
            update_data[key] = extracted[key]

    if update_data:
        update_data["updated_at"] = datetime.now().isoformat()
        await db.update("papers", paper_id, update_data)

    return {"status": "ok", "updated_fields": list(update_data.keys())}


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
