# PaperLens 后端 API 接口文档

## 项目概述

**PaperLens** 是一款论文双语阅读工具，支持 PDF 上传、多引擎解析、AI 翻译、智能问答、笔记管理等功能。

- **后端框架**: FastAPI
- **数据库**: SQLite (aiosqlite)
- **基础路径**: `http://localhost:8765`
- **API 版本**: v1
- **交互式文档**: `http://localhost:8765/docs`

---

## 功能模块

| 模块 | 说明 |
|------|------|
| 论文管理 | 上传、列表、详情、删除、收藏、阅读位置记录 |
| PDF 解析 | 支持 PyMuPDF / Marker / MinerU 三种引擎，后台异步解析 |
| 翻译 | 按页翻译（SSE 流式），翻译缓存 |
| 对话问答 | 基于论文的 AI 对话，SSE 流式返回 |
| 笔记 | 创建、编辑、删除笔记，支持 Markdown/JSON 导出 |
| 标签 | 标签 CRUD，论文-标签关联管理 |
| 术语速查 | 术语查询（缓存 + AI 生成），论文术语表 |
| 模型管理 | AI 模型配置、连接测试、默认模型设置 |
| 设置 | 应用设置的读取、更新、重置 |
| 系统 | 健康检查、解析引擎状态、引擎安装管理 |

---

## 接口列表

### 1. 根路径

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 返回 API 基本信息 |

**响应示例:**
```json
{ "name": "PaperLens API", "version": "0.1.0", "docs": "/docs" }
```

---

### 2. 论文管理 `/api/v1/papers`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/papers` | 获取论文列表（分页、排序、筛选、搜索） |
| GET | `/api/v1/papers/{paper_id}` | 获取论文详情 |
| POST | `/api/v1/papers/upload` | 上传论文 PDF 文件 |
| PATCH | `/api/v1/papers/{paper_id}` | 更新论文信息（标题、收藏状态） |
| DELETE | `/api/v1/papers/{paper_id}` | 删除论文 |
| PUT | `/api/v1/papers/{paper_id}/reading-position` | 更新阅读位置 |
| GET | `/api/v1/papers/{paper_id}/file` | 获取论文 PDF 文件 |

#### GET `/api/v1/papers` - 获取论文列表

**查询参数:**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | int | 否 | 1 | 页码（>=1） |
| page_size | int | 否 | 20 | 每页数量（1~100） |
| sort | string | 否 | created_at | 排序字段：created_at / last_read_at / title |
| order | string | 否 | desc | 排序方向：asc / desc |
| filter | string | 否 | all | 筛选：all / favorite / recent / translated / translating / untranslated |
| tag_id | string | 否 | - | 按标签 ID 筛选 |
| search | string | 否 | - | 按标题或作者搜索 |

**响应模型 `PaperListResponse`:**
```json
{
  "items": [
    {
      "id": "string",
      "title": "string",
      "authors": ["string"],
      "year": 2024,
      "venue": "string",
      "total_pages": 30,
      "pages_parsed": 30,
      "pages_translated": 10,
      "parse_status": "parsed",
      "reading_page": 5,
      "is_favorite": false,
      "tags": [{ "id": "string", "name": "string", "color": "string" }],
      "created_at": "ISO 8601",
      "last_read_at": "ISO 8601"
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 20
}
```

#### POST `/api/v1/papers/upload` - 上传论文

**请求:** `multipart/form-data`

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | 是 | PDF 文件 |
| title | string | 否 | 论文标题（默认使用文件名） |

**响应:**
```json
{
  "id": "uuid",
  "title": "论文标题",
  "total_pages": 30,
  "parse_status": "parsing",
  "parse_job_id": "uuid"
}
```

#### PATCH `/api/v1/papers/{paper_id}` - 更新论文

**请求体:**
```json
{
  "title": "新标题",
  "is_favorite": true
}
```

#### PUT `/api/v1/papers/{paper_id}/reading-position` - 更新阅读位置

**请求体:**
```json
{
  "page": 5,
  "scroll": 0.5
}
```

---

