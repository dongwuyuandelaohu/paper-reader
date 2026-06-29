"""
对话 API
创建对话、发送消息、历史对话、归档、停止生成
"""

import json
import uuid
import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from services.db import Database
from services.dependencies import get_db
from services.ai import get_ai_service, CHAT_SYSTEM_PROMPT_TEMPLATE

router = APIRouter()

# 生成取消标志：conversation_id -> asyncio.Event（set 时表示请求取消）
_cancel_events: dict[str, asyncio.Event] = {}


class CreateConversationRequest(BaseModel):
    paper_id: str
    model_id: str


class SendMessageRequest(BaseModel):
    content: str
    citations: Optional[list[dict]] = None
    images: Optional[list[dict]] = None
    model_id: Optional[str] = None


class ArchiveRequest(BaseModel):
    archived: bool = True


@router.get("/{paper_id}")
async def list_conversations(
    paper_id: str,
    archived: Optional[bool] = None,
    db: Database = Depends(get_db),
):
    """获取论文的对话列表（默认仅未归档）"""
    if archived is True:
        rows = await db.fetch_all(
            """SELECT * FROM conversations
               WHERE paper_id = ? AND is_archived = 1
               ORDER BY updated_at DESC""",
            (paper_id,)
        )
    else:
        rows = await db.fetch_all(
            """SELECT * FROM conversations
               WHERE paper_id = ? AND is_archived = 0
               ORDER BY updated_at DESC""",
            (paper_id,)
        )
    
    return {
        "items": [
            {
                "id": row["id"],
                "title": row["title"],
                "model_name": row["model_name"],
                "message_count": row["message_count"],
                "tokens_used": row["tokens_used"],
                "is_archived": bool(row["is_archived"]) if "is_archived" in row.keys() else False,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
    }


@router.post("")
async def create_conversation(
    data: CreateConversationRequest,
    db: Database = Depends(get_db),
):
    """创建新对话"""
    paper = await db.get_by_id("papers", data.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="论文不存在")
    
    model = await db.get_by_id("models", data.model_id)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    
    system_prompt = CHAT_SYSTEM_PROMPT_TEMPLATE.format(
        title=paper["title"],
        authors=paper.get("authors") or "未知",
        year=paper.get("year") or "未知",
        venue=paper.get("venue") or "未知",
    )
    
    conversation_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    
    await db.insert("conversations", {
        "id": conversation_id,
        "paper_id": data.paper_id,
        "model_id": data.model_id,
        "model_name": model["name"],
        "system_prompt": system_prompt,
        "created_at": now,
        "updated_at": now,
    })
    
    return {
        "id": conversation_id,
        "title": None,
        "system_prompt": system_prompt,
        "model_name": model["name"],
        "created_at": now,
    }


@router.get("/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    db: Database = Depends(get_db),
):
    """获取对话消息"""
    rows = await db.fetch_all(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,)
    )
    
    return {
        "items": [
            {
                "id": row["id"],
                "role": row["role"],
                "content": row["content"],
                "thinking": row["thinking"] if "thinking" in row.keys() else None,
                "citations": json.loads(row["citations"]) if row["citations"] else None,
                "tool_calls": json.loads(row["tool_calls"]) if row["tool_calls"] else None,
                "model_id": row["model_id"],
                "tokens_input": row["tokens_input"],
                "tokens_output": row["tokens_output"],
                "duration_ms": row["duration_ms"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


@router.post("/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    data: SendMessageRequest,
    db: Database = Depends(get_db),
):
    """发送消息（SSE 流式返回）"""
    conversation = await db.get_by_id("conversations", conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="对话不存在")
    
    if data.model_id:
        model = await db.get_by_id("models", data.model_id)
        if not model:
            model = await db.get_by_id("models", conversation["model_id"])
    else:
        model = await db.get_by_id("models", conversation["model_id"])
    if not model:
        raise HTTPException(status_code=400, detail="模型不存在，请重新选择模型")
    
    user_message_id = str(uuid.uuid4())
    now = datetime.now().isoformat()
    
    citations_json = json.dumps(data.citations) if data.citations else None
    
    await db.insert("messages", {
        "id": user_message_id,
        "conversation_id": conversation_id,
        "role": "user",
        "content": data.content,
        "citations": citations_json,
        "created_at": now,
    })
    
    history = await db.fetch_all(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,)
    )
    
    messages = [{"role": "system", "content": conversation["system_prompt"]}]
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    
    ai_service = await get_ai_service(model, db)
    
    # 注册取消事件
    cancel_event = asyncio.Event()
    _cancel_events[conversation_id] = cancel_event
    
    async def generate():
        full_content = ""
        full_thinking = ""
        tokens_input = 0
        tokens_output = 0
        duration_ms = 0
        stopped = False
        
        try:
            async for event in ai_service.chat_stream(messages, temperature=0.7):
                # 检查是否被取消
                if cancel_event.is_set():
                    stopped = True
                    break
                    
                if event["type"] == "thinking":
                    full_thinking += event["content"]
                    yield f"data: {json.dumps({'type': 'thinking', 'content': event['content']})}\n\n"
                elif event["type"] == "content":
                    full_content += event["content"]
                    yield f"data: {json.dumps({'type': 'content', 'content': event['content']})}\n\n"
                elif event["type"] == "done":
                    tokens_input = event["tokens_input"]
                    tokens_output = event["tokens_output"]
                    duration_ms = event["duration_ms"]
                    if event.get("thinking"):
                        full_thinking = event["thinking"]
            
            # 保存助手消息（即使是停止的也保存已生成部分）
            assistant_message_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            await db.insert("messages", {
                "id": assistant_message_id,
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": full_content,
                "model_id": model["id"],
                "tokens_input": tokens_input,
                "tokens_output": tokens_output,
                "duration_ms": duration_ms,
                "thinking": full_thinking if full_thinking else None,
                "created_at": now,
            })
            
            await db.execute(
                """UPDATE conversations 
                   SET message_count = message_count + 2,
                       tokens_used = tokens_used + ?,
                       updated_at = ?
                   WHERE id = ?""",
                (tokens_input + tokens_output, now, conversation_id)
            )
            
            if stopped:
                yield f"data: {json.dumps({'type': 'stopped', 'message_id': assistant_message_id, 'content': full_content, 'thinking': full_thinking})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_message_id, 'tokens_input': tokens_input, 'tokens_output': tokens_output, 'duration_ms': duration_ms, 'thinking': full_thinking})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            # 清理取消事件
            _cancel_events.pop(conversation_id, None)
    
    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/{conversation_id}/stop")
async def stop_generation(conversation_id: str):
    """停止生成（设置取消标志）"""
    event = _cancel_events.get(conversation_id)
    if event:
        event.set()
        return {"status": "ok", "message": "已请求停止生成"}
    return {"status": "ok", "message": "无正在进行的生成"}


@router.patch("/{conversation_id}/archive")
async def archive_conversation(
    conversation_id: str,
    data: ArchiveRequest,
    db: Database = Depends(get_db),
):
    """归档/取消归档对话"""
    conversation = await db.get_by_id("conversations", conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="对话不存在")
    
    await db.update("conversations", conversation_id, {
        "is_archived": 1 if data.archived else 0,
        "updated_at": datetime.now().isoformat(),
    })
    
    return {"status": "ok", "archived": data.archived}


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    db: Database = Depends(get_db),
):
    """删除对话"""
    await db.delete("conversations", conversation_id)
    return {"status": "ok"}
