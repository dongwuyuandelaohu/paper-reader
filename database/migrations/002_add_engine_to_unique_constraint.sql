-- Migration 002: Update paper_pages UNIQUE constraint to include engine column
-- This allows multiple engines to parse the same paper without conflicts

-- Create new table with updated constraint
CREATE TABLE paper_pages_new (
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

-- Copy data from old table
INSERT INTO paper_pages_new (
    id, paper_id, page_number, engine, markdown, text_content, images, tables,
    headings, parse_status, parse_error, word_count, created_at, updated_at
)
SELECT
    id, paper_id, page_number, COALESCE(engine, 'pymupdf'), markdown, text_content,
    images, tables, headings, parse_status, parse_error, word_count, created_at, updated_at
FROM paper_pages;

-- Drop old table
DROP TABLE paper_pages;

-- Rename new table
ALTER TABLE paper_pages_new RENAME TO paper_pages;

-- Recreate indexes
CREATE INDEX idx_pages_paper ON paper_pages(paper_id, page_number);
CREATE INDEX idx_pages_engine ON paper_pages(engine);

-- Update schema version
UPDATE schema_version SET version = 2, applied_at = datetime('now'), description = 'Add engine to paper_pages UNIQUE constraint' WHERE version = 1;
