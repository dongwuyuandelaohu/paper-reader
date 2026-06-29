"""
术语速查 API
查询术语、获取论文术语表
"""

import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from services.db import Database
from services.dependencies import get_db
from services.ai import get_ai_service, GLOSSARY_SYSTEM_PROMPT

router = APIRouter()


class GlossaryLookupResponse(BaseModel):
    term: str
    phonetic: Optional[str] = None
    translation: str
    explanation: Optional[str] = None
    source: str
    found_in_cache: bool


@router.get("/lookup")
async def lookup_term(
    term: str,
    paper_id: Optional[str] = None,
    db: Database = Depends(get_db),
):
    """查询术语"""
    if paper_id:
        row = await db.fetch_one(
            """SELECT * FROM glossary_entries
               WHERE term = ? AND (paper_id = ? OR paper_id IS NULL)
               ORDER BY paper_id DESC NULLS LAST
               LIMIT 1""",
            (term, paper_id)
        )
    else:
        row = await db.fetch_one(
            "SELECT * FROM glossary_entries WHERE term = ? LIMIT 1",
            (term,)
        )
    
    if row:
        await db.execute(
            "UPDATE glossary_entries SET lookup_count = lookup_count + 1 WHERE id = ?",
            (row["id"],)
        )
        
        return GlossaryLookupResponse(
            term=row["term"],
            phonetic=row["phonetic"],
            translation=row["translation"],
            explanation=row["explanation"],
            source=row["source"],
            found_in_cache=True,
        )
    
    # 优先使用设置中的术语模型，否则用默认问答模型，再否则取第一个
    model = None
    try:
        settings_row = await db.fetch_one("SELECT value FROM settings WHERE key = ?", ("glossary_model_id",))
        if settings_row and settings_row["value"]:
            import json as _json
            glossary_model_id = _json.loads(settings_row["value"])
            if glossary_model_id and glossary_model_id != "null":
                model = await db.get_by_id("models", glossary_model_id)
    except Exception:
        pass

    if not model:
        model = await db.fetch_one(
            "SELECT * FROM models WHERE is_default_chat IS NOT NULL LIMIT 1"
        )
    if not model:
        model = await db.fetch_one("SELECT * FROM models LIMIT 1")
    
    if not model:
        return GlossaryLookupResponse(
            term=term,
            phonetic=None,
            translation=f"[{term}]",
            explanation="未配置 AI 模型，无法查询术语释义",
            source="local",
            found_in_cache=False,
        )
    
    try:
        ai_service = await get_ai_service(model, db, thinking_override=False)
        
        messages = [
            {"role": "system", "content": GLOSSARY_SYSTEM_PROMPT},
            {"role": "user", "content": term},
        ]
        
        result = await ai_service.chat(messages, temperature=0.3, max_tokens=256)
        content = result["content"].strip()
        
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        
        try:
            data = json.loads(content)
            phonetic = data.get("phonetic")
            translation = data.get("translation", f"[{term}]")
            explanation = data.get("explanation")
        except json.JSONDecodeError:
            translation = content
            explanation = None
            phonetic = None
        
        entry_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        await db.insert("glossary_entries", {
            "id": entry_id,
            "paper_id": paper_id,
            "term": term,
            "phonetic": phonetic,
            "translation": translation,
            "explanation": explanation,
            "source": "ai",
            "lookup_count": 1,
            "created_at": now,
            "updated_at": now,
        })
        
        return GlossaryLookupResponse(
            term=term,
            phonetic=phonetic,
            translation=translation,
            explanation=explanation,
            source="ai",
            found_in_cache=False,
        )
        
    except Exception as e:
        return GlossaryLookupResponse(
            term=term,
            phonetic=None,
            translation=f"[{term}]",
            explanation=f"查询失败: {str(e)}",
            source="local",
            found_in_cache=False,
        )


@router.get("/{paper_id}")
async def get_paper_glossary(
    paper_id: str,
    db: Database = Depends(get_db),
):
    """获取论文术语表"""
    rows = await db.fetch_all(
        """SELECT * FROM glossary_entries
           WHERE paper_id = ? OR paper_id IS NULL
           ORDER BY is_pinned DESC, lookup_count DESC""",
        (paper_id,)
    )
    
    return {
        "items": [
            {
                "id": row["id"],
                "term": row["term"],
                "phonetic": row["phonetic"],
                "translation": row["translation"],
                "explanation": row["explanation"],
                "lookup_count": row["lookup_count"],
                "is_pinned": bool(row["is_pinned"]),
            }
            for row in rows
        ]
    }


class UpdateGlossaryRequest(BaseModel):
    is_pinned: Optional[bool] = None


@router.patch("/{entry_id}")
async def update_glossary_entry(
    entry_id: str,
    data: UpdateGlossaryRequest,
    db: Database = Depends(get_db),
):
    """更新术语（收藏/取消收藏）"""
    if data.is_pinned is not None:
        await db.update("glossary_entries", entry_id, {
            "is_pinned": 1 if data.is_pinned else 0,
        })
    
    return {"status": "ok"}