### 3. PDF 解析 `/api/v1/parse`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/parse/{paper_id}/parse` | 触发 PDF 解析（后台异步） |
| GET | `/api/v1/parse/{paper_id}/parse/status` | 查询解析状态 |
| GET | `/api/v1/parse/{paper_id}/pages` | 获取所有解析后的页面内容 |
| GET | `/api/v1/parse/{paper_id}/pages/{page_number}` | 获取单页解析结果 |
| GET | `/api/v1/parse/{paper_id}/images/{filename}` | 获取论文中的图片 |

#### POST `/api/v1/parse/{paper_id}/parse` - 触发解析

**请求体:**
```json
{
  "engine": "pymupdf"  // 可选：pymupdf / marker / mineru，默认 pymupdf
}
```

**响应:**
```json
{
  "status": "started",    // 或 already_parsed
  "job_id": "uuid"
}
```

#### GET `/api/v1/parse/{paper_id}/parse/status` - 查询解析状态

**响应:**
```json
{
  "paper_id": "string",
  "parse_status": "parsing",
  "total_pages": 30,
  "pages_parsed": 15,
  "job": {
    "id": "uuid",
    "status": "running",
    "progress": 0.5,
    "pages_done": 15,
    "pages_total": 30,
    "error_message": null
  },
  "page_statuses": { "1": "parsed", "2": "parsed" }
}
```

#### GET `/api/v1/parse/{paper_id}/pages` - 获取全部解析页面

**响应:**
```json
{
  "paper_id": "string",
  "total_pages": 30,
  "pages": [
    {
      "page_number": 1,
      "markdown": "# Title\n...",
      "text_content": "纯文本内容",
      "headings": [{ "level": 1, "text": "Title" }],
      "images": [{ "filename": "page_1_img_0.png", "bbox": [...] }],
      "parse_status": "parsed",
      "word_count": 500
    }
  ]
}
```

---

### 4. 翻译 `/api/v1/translate`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/translate/{paper_id}/pages/{page_number}` | 翻译单页（SSE 流式） |
| GET | `/api/v1/translate/{paper_id}/translations/{page_number}` | 获取已翻译内容（缓存） |
| POST | `/api/v1/translate/{paper_id}/pages/{page_number}/paragraphs/{paragraph_index}` | 重新翻译某段（未实现） |
| POST | `/api/v1/translate/{paper_id}/all` | 翻译全文（未实现） |
| GET | `/api/v1/translate/{paper_id}/all/status` | 全文翻译进度（未实现） |

#### POST `/api/v1/translate/{paper_id}/pages/{page_number}` - 翻译单页

**请求体:**
```json
{
  "model_id": "uuid"  // 可选，不传则使用默认翻译模型
}
```

**响应:** SSE 流（`text/event-stream`）
```
data: {"type": "content", "content": "翻译内容片段"}
data: {"type": "done", "tokens_input": 1000, "tokens_output": 800}
```

若已有缓存，直接返回 JSON：
```json
{
  "page_number": 1,
  "content": "翻译内容",
  "model_name": "GPT-4",
  "tokens_used": 1800,
  "translated_at": "ISO 8601",
  "cached": true
}
```

#### GET `/api/v1/translate/{paper_id}/translations/{page_number}` - 获取翻译缓存

**查询参数:**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| language | string | 否 | zh | 目标语言 |

---

### 5. 对话问答 `/api/v1/conversations`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/conversations/{paper_id}` | 获取论文的对话列表 |
| POST | `/api/v1/conversations` | 创建新对话 |
| GET | `/api/v1/conversations/{conversation_id}/messages` | 获取对话消息历史 |
| POST | `/api/v1/conversations/{conversation_id}/messages` | 发送消息（SSE 流式） |
| POST | `/api/v1/conversations/{conversation_id}/stop` | 停止生成 |
| DELETE | `/api/v1/conversations/{conversation_id}` | 删除对话 |

#### POST `/api/v1/conversations` - 创建对话

**请求体:**
```json
{
  "paper_id": "uuid",
  "model_id": "uuid"
}
```

#### POST `/api/v1/conversations/{conversation_id}/messages` - 发送消息

