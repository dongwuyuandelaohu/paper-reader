# PaperLens 后端 API 设计

## 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| **框架** | Python FastAPI | 异步、高性能、自动文档 |
| **数据库** | SQLite 3 + aiosqlite | 异步 SQLite 驱动 |
| **PDF 解析** | Marker (默认) + PyMuPDF (轻量备选) | 策略模式，引擎作为 Python 模块内嵌，按需安装 |
| **AI 接口** | OpenAI SDK | 统一接口，支持任意 OpenAI 兼容服务 |
| **PDF 渲染** | PDF.js (前端) | 前端渲染，后端不处理 |
| **文件存储** | 本地文件系统 | PDF 存储在 `{userData}/paperlens/papers/` |
| **打包** | PyInstaller | 打包为独立可执行文件 |

---

## 架构概览

```
┌──────────────────────────────────────────────────────┐
│                    Electron App                       │
│                                                       │
│  ┌──────────────┐    ┌─────────────────────────────┐  │
│  │   Frontend   │    │   Backend (单进程 FastAPI)   │  │
│  │  React+Vite  │◄──►│   server.exe :8765           │  │
│  │  (Renderer)  │    │                             │  │
│  └──────────────┘    │  ┌───────────────────────┐  │  │
│                      │  │  engines/ (策略模式)   │  │  │
│                      │  │   ├─ marker_engine.py  │  │  │
│                      │  │   ├─ pymupdf_engine.py │  │  │
│                      │  │   └─ manager.py        │  │  │
│                      │  └───────────────────────┘  │  │
│                      │  ┌───────────────────────┐  │  │
│                      │  │  SQLite data.db        │  │  │
│                      │  └───────────────────────┘  │  │
│                      └─────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**架构要点：**
- 整个后端只有 **一个进程** `server.exe`，监听 `localhost:8765`
- Marker 作为 Python 模块内嵌（`import marker`），不是独立服务
- 解析引擎通过 **策略模式** 切换，共享 `BaseEngine` 接口
- PyMuPDF 作为轻量备选引擎，已打包在安装包中（~15MB）
- Marker 按需安装：用户首次使用时应用内一键安装（需下载 ~1.5GB 模型）

---

## API 端点总览

### 基础信息
- **Base URL**: `http://localhost:8765/api/v1`
- **Content-Type**: `application/json`
- **认证**: 无（本地应用，不需要认证）

---

## 1. 论文管理 `/papers`

### 1.1 获取论文列表

```
GET /papers
```

**Query 参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20 |
| sort | string | 否 | 排序: `created_at` / `last_read_at` / `title` / `reading_progress` |
| order | string | 否 | `asc` / `desc`，默认 `desc` |
| filter | string | 否 | 筛选: `all` / `favorite` / `recent` / `translated` / `translating` / `untranslated` |
| tag_id | string | 否 | 按标签筛选 |
| search | string | 否 | 搜索标题/作者 |

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Attention Is All You Need",
      "authors": ["Vaswani", "Shazeer"],
      "year": 2017,
      "venue": "NeurIPS",
      "total_pages": 15,
      "pages_parsed": 15,
      "pages_translated": 9,
      "parse_status": "parsed",
      "reading_page": 3,
      "is_favorite": false,
      "tags": [{"id": "uuid", "name": "NLP", "color": "#3b82f6"}],
      "created_at": "2026-06-01T10:00:00Z",
      "last_read_at": "2026-06-03T14:30:00Z"
    }
  ],
  "total": 12,
  "page": 1,
  "page_size": 20
}
```

### 1.2 获取论文详情

```
GET /papers/{paper_id}
```

**Response:** 完整的 paper 对象，包含 abstract、file_path 等所有字段。

### 1.3 上传论文（本地文件）

```
POST /papers/upload
Content-Type: multipart/form-data
```

**Form 参数:**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | PDF 文件 |
| title | string | 否 | 手动指定标题（不指定则自动解析） |

**Response:**
```json
{
  "id": "uuid",
  "title": "attention_is_all_you_need.pdf",
  "total_pages": 15,
  "parse_status": "pending",
  "parse_job_id": "uuid"
}
```

**后台行为:** 创建 `parse_job`，异步调用 Marker 解析。

### 1.4 从 URL 导入论文

```
POST /papers/import-url
```

**Request:**
```json
{
  "url": "https://arxiv.org/abs/1706.03762"
}
```

**Response:** 同 1.3

**后台行为:**
1. 识别 URL 类型（arXiv / DOI / 直链 PDF）
2. 下载 PDF 到本地
3. 如果是 arXiv，自动获取元数据（标题/作者/摘要）
4. 创建 parse_job，异步解析

### 1.5 更新论文

```
PATCH /papers/{paper_id}
```

**Request:** (部分更新)
```json
{
  "title": "新标题",
  "is_favorite": true
}
```

### 1.6 删除论文

```
DELETE /papers/{paper_id}
```

**行为:** 级联删除所有关联数据（pages, translations, conversations, notes 等），删除本地 PDF 文件。

### 1.7 更新阅读位置

```
PUT /papers/{paper_id}/reading-position
```

**Request:**
```json
{
  "page": 5,
  "scroll": 0.42
}
```

---

## 2. PDF 解析 `/parse`

### 2.1 触发解析

```
POST /parse/{paper_id}
```

**Request:**
```json
{
  "engine": "marker",
  "force": false
}
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

