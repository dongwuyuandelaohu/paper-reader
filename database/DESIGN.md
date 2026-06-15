# PaperLens 数据库设计

## 技术选型

- **数据库**: SQLite 3（单文件，随应用分发，无需安装）
- **ORM**: 不使用 ORM，直接 SQL（轻量、可控）
- **文件存储**: IndexedDB（前端缓存）+ 本地文件系统（PDF 原文件）
- **数据库文件位置**: `{userData}/paperlens/data.db`（Electron userData 目录）

---

## ER 关系图

```
papers ──1:N──> paper_pages
papers ──1:N──> translations
papers ──1:N──> conversations ──1:N──> messages
papers ──1:N──> notes
papers ──1:N──> highlights
papers ──1:N──> bookmarks
papers ──M:N──> tags (通过 paper_tags)
papers ──1:N──> parse_jobs
papers ──1:N──> glossary_entries

models (独立表)
settings (独立表，key-value)
```

---

## 表结构

### 1. papers — 论文主表

```sql
CREATE TABLE papers (
    id              TEXT PRIMARY KEY,           -- UUID v4
    title           TEXT NOT NULL,              -- 论文标题
    authors         TEXT,                       -- JSON 数组: ["Vaswani", "Shazeer", ...]
    year            INTEGER,                    -- 发表年份
    venue           TEXT,                       -- 发表会议/期刊: "NeurIPS", "NAACL"
    abstract        TEXT,                       -- 论文摘要（原文）
    abstract_translated TEXT,                   -- 论文摘要（翻译后）
    doi             TEXT,                       -- DOI 链接
    arxiv_id        TEXT,                       -- arXiv ID: "1706.03762"
    file_path       TEXT NOT NULL,              -- PDF 文件本地路径
    file_size       INTEGER,                    -- 文件大小 (bytes)
    total_pages     INTEGER NOT NULL,           -- 总页数
    pages_parsed    INTEGER DEFAULT 0,          -- 已解析页数
    pages_translated INTEGER DEFAULT 0,         -- 已翻译页数
    parse_status    TEXT DEFAULT 'pending',     -- pending | parsing | parsed | failed | fallback
    parse_engine    TEXT DEFAULT 'marker',      -- 使用的解析引擎
    parse_error     TEXT,                       -- 解析错误信息
    reading_page    INTEGER DEFAULT 1,          -- 上次阅读页码
    reading_scroll  REAL DEFAULT 0,             -- 上次阅读滚动位置 (0-1)
    is_favorite     INTEGER DEFAULT 0,          -- 是否收藏 (0/1)
    source_url      TEXT,                       -- 来源 URL (arXiv 链接等)
    language        TEXT DEFAULT 'en',          -- 论文原始语言
    created_at      TEXT NOT NULL,              -- ISO 8601
    updated_at      TEXT NOT NULL,              -- ISO 8601
    last_read_at    TEXT                        -- 最后阅读时间
);

CREATE INDEX idx_papers_favorite ON papers(is_favorite);
CREATE INDEX idx_papers_last_read ON papers(last_read_at DESC);
CREATE INDEX idx_papers_created ON papers(created_at DESC);
CREATE INDEX idx_papers_parse_status ON papers(parse_status);
```

### 2. paper_pages — 论文页面内容（解析后）

```sql
CREATE TABLE paper_pages (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,           -- 页码 (从 1 开始)
    markdown        TEXT,                       -- 该页的 Markdown 内容
    text_content    TEXT,                       -- 纯文本（用于搜索）
    images          TEXT,                       -- JSON 数组: [{path, caption, width, height}]
    tables          TEXT,                       -- JSON 数组: [{markdown, caption}]
    headings        TEXT,                       -- JSON 数组: [{level, text, id}]
    parse_status    TEXT DEFAULT 'pending',     -- pending | parsed | failed
    parse_error     TEXT,
    word_count      INTEGER DEFAULT 0,          -- 字数统计
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(paper_id, page_number)
);

CREATE INDEX idx_pages_paper ON paper_pages(paper_id, page_number);
```

### 3. translations — 翻译缓存

