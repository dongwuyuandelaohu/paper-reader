-- PaperLens 数据库初始化脚本 (合并 001 + 002)
-- 包含所有基础表，paper_pages 已含 engine 列

PRAGMA foreign_keys = ON;

-- 1. 论文主表
CREATE TABLE IF NOT EXISTS papers (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    authors         TEXT,
    year            INTEGER,
    venue           TEXT,
    abstract        TEXT,
    abstract_translated TEXT,
    doi             TEXT,
    arxiv_id        TEXT,
    file_path       TEXT NOT NULL,
    file_size       INTEGER,
    total_pages     INTEGER NOT NULL,
    pages_parsed    INTEGER DEFAULT 0,
    pages_translated INTEGER DEFAULT 0,
    parse_status    TEXT DEFAULT 'pending',
    parse_engine    TEXT DEFAULT 'marker',
    parse_error     TEXT,
    reading_page    INTEGER DEFAULT 1,
    reading_scroll  REAL DEFAULT 0,
    is_favorite     INTEGER DEFAULT 0,
    source_url      TEXT,
    language        TEXT DEFAULT 'en',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    last_read_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_papers_favorite ON papers(is_favorite);
CREATE INDEX IF NOT EXISTS idx_papers_last_read ON papers(last_read_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_parse_status ON papers(parse_status);

-- 2. 论文页面内容（含 engine 列，支持多引擎解析）
CREATE TABLE IF NOT EXISTS paper_pages (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    engine          TEXT DEFAULT 'pymupdf',
    markdown        TEXT,
    text_content    TEXT,
    images          TEXT,
    tables          TEXT,
    headings        TEXT,
    parse_status    TEXT DEFAULT 'pending',
    parse_error     TEXT,
    word_count      INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(paper_id, page_number, engine)
);

CREATE INDEX IF NOT EXISTS idx_pages_paper ON paper_pages(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_pages_engine ON paper_pages(engine);

-- 3. 翻译缓存
CREATE TABLE IF NOT EXISTS translations (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    engine          TEXT DEFAULT 'pymupdf',
    target_language TEXT NOT NULL DEFAULT 'zh',
    content         TEXT NOT NULL,
    model_id        TEXT,
    model_name      TEXT,
    tokens_used     INTEGER DEFAULT 0,
    translate_status TEXT DEFAULT 'completed',
    translate_error TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(paper_id, page_number, engine, target_language)
);

CREATE INDEX IF NOT EXISTS idx_trans_paper ON translations(paper_id, page_number, target_language);
CREATE INDEX IF NOT EXISTS idx_trans_engine ON translations(engine);
CREATE INDEX IF NOT EXISTS idx_trans_language ON translations(target_language);

-- 4. 对话
CREATE TABLE IF NOT EXISTS conversations (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    title           TEXT,
    model_id        TEXT NOT NULL,
    model_name      TEXT,
    system_prompt   TEXT,
    message_count   INTEGER DEFAULT 0,
    tokens_used     INTEGER DEFAULT 0,
    is_archived     INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_paper ON conversations(paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_archived ON conversations(is_archived);

-- 5. 对话消息
CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    citations       TEXT,
    tool_calls      TEXT,
    images          TEXT,
    model_id        TEXT,
    tokens_input    INTEGER DEFAULT 0,
    tokens_output   INTEGER DEFAULT 0,
    duration_ms     INTEGER,
    is_error        INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_role ON messages(role);

-- 6. 阅读笔记
CREATE TABLE IF NOT EXISTS notes (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    paragraph_index INTEGER,
    content         TEXT NOT NULL,
    cited_text      TEXT,
    color           TEXT DEFAULT '#fbbf24',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id, page_number);

-- 7. 文本高亮
CREATE TABLE IF NOT EXISTS highlights (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    paragraph_index INTEGER,
    start_offset    INTEGER,
    end_offset      INTEGER,
    text            TEXT NOT NULL,
    color           TEXT DEFAULT '#fef08a',
    note            TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hl_paper ON highlights(paper_id, page_number);

-- 8. 书签
CREATE TABLE IF NOT EXISTS bookmarks (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    page_number     INTEGER NOT NULL,
    title           TEXT,
    note            TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bm_paper ON bookmarks(paper_id, page_number);

-- 9. AI 模型配置
CREATE TABLE IF NOT EXISTS models (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    api_base_url    TEXT NOT NULL,
    api_key         TEXT NOT NULL,
    model_id        TEXT NOT NULL,
    is_verified     INTEGER DEFAULT 0,
    is_default_translate TEXT,
    is_default_chat TEXT,
    sort_order      INTEGER DEFAULT 0,
    supports_vision INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_models_default ON models(is_default_translate, is_default_chat);

-- 10. 应用设置 (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- 11. 标签
CREATE TABLE IF NOT EXISTS tags (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    color           TEXT DEFAULT '#3b82f6',
    created_at      TEXT NOT NULL
);

-- 12. 论文-标签关联
CREATE TABLE IF NOT EXISTS paper_tags (
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
);

-- 13. 术语表缓存
CREATE TABLE IF NOT EXISTS glossary_entries (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT REFERENCES papers(id) ON DELETE CASCADE,
    term            TEXT NOT NULL,
    phonetic        TEXT,
    translation     TEXT NOT NULL,
    explanation     TEXT,
    source          TEXT DEFAULT 'local',
    lookup_count    INTEGER DEFAULT 1,
    is_pinned       INTEGER DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_glossary_term ON glossary_entries(term);
CREATE INDEX IF NOT EXISTS idx_glossary_paper ON glossary_entries(paper_id);
CREATE INDEX IF NOT EXISTS idx_glossary_pinned ON glossary_entries(is_pinned);

-- 14. 解析任务队列
CREATE TABLE IF NOT EXISTS parse_jobs (
    id              TEXT PRIMARY KEY,
    paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    engine          TEXT NOT NULL DEFAULT 'marker',
    status          TEXT DEFAULT 'pending',
    progress        REAL DEFAULT 0,
    pages_total     INTEGER DEFAULT 0,
    pages_done      INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_paper ON parse_jobs(paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON parse_jobs(status);

-- 15. 数据库版本管理
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL,
    description TEXT
);

-- 插入版本记录
INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (1, datetime('now'), 'Initial schema with all base tables');

INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES (2, datetime('now'), 'Add engine to paper_pages UNIQUE constraint');

-- 插入默认设置
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
    ('target_language', '"zh"', datetime('now')),
    ('translate_style', '"academic"', datetime('now')),
    ('auto_translate', 'true', datetime('now')),
    ('preload_next_page', 'true', datetime('now')),
    ('qa_temperature', '0.3', datetime('now')),
    ('qa_max_tokens', '4096', datetime('now')),
    ('qa_system_prompt', '"你是一个专业的学术论文阅读助手。用户正在阅读论文时会向你提问，你需要基于用户提供的论文内容和引用段落，给出准确、专业、有条理的回答。"', datetime('now')),
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