**请求体:**
```json
{
  "content": "这篇论文的主要贡献是什么？",
  "citations": [{ "page": 3, "text": "引用文本" }],
  "images": [{ "filename": "page_3_img_0.png" }]
}
```

**响应:** SSE 流（`text/event-stream`）
```
data: {"type": "content", "content": "回复内容片段"}
data: {"type": "done", "message_id": "uuid", "tokens_input": 2000, "tokens_output": 500, "duration_ms": 3000}
```

---

### 6. 笔记 `/api/v1/notes`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/notes/{paper_id}` | 获取论文笔记（可按页筛选） |
| POST | `/api/v1/notes` | 创建笔记 |
| PATCH | `/api/v1/notes/{note_id}` | 更新笔记 |
| DELETE | `/api/v1/notes/{note_id}` | 删除笔记 |
| GET | `/api/v1/notes/{paper_id}/export` | 导出笔记（Markdown/JSON） |

#### GET `/api/v1/notes/{paper_id}` - 获取笔记

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 按页码筛选 |

#### POST `/api/v1/notes` - 创建笔记

**请求体:**
```json
{
  "paper_id": "uuid",
  "page_number": 5,
  "paragraph_index": 2,
  "content": "这里的方法很创新",
  "cited_text": "引用的原文",
  "color": "#fbbf24"
}
```

#### PATCH `/api/v1/notes/{note_id}` - 更新笔记

**请求体:**
```json
{
  "content": "更新后的内容",
  "color": "#34d399"
}
```

#### GET `/api/v1/notes/{paper_id}/export` - 导出笔记

**查询参数:**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| format | string | 否 | markdown | 导出格式：markdown / json |

---

### 7. 标签 `/api/v1/tags`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/tags` | 获取所有标签（含论文数量） |
| POST | `/api/v1/tags` | 创建标签 |
| PATCH | `/api/v1/tags/{tag_id}` | 更新标签（名称/颜色） |
| DELETE | `/api/v1/tags/{tag_id}` | 删除标签 |
| POST | `/api/v1/tags/{tag_id}/papers` | 给论文添加标签 |
| DELETE | `/api/v1/tags/{tag_id}/papers/{paper_id}` | 移除论文的标签 |
| GET | `/api/v1/tags/{tag_id}/papers` | 获取标签下的所有论文 |

#### POST `/api/v1/tags` - 创建标签

**请求体:**
```json
{
  "name": "NLP",
  "color": "#5b8ef5"
}
```

#### PATCH `/api/v1/tags/{tag_id}` - 更新标签

**请求体:**
```json
{
  "name": "新名称",
  "color": "#ff6b6b"
}
```

#### POST `/api/v1/tags/{tag_id}/papers` - 给论文添加标签

**请求体:**
```json
{
  "paper_id": "uuid"
}
```

---

### 8. 术语速查 `/api/v1/glossary`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/glossary/lookup` | 查询术语（缓存优先，否则 AI 生成） |
| GET | `/api/v1/glossary/{paper_id}` | 获取论文术语表 |
| PATCH | `/api/v1/glossary/{entry_id}` | 更新术语（收藏/取消收藏） |

#### GET `/api/v1/glossary/lookup` - 查询术语

**查询参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| term | string | 是 | 要查询的术语 |
| paper_id | string | 否 | 论文 ID（用于关联论文级术语） |

**响应:**
```json
{
  "term": "attention mechanism",
  "phonetic": "/əˈtenʃən ˈmekənɪzəm/",
  "translation": "注意力机制",
  "explanation": "一种让模型动态关注输入不同部分的技术...",
  "source": "ai",
  "found_in_cache": false
}
```

#### GET `/api/v1/glossary/{paper_id}` - 获取论文术语表

**响应:**
```json
{
  "items": [
    {
      "id": "uuid",
      "term": "attention",
      "phonetic": "/əˈtenʃən/",
      "translation": "注意力",
      "explanation": "...",
      "lookup_count": 5,
      "is_pinned": true
    }
  ]
}
```

#### PATCH `/api/v1/glossary/{entry_id}` - 更新术语

