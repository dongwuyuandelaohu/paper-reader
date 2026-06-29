"""
模型管理 API
添加、删除、测试、设置默认模型
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.db import Database
from services.dependencies import get_db

router = APIRouter()


class CreateModelRequest(BaseModel):
    name: str
    api_base_url: str
    api_key: str
    model_id: str
    supports_vision: Optional[bool] = False


class UpdateModelRequest(BaseModel):
    name: Optional[str] = None
    api_base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_id: Optional[str] = None
    supports_vision: Optional[bool] = None


class SetDefaultRequest(BaseModel):
    type: str  # "translate" or "chat"


class ReorderModelsRequest(BaseModel):
    model_ids: list[str]


@router.get("")
async def list_models(db: Database = Depends(get_db)):
    """获取模型列表"""
    rows = await db.fetch_all(
        "SELECT * FROM models ORDER BY sort_order, created_at"
    )
    
    return {
        "items": [
            {
                "id": row["id"],
                "name": row["name"],
                "api_base_url": row["api_base_url"],
                "model_id": row["model_id"],
                "is_verified": bool(row["is_verified"]),
                "is_default_translate": row["is_default_translate"],
                "is_default_chat": row["is_default_chat"],
                "supports_vision": bool(row["supports_vision"]) if "supports_vision" in row.keys() else False,
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@router.post("")
async def create_model(
    data: CreateModelRequest,
    db: Database = Depends(get_db),
):
    """创建模型"""
    model_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    
    await db.insert("models", {
        "id": model_id,
        "name": data.name,
        "api_base_url": data.api_base_url,
        "api_key": data.api_key,
        "model_id": data.model_id,
        "supports_vision": 1 if data.supports_vision else 0,
        "created_at": now,
        "updated_at": now,
    })
    
    return {
        "id": model_id,
        "name": data.name,
        "created_at": now,
    }


@router.post("/{model_id}/test")
async def test_model(
    model_id: str,
    db: Database = Depends(get_db),
):
    """测试模型连接"""
    model = await db.get_by_id("models", model_id)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    
    try:
        from services.ai import get_ai_service
        ai_service = await get_ai_service(model, db)
        result = await ai_service.test_connection()
        
        if result["success"]:
            await db.update("models", model_id, {"is_verified": 1})
        
        return result
    except Exception as e:
        return {
            "success": False,
            "message": f"测试失败: {str(e)}",
        }


@router.patch("/{model_id}")
async def update_model(
    model_id: str,
    data: UpdateModelRequest,
    db: Database = Depends(get_db),
):
    """更新模型"""
    model = await db.get_by_id("models", model_id)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.api_base_url is not None:
        update_data["api_base_url"] = data.api_base_url
    if data.api_key is not None:
        update_data["api_key"] = data.api_key
    if data.model_id is not None:
        update_data["model_id"] = data.model_id
    if data.supports_vision is not None:
        update_data["supports_vision"] = 1 if data.supports_vision else 0

    if update_data:
        await db.update("models", model_id, update_data)
    
    return {"status": "ok"}


@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    db: Database = Depends(get_db),
):
    """删除模型"""
    await db.delete("models", model_id)
    return {"status": "ok"}


@router.put("/reorder")
async def reorder_models(
    data: ReorderModelsRequest,
    db: Database = Depends(get_db),
):
    """批量调整模型排序"""
    now = datetime.now().isoformat()
    for index, model_id in enumerate(data.model_ids):
        await db.update("models", model_id, {
            "sort_order": index,
            "updated_at": now,
        })
    return {"status": "ok"}


@router.put("/{model_id}/default")
async def set_default_model(
    model_id: str,
    data: SetDefaultRequest,
    db: Database = Depends(get_db),
):
    """设置默认模型"""
    model = await db.get_by_id("models", model_id)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    
    if data.type not in ("translate", "chat"):
        raise HTTPException(status_code=400, detail="type 必须是 translate 或 chat")
    
    # 清除其他模型的默认设置
    field = f"is_default_{data.type}"
    await db.execute(f"UPDATE models SET {field} = NULL")
    
    # 设置当前模型为默认
    await db.update("models", model_id, {field: data.type})
    
    return {"status": "ok"}