### 2.2 查询解析状态

```
GET /parse/{paper_id}/status
```

**Response:**
```json
{
  "job_id": "uuid",
  "status": "running",
  "progress": 0.6,
  "pages_total": 15,
  "pages_done": 9,
  "error_message": null
}
```

### 2.3 获取解析结果（某页）

```
GET /papers/{paper_id}/pages/{page_number}
```

**Response:**
```json
{
  "page_number": 3,
  "markdown": "# 3.1 Self-Attention\n\nThe dominant sequence...",
  "text_content": "3.1 Self-Attention The dominant sequence...",
  "images": [
    {"path": "/papers/uuid/images/fig1.png", "caption": "Figure 1: ...", "width": 800, "height": 600}
  ],
  "tables": [
    {"markdown": "| Model | BLEU |\n|---|---|\n| ...", "caption": "Table 3: ..."}
  ],
  "headings": [
    {"level": 2, "text": "3.1 Self-Attention", "id": "h-3-1"}
  ],
  "parse_status": "parsed",
  "word_count": 450
}
```

### 2.4 重新解析某页

```
POST /papers/{paper_id}/pages/{page_number}/reparse
```

### 2.5 获取论文目录结构

```
GET /papers/{paper_id}/outline
```

**Response:**
```json
{
  "items": [
    {"level": 1, "text": "Abstract", "page": 1, "id": "h-abstract"},
    {"level": 1, "text": "1. Introduction", "page": 1, "id": "h-1"},
    {"level": 1, "text": "3. Model Architecture", "page": 3, "id": "h-3",
     "children": [
       {"level": 2, "text": "3.1 Self-Attention", "page": 3, "id": "h-3-1"},
       {"level": 2, "text": "3.2 Multi-Head Attention", "page": 4, "id": "h-3-2"}
     ]
    }
  ]
}
```

---

## 3. 翻译 `/translate`

### 3.1 翻译单页（流式）

```
POST /translate/{paper_id}/pages/{page_number}
```

**Request:**
```json
{
  "target_language": "zh",
  "model_id": "model-uuid",
  "style": "academic"
}
```

**Response:** SSE (Server-Sent Events) 流式返回

```
event: chunk
data: {"content": "主流的序列转导模型", "paragraph_index": 0}

event: chunk
data: {"content": "基于复杂的循环或卷积神经网络", "paragraph_index": 0}

event: done
data: {"page_number": 3, "tokens_used": 1200, "duration_ms": 3500}

event: error
data: {"error": "API rate limit exceeded", "retry_after": 60}
```

### 3.2 获取已翻译内容

```
GET /papers/{paper_id}/translations/{page_number}?language=zh
```

**Response:**
```json
{
  "page_number": 3,
  "content": "# 3.1 自注意力机制\n\n主流的序列转导模型...",
  "model_name": "GPT-4o",
  "tokens_used": 1200,
  "translated_at": "2026-06-03T14:30:00Z"
}
```

### 3.3 重新翻译某段

```
POST /translate/{paper_id}/pages/{page_number}/paragraphs/{paragraph_index}
```