```sql
CREATE TABLE translations (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,           -- 页码
    target_language TEXT NOT NULL DEFAULT 'zh',  -- 目标语言代码
    content         TEXT NOT NULL,              -- 翻译后的 Markdown 内容
    model_id        TEXT,                       -- 使用的模型 ID
    model_name      TEXT,                       -- 模型显示名
    tokens_used     INTEGER DEFAULT 0,          -- 消耗的 token 数
    translate_status TEXT DEFAULT 'completed',  -- completed | failed
    translate_error TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(paper_id, page_number, target_language)
);

CREATE INDEX idx_trans_paper ON translations(paper_id, page_number, target_language);
CREATE INDEX idx_trans_language ON translations(target_language);
```

### 4. conversations — 对话

```sql
CREATE TABLE conversations (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    title           TEXT,                       -- 对话标题（自动从第一条消息生成）
    model_id        TEXT NOT NULL,              -- 使用的模型配置 ID
    model_name      TEXT,                       -- 模型显示名
    system_prompt   TEXT,                       -- 系统提示词（生成时的快照）
    message_count   INTEGER DEFAULT 0,          -- 消息数量
    tokens_used     INTEGER DEFAULT 0,          -- 总 token 消耗
    is_archived     INTEGER DEFAULT 0,          -- 是否归档
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_conv_paper ON conversations(paper_id, created_at DESC);
CREATE INDEX idx_conv_archived ON conversations(is_archived);
```

### 5. messages — 对话消息

```sql
CREATE TABLE messages (
    id              TEXT PRIMARY KEY,           -- UUID v4
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,              -- user | assistant | system
    content         TEXT NOT NULL,              -- 消息内容 (Markdown)
    citations       TEXT,                       -- JSON 数组: [{paper_id, page, paragraph, text}]
    tool_calls      TEXT,                       -- JSON 数组: [{tool, params, result}]
    images          TEXT,                       -- JSON 数组: [{path, description}] (用户上传的图片)
    model_id        TEXT,                       -- 实际使用的模型 (assistant 消息)
    tokens_input    INTEGER DEFAULT 0,          -- 输入 token
    tokens_output   INTEGER DEFAULT 0,          -- 输出 token
    duration_ms     INTEGER,                    -- 生成耗时 (ms)
    is_error        INTEGER DEFAULT 0,          -- 是否为错误消息
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_msg_role ON messages(role);
```

### 6. notes — 阅读笔记

```sql
CREATE TABLE notes (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,           -- 关联页码
    paragraph_index INTEGER,                    -- 关联段落索引 (可选)
    content         TEXT NOT NULL,              -- 笔记内容 (支持 Markdown)
    cited_text      TEXT,                       -- 引用的原文
    color           TEXT DEFAULT '#fbbf24',     -- 标记颜色
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_notes_paper ON notes(paper_id, page_number);
```

### 7. highlights — 文本高亮

```sql
CREATE TABLE highlights (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    paragraph_index INTEGER,
    start_offset    INTEGER,                    -- 文本起始偏移
    end_offset      INTEGER,                    -- 文本结束偏移
    text            TEXT NOT NULL,              -- 高亮的文本内容
    color           TEXT DEFAULT '#fef08a',     -- 高亮颜色
    note            TEXT,                       -- 附加备注
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_hl_paper ON highlights(paper_id, page_number);
```

### 8. bookmarks — 书签

```sql
CREATE TABLE bookmarks (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    title           TEXT,                       -- 书签标题
    note            TEXT,                       -- 备注
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_bm_paper ON bookmarks(paper_id, page_number);
```

### 9. models — AI 模型配置

```sql
CREATE TABLE models (
    id              TEXT PRIMARY KEY,           -- UUID v4
    name            TEXT NOT NULL,              -- 显示名称: "GPT-4o (主力模型)"
    api_base_url    TEXT NOT NULL,              -- API 地址: "https://api.openai.com/v1"
    api_key         TEXT NOT NULL,              -- API Key (加密存储)
    model_id        TEXT NOT NULL,              -- 模型 ID: "gpt-4o"
    is_verified     INTEGER DEFAULT 0,          -- 是否已验证连接
    is_default_translate TEXT,                  -- 默认翻译模型 (NULL 或 'translate')
    is_default_chat TEXT,                       -- 默认问答模型 (NULL 或 'chat')
    sort_order      INTEGER DEFAULT 0,          -- 排序
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_models_default ON models(is_default_translate, is_default_chat);
```

### 10. settings — 应用设置 (Key-Value)

