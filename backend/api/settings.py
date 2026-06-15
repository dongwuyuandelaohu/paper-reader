"""
设置 API
获取、更新、重置设置
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any

from services.db import Database
from services.dependencies import get_db

router = APIRouter()


class UpdateSettingsRequest(BaseModel):
    settings: dict[str, Any]


@router.get("")
async def get_settings(db: Database = Depends(get_db)):
    """获取所有设置"""
    rows = await db.fetch_all("SELECT key, value FROM settings")
    
    import json
    settings = {}
    for row in rows:
        try:
            settings[row["key"]] = json.loads(row["value"])
        except json.JSONDecodeError:
            settings[row["key"]] = row["value"]
    
    return settings


@router.patch("")
async def update_settings(
    data: UpdateSettingsRequest,
    db: Database = Depends(get_db),
):
    """更新设置"""
    import json
    now = datetime.now().isoformat()
    
    for key, value in data.settings.items():
        # 检查 key 是否存在
        existing = await db.fetch_one(
            "SELECT key FROM settings WHERE key = ?", (key,)
        )
        
        json_value = json.dumps(value)
        
        if existing:
            await db.execute(
                "UPDATE settings SET value = ?, updated_at = ? WHERE key = ?",
                (json_value, now, key)
            )
        else:
            await db.insert("settings", {
                "key": key,
                "value": json_value,
                "updated_at": now,
            })
    
    return {"status": "ok"}


@router.post("/reset")
async def reset_settings(db: Database = Depends(get_db)):
    """重置设置为默认值"""
    # 删除所有设置
    await db.execute("DELETE FROM settings")
    
    # 重新插入默认设置
    now = datetime.now().isoformat()
    defaults = {
        "target_language": '"zh"',
        "translate_style": '"academic"',
        "auto_translate": "true",
        "preload_next_page": "true",
        "qa_temperature": "0.3",
        "qa_max_tokens": "4096",
        "qa_system_prompt": '"你是一个专业的学术论文阅读助手。"',
        "auto_expand_sidebar": "true",
        "font_size": "16",
        "line_height": "1.75",
        "theme": '"dark"',
        "panel_ratio": '"1:1"',
        "sync_scroll": "true",
        "pdf_display_mode": '"original"',
        "parse_engine": '"marker"',
        "parse_service_url": '"http://localhost:8010"',
        "vision_model_id": "null",
    }
    
    for key, value in defaults.items():
        await db.insert("settings", {
            "key": key,
            "value": value,
            "updated_at": now,
        })
    
    return {"status": "ok"}