**Request:**
```json
{
  "target_language": "zh",
  "model_id": "model-uuid"
}
```

**Response:** SSE 流式返回（同 3.1）

### 3.4 翻译全文

```
POST /translate/{paper_id}/all
```

**Request:**
```json
{
  "target_language": "zh",
  "model_id": "model-uuid"
}
```

**Response:**
```json
{
  "task_id": "uuid",
  "pages_total": 15,
  "pages_pending": 6
}
```

### 3.5 查询翻译全文进度

```
GET /translate/{paper_id}/all/status
```

**Response:**
```json
{
  "task_id": "uuid",
  "status": "running",
  "pages_done": 3,
  "pages_total": 6,
  "current_page": 4
}
```

---

## 4. 对话 `/conversations`

### 4.1 获取对话列表

```
GET /papers/{paper_id}/conversations
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Self-attention 和 cross-attention 区别",
      "model_name": "GPT-4o",
      "message_count": 5,
      "tokens_used": 8500,
      "created_at": "2026-06-03T14:30:00Z",
      "updated_at": "2026-06-03T15:00:00Z"
    }
  ]
}
```

### 4.2 创建新对话

```
POST /papers/{paper_id}/conversations
```

**Request:**
```json
{
  "model_id": "model-uuid"
}
```

**Response:**
```json
{
  "id": "uuid",
  "title": null,
  "system_prompt": "你是一个专业的学术论文阅读助手...",
  "model_name": "GPT-4o",
  "created_at": "2026-06-03T16:00:00Z"
}
```

**后台行为:** 自动生成系统提示词（注入论文标题/摘要/内容）。

### 4.3 获取对话消息

```
GET /conversations/{conversation_id}/messages
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "role": "user",
      "content": "这段话中的 transduction 是什么意思？",
      "citations": [{"page": 3, "paragraph": 1, "text": "The dominant..."}],
      "created_at": "2026-06-03T14:30:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "在这段话中，transduction 指的是...",
      "tool_calls": [{"tool": "get_paper_content", "params": {"page": 3}, "result": "..."}],
      "model_id": "model-uuid",
      "tokens_input": 2000,
      "tokens_output": 300,
      "duration_ms": 3500,
      "created_at": "2026-06-03T14:30:05Z"
    }
  ]
}
```

### 4.4 发送消息（流式）

```
POST /conversations/{conversation_id}/messages
```

**Request:**
```json
{
  "content": "这段话中的 transduction 是什么意思？",
  "citations": [{"page": 3, "paragraph": 1, "text": "The dominant..."}],
  "images": [{"path": "/papers/uuid/images/fig1.png"}]
}
```

**Response:** SSE 流式返回

```
event: tool_call
data: {"tool": "search_word", "params": {"word": "transduction"}, "status": "running"}

event: tool_result
data: {"tool": "search_word", "result": {"count": 5, "occurrences": [...]}}

event: chunk
data: {"content": "在这段话中，"}

event: chunk
data: {"content": "transduction（转导）指的是"}

event: done
data: {"message_id": "uuid", "tokens_input": 2000, "tokens_output": 300, "duration_ms": 3500}

event: error
data: {"error": "API connection failed"}
```

### 4.5 停止生成

```
POST /conversations/{conversation_id}/stop
```

### 4.6 删除对话

```
DELETE /conversations/{conversation_id}
```

---

## 5. AI 工具调用（Function Calling）

后端在对话请求中注册以下工具，AI 模型可自动调用：

### 5.1 get_paper_content

```json
{
  "name": "get_paper_content",
  "description": "获取论文指定页面的 Markdown 内容",
  "parameters": {
    "type": "object",
    "properties": {
      "page": {"type": "integer", "description": "页码，不指定则返回全文"}
    }
  }
}
```

### 5.2 search_word

```json
{
  "name": "search_word",
  "description": "在论文中搜索单词或术语，返回所有出现位置",
  "parameters": {
    "type": "object",
    "properties": {
      "word": {"type": "string", "description": "要搜索的单词或术语"}
    },
    "required": ["word"]
  }
}
```

### 5.3 get_paper_summary

```json
{
  "name": "get_paper_summary",
  "description": "获取论文摘要和关键信息",
  "parameters": {
    "type": "object",
    "properties": {}
  }
}
```