```sql
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,              -- JSON 编码的值
    updated_at      TEXT NOT NULL
);

-- 预置设置项
INSERT INTO settings (key, value, updated_at) VALUES
    ('target_language', '"zh"', datetime('now')),
    ('translate_style', '"academic"', datetime('now')),
    ('auto_translate', 'true', datetime('now')),
    ('preload_next_page', 'true', datetime('now')),
    ('qa_temperature', '0.3', datetime('now')),
    ('qa_max_tokens', '4096', datetime('now')),
    ('qa_system_prompt', '"你是一个专业的学术论文阅读助手..."', datetime('now')),
    ('auto_expand_sidebar', 'true', datetime('now')),
    ('font_size', '16', datetime('now')),
    ('line_height', '1.75', datetime('now')),
    ('theme', '"dark"', datetime('now')),
    ('panel_ratio', '"1:1"', datetime('now')),
    ('sync_scroll', 'true', datetime('now')),
    ('pdf_display_mode', '"original"', datetime('now')),
    ('parse_engine', '"marker"', datetime('now')),
    ('parse_service_url', '"http://localhost:8010"', datetime('now')),
    ('vision_model_id', 'null', datetime('now'));
```

### 11. tags — 标签

```sql
CREATE TABLE tags (
    id              TEXT PRIMARY KEY,           -- UUID v4
    name            TEXT NOT NULL UNIQUE,       -- 标签名: "NLP", "CV"
    color           TEXT DEFAULT '#3b82f6',     -- 标签颜色
    created_at      TEXT NOT NULL
);
```

### 12. paper_tags — 论文-标签关联

```sql
CREATE TABLE paper_tags (
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
);
```

### 13. glossary_entries — 术语表缓存

```sql
CREATE TABLE glossary_entries (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT REFERENCES papers(id) ON DELETE CASCADE,  -- NULL 表示全局术语
    term            TEXT NOT NULL,              -- 术语原文
    phonetic        TEXT,                       -- 音标
    translation     TEXT NOT NULL,              -- 翻译
    explanation     TEXT,                       -- 学术语境解释
    source          TEXT DEFAULT 'local',       -- local | ai
    lookup_count    INTEGER DEFAULT 1,          -- 查询次数
    is_pinned       INTEGER DEFAULT 0,          -- 是否收藏
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_glossary_term ON glossary_entries(term);
CREATE INDEX idx_glossary_paper ON glossary_entries(paper_id);
CREATE INDEX idx_glossary_pinned ON glossary_entries(is_pinned);
```

### 14. parse_jobs — 解析任务队列

```sql
CREATE TABLE parse_jobs (
    id              TEXT PRIMARY KEY,           -- UUID v4
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    engine          TEXT NOT NULL DEFAULT 'marker',
    status          TEXT DEFAULT 'pending',     -- pending | running | completed | failed
    progress        REAL DEFAULT 0,            -- 进度 0-1
    pages_total     INTEGER DEFAULT 0,
    pages_done      INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX idx_jobs_paper ON parse_jobs(paper_id, created_at DESC);
CREATE INDEX idx_jobs_status ON parse_jobs(status);
```

---

## 数据量预估

| 表 | 预估行数 | 单行大小 | 总大小 |
|---|---------|---------|-------|
| papers | 50-200 | ~2 KB | ~400 KB |
| paper_pages | 5,000-30,000 | ~5 KB | ~150 MB |
| translations | 5,000-30,000 | ~5 KB | ~150 MB |
| conversations | 200-1,000 | ~1 KB | ~1 MB |
| messages | 2,000-10,000 | ~2 KB | ~20 MB |
| notes | 500-2,000 | ~1 KB | ~2 MB |
| highlights | 1,000-5,000 | ~0.5 KB | ~2.5 MB |
| glossary_entries | 500-2,000 | ~0.5 KB | ~1 MB |
| **总计** | | | **~330 MB** |

---

## 迁移策略

使用版本号管理数据库迁移：

```sql
CREATE TABLE schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL,
    description TEXT
);
```

迁移文件命名：`migrations/001_initial.sql`, `migrations/002_add_xxx.sql`

应用启动时检查 `schema_version`，自动执行未应用的迁移。

---

## 备份与恢复

- **导出**: 将所有表数据序列化为 JSON，打包为 `.paperlens-backup` 文件
- **导入**: 解析 JSON，清空现有数据后重新插入
- **自动备份**: 每次应用启动时自动备份到 `{userData}/paperlens/backups/`（保留最近 5 个）