**请求体:**
```json
{
  "is_pinned": true
}
```

---

### 9. 模型管理 `/api/v1/models`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/models` | 获取模型列表 |
| POST | `/api/v1/models` | 创建模型 |
| POST | `/api/v1/models/{model_id}/test` | 测试模型连接 |
| PATCH | `/api/v1/models/{model_id}` | 更新模型 |
| DELETE | `/api/v1/models/{model_id}` | 删除模型 |
| PUT | `/api/v1/models/{model_id}/default` | 设置默认模型 |

#### POST `/api/v1/models` - 创建模型

**请求体:**
```json
{
  "name": "GPT-4o",
  "api_base_url": "https://api.openai.com/v1",
  "api_key": "sk-xxx",
  "model_id": "gpt-4o"
}
```

#### PUT `/api/v1/models/{model_id}/default` - 设置默认模型

**请求体:**
```json
{
  "type": "translate"  // translate 或 chat
}
```

#### POST `/api/v1/models/{model_id}/test` - 测试模型连接

**响应:**
```json
{
  "success": true,
  "message": "连接成功",
  "latency_ms": 500
}
```

---

### 10. 设置 `/api/v1/settings`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/settings` | 获取所有设置 |
| PATCH | `/api/v1/settings` | 更新设置 |
| POST | `/api/v1/settings/reset` | 重置为默认设置 |

#### GET `/api/v1/settings` - 获取设置

**响应:**
```json
{
  "target_language": "zh",
  "translate_style": "academic",
  "auto_translate": true,
  "preload_next_page": true,
  "qa_temperature": 0.3,
  "qa_max_tokens": 4096,
  "font_size": 16,
  "line_height": 1.75,
  "theme": "dark",
  "sync_scroll": true,
  "pdf_display_mode": "original",
  "parse_engine": "marker"
}
```

#### PATCH `/api/v1/settings` - 更新设置

**请求体:**
```json
{
  "settings": {
    "theme": "light",
    "font_size": 18
  }
}
```

---

### 11. 系统 `/api/v1/system`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/system/health` | 健康检查 |
| GET | `/api/v1/system/engines` | 列出解析引擎及状态 |
| POST | `/api/v1/system/engines/marker/install` | 安装 Marker 引擎 |
| GET | `/api/v1/system/engines/marker/install/status` | Marker 安装进度 |
| POST | `/api/v1/system/engines/mineru/install` | 安装 MinerU 引擎 |
| GET | `/api/v1/system/engines/mineru/install/status` | MinerU 安装进度 |

#### GET `/api/v1/system/health` - 健康检查

**响应:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "paper_count": 10,
  "engines": {
    "pymupdf": { "available": true, "version": "1.24.0" },
    "marker": { "available": true, "version": "0.18.0" },
    "mineru": { "available": false, "version": null }
  }
}
```

#### GET `/api/v1/system/engines` - 解析引擎列表

**响应:**
```json
{
  "engines": [
    {
      "name": "pymupdf",
      "available": true,
      "version": "1.24.0",
      "description": "轻量级文本提取，无需 ML 模型",
      "install_size_mb": 15,
      "built_in": true
    },
    {
      "name": "marker",
      "available": false,
      "version": null,
      "description": "高质量 PDF→Markdown，支持表格/公式/图片",
      "install_size_mb": 1500,
      "built_in": false
    },
    {
      "name": "mineru",
      "available": false,
      "version": null,
      "description": "MinerU 高质量 PDF 解析，支持复杂版面/公式/表格",
      "install_size_mb": 2000,
      "built_in": false
    }
  ],
  "default_engine": "pymupdf"
}
```

---

## 接口总计

| 模块 | 接口数 |
|------|--------|
| 根路径 | 1 |
| 论文管理 | 7 |
| PDF 解析 | 5 |
| 翻译 | 5 |
| 对话问答 | 6 |
| 笔记 | 5 |
| 标签 | 7 |
| 术语速查 | 3 |
| 模型管理 | 6 |
| 设置 | 3 |
| 系统 | 6 |
| **合计** | **54** |