### 5.4 get_page_figure

```json
{
  "name": "get_page_figure",
  "description": "获取指定页面的图片列表及其说明",
  "parameters": {
    "type": "object",
    "properties": {
      "page": {"type": "integer", "description": "页码"}
    },
    "required": ["page"]
  }
}
```

---

## 6. 笔记 `/notes`

### 6.1 获取论文笔记

```
GET /papers/{paper_id}/notes
```

**Query:** `page` (可选，按页码筛选)

### 6.2 创建笔记

```
POST /papers/{paper_id}/notes
```

**Request:**
```json
{
  "page_number": 3,
  "paragraph_index": 1,
  "content": "这个 self-attention 的计算复杂度是平方关系",
  "cited_text": "The dominant sequence transduction models...",
  "color": "#fbbf24"
}
```

### 6.3 更新笔记

```
PATCH /notes/{note_id}
```

### 6.4 删除笔记

```
DELETE /notes/{note_id}
```

### 6.5 导出笔记

```
GET /papers/{paper_id}/notes/export?format=markdown
```

**Response:** 文件下载（Markdown 或 PDF）

---

## 7. 高亮 `/highlights`

### 7.1 获取论文高亮

```
GET /papers/{paper_id}/highlights
```

### 7.2 创建高亮

```
POST /papers/{paper_id}/highlights
```

**Request:**
```json
{
  "page_number": 3,
  "paragraph_index": 1,
  "start_offset": 45,
  "end_offset": 120,
  "text": "convolutional neural networks that include an encoder",
  "color": "#fef08a"
}
```

### 7.3 删除高亮

```
DELETE /highlights/{highlight_id}
```

---

## 8. 书签 `/bookmarks`

### 8.1 获取论文书签

```
GET /papers/{paper_id}/bookmarks
```

### 8.2 创建书签

```
POST /papers/{paper_id}/bookmarks
```

**Request:**
```json
{
  "page_number": 5,
  "title": "实验部分开始",
  "note": "重点关注 Table 3 的结果"
}
```

### 8.3 删除书签

```
DELETE /bookmarks/{bookmark_id}
```

---

## 9. 术语速查 `/glossary`

### 9.1 查询术语

```
GET /glossary/lookup?term=transduction&paper_id=uuid
```

**Response:**
```json
{
  "term": "transduction",
  "phonetic": "/trænsˈdʌkʃən/",
  "translation": "转导；转换",
  "explanation": "在 NLP 中，指将一种序列转换为另一种序列的任务",
  "source": "ai",
  "found_in_cache": false
}
```

**后台行为:**
1. 先查本地 glossary_entries 缓存
2. 未命中则调用 AI 生成释义
3. 结果写入缓存

### 9.2 获取论文术语表

```
GET /papers/{paper_id}/glossary
```

### 9.3 收藏/取消收藏术语

```
PATCH /glossary/{entry_id}
```

**Request:** `{"is_pinned": true}`

---

## 10. 模型管理 `/models`

### 10.1 获取模型列表

```
GET /models
```

### 10.2 创建模型

```
POST /models
```

**Request:**
```json
{
  "name": "GPT-4o (主力模型)",
  "api_base_url": "https://api.openai.com/v1",
  "api_key": "sk-xxx",
  "model_id": "gpt-4o"
}
```

### 10.3 测试模型连接

```
POST /models/{model_id}/test
```

**Response:**
```json
{
  "success": true,
  "latency_ms": 450,
  "model_info": "gpt-4o-2024-05-13"
}
```

### 10.4 更新模型

```
PATCH /models/{model_id}
```

### 10.5 删除模型

```
DELETE /models/{model_id}
```

### 10.6 设置默认模型

```
PUT /models/{model_id}/default
```

**Request:**
```json
{
  "type": "translate"
}
```

`type` 可选值: `translate` / `chat`

---

## 11. 设置 `/settings`

### 11.1 获取所有设置

```
GET /settings
```

**Response:**
```json
{
  "target_language": "zh",
  "translate_style": "academic",
  "auto_translate": true,
  "font_size": 16,
  "theme": "dark"
}
```

### 11.2 更新设置

```
PATCH /settings
```

**Request:** (部分更新)
```json
{
  "font_size": 18,
  "theme": "light"
}
```

### 11.3 重置设置

```
POST /settings/reset
```

---

## 12. 标签 `/tags`

### 12.1 获取标签列表

```
GET /tags
```

### 12.2 创建标签

```
POST /tags
```

**Request:** `{"name": "NLP", "color": "#3b82f6"}`

### 12.3 更新标签

```
PATCH /tags/{tag_id}
```

### 12.4 删除标签

```
DELETE /tags/{tag_id}
```

### 12.5 给论文添加/移除标签

```
PUT /papers/{paper_id}/tags
```

**Request:** `{"tag_ids": ["uuid1", "uuid2"]}`

---

## 13. 搜索 `/search`

### 13.1 全文搜索

```
GET /papers/{paper_id}/search?q=attention&scope=all
```

**Query:**
| 参数 | 说明 |
|------|------|
| q | 搜索关键词 |
| scope | `all` / `original` / `translated` |

**Response:**
```json
{
  "query": "attention",
  "total": 23,
  "items": [
    {
      "page_number": 3,
      "scope": "original",
      "context": "...based solely on **attention** mechanisms...",
      "match_start": 45,
      "match_end": 54
    }
  ]
}
```

---

## 14. 数据管理 `/data`

### 14.1 获取存储统计

```
GET /data/stats
```

**Response:**
```json
{
  "translation_cache": {"size_mb": 23.5, "count": 12},
  "conversation_history": {"size_mb": 1.2, "count": 48},
  "pdf_files": {"size_mb": 156, "count": 12},
  "highlights_bookmarks": {"size_mb": 0.1, "count": 28},
  "total_mb": 180.8
}
```

### 14.2 清除缓存

```
POST /data/clear
```

**Request:**
```json
{
  "type": "translations"
}
```

`type`: `translations` / `conversations` / `all`

### 14.3 导出数据

```
GET /data/export
```

**Response:** 文件下载（JSON 格式）

### 14.4 导入数据

```
POST /data/import
Content-Type: multipart/form-data
```

---

## 15. 系统 `/system`

### 15.1 健康检查

```
GET /system/health
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "db_size_mb": 180.8,
  "engines": {
    "marker": {"available": true, "version": "0.3.0"},
    "pymupdf": {"available": true, "version": "1.24.0"}
  },
  "uptime_seconds": 3600
}
```

### 15.2 检查解析引擎状态

```
GET /system/engines
```

**Response:**
```json
{
  "engines": [
    {
      "name": "marker",
      "available": true,
      "version": "0.3.0",
      "description": "高质量 PDF→Markdown，支持表格/公式/图片",
      "install_size_mb": 1500
    },
    {
      "name": "pymupdf",
      "available": true,
      "version": "1.24.0",
      "description": "轻量级文本提取，无需 ML 模型",
      "install_size_mb": 15
    }
  ],
  "default_engine": "marker"
}
```

### 15.3 安装 Marker 引擎

```
POST /system/engines/marker/install
```

**Response:**
```json
{
  "status": "installing",
  "step": "pip_install",
  "progress": 0.3
}
```

### 15.4 查询 Marker 安装进度

```
GET /system/engines/marker/install/status
```

**Response:**
```json
{
  "status": "installing",
  "step": "downloading_models",
  "progress": 0.7,
  "detail": "正在下载 ML 模型 (1.2 GB / 1.5 GB)..."
}
```

`step` 可选值: `pip_install` | `downloading_models` | `completed` | `failed`

---

## 错误响应格式

所有错误统一格式：

```json
{
  "error": {
    "code": "PAPER_NOT_FOUND",
    "message": "论文不存在",
    "details": {}
  }
}
```

**错误码:**
| 错误码 | HTTP 状态 | 说明 |
|--------|----------|------|
| PAPER_NOT_FOUND | 404 | 论文不存在 |
| PAGE_NOT_FOUND | 404 | 页面不存在 |
| PARSE_FAILED | 500 | 解析失败 |
| TRANSLATE_FAILED | 500 | 翻译失败 |
| MODEL_NOT_CONFIGURED | 400 | 未配置 AI 模型 |
| MODEL_CONNECTION_FAILED | 502 | 模型连接失败 |
| ENGINE_UNAVAILABLE | 503 | 解析引擎不可用（所有引擎均不可用） |
| ENGINE_NOT_INSTALLED | 400 | 指定的解析引擎未安装（如 Marker 未安装） |
| RATE_LIMITED | 429 | API 限流 |
| INVALID_REQUEST | 400 | 请求参数错误 |

---

## 解析引擎架构（策略模式）

### 核心设计

Marker 不是独立服务，而是作为 Python 模块内嵌在后端进程中。所有引擎共享统一接口：

```python
# backend/engines/base.py
from abc import ABC, abstractmethod
from pydantic import BaseModel

class ParseResult(BaseModel):
    markdown: str                    # 解析后的 Markdown
    pages: list[dict]                # 按页拆分的内容
    images: list[dict]               # 提取的图片
    success: bool                    # 是否成功
    engine_name: str                 # 使用的引擎名
    fallback: bool = False           # 是否触发了兜底

class BaseEngine(ABC):
    @abstractmethod
    async def parse(self, pdf_path: str) -> ParseResult:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass
```

### Marker 引擎（懒加载，动态 import）

```python
# backend/engines/marker_engine.py
class MarkerEngine(BaseEngine):
    name = "marker"

    def is_available(self) -> bool:
        try:
            import marker  # 动态 import，PyInstaller 不会追踪
            return True
        except ImportError:
            return False

    async def parse(self, pdf_path: str) -> ParseResult:
        from marker.convert import convert_single_pdf
        from marker.models import load_all_models
        models = load_all_models()
        with open(pdf_path, "rb") as f:
            markdown, images, metadata = convert_single_pdf(f.read(), models)
        return ParseResult(
            markdown=markdown, images=images, pages=[],
            success=True, engine_name=self.name
        )
```

### PyMuPDF 引擎（轻量备选，已打包）

```python
# backend/engines/pymupdf_engine.py
class PyMuPDFEngine(BaseEngine):
    name = "pymupdf"

    def is_available(self) -> bool:
        try:
            import fitz
            return True
        except ImportError:
            return False

    async def parse(self, pdf_path: str) -> ParseResult:
        import fitz
        doc = fitz.open(pdf_path)
        pages = []
        for i, page in enumerate(doc):
            text = page.get_text("text")
            pages.append({"page_number": i + 1, "markdown": text, "text_content": text})
        return ParseResult(
            markdown="\n\n".join(p["markdown"] for p in pages),
            pages=pages, images=[], success=True, engine_name=self.name
        )
```

### 引擎管理器

```python
# backend/engines/manager.py
class EngineManager:
    def __init__(self):
        self._engines = {
            "marker": MarkerEngine(),
            "pymupdf": PyMuPDFEngine(),
        }

    def get_engine(self, name: str | None = None) -> BaseEngine:
        if name:
            engine = self._engines.get(name)
            if engine and engine.is_available():
                return engine
            raise EngineNotInstalledError(f"引擎 {name} 不可用")
        # 按优先级自动选择
        for engine in self._engines.values():
            if engine.is_available():
                return engine
        raise EngineUnavailableError("没有可用的解析引擎")

    def list_engines(self) -> list[dict]:
        return [
            {"name": e.name, "available": e.is_available()}
            for e in self._engines.values()
        ]
```

### 开发阶段

```bash
# 安装后端依赖（不含 Marker）
cd backend
pip install -r requirements.txt

# 如果需要 Marker 解析能力（可选）：
pip install marker-pdf
# 首次安装会自动下载 ML 模型（约 1.5GB），之后无需再下载

# 启动后端（热重载）
uvicorn main:app --port 8765 --reload
```

**不需要启动任何额外的 Marker 服务。** Marker 作为 Python 模块直接被后端 import 调用。

### 打包 EXE 时

PyInstaller 打包时通过 `--exclude-module` 排除 Marker 和 PyTorch：

```bash
pyinstaller --name server --onefile \
  --exclude-module=torch \
  --exclude-module=marker \
  --exclude-module=transformers \
  main.py
```

Marker 引擎使用动态 `import marker`，PyInstaller 不会自动收集它。用户首次使用时通过应用内安装。

详见 [EXE-EVALUATION.md](../EXE-EVALUATION.md)。
