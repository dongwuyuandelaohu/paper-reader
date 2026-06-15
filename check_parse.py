#!/usr/bin/env python3
import sqlite3
conn = sqlite3.connect('backend/data/data.db')
conn.row_factory = sqlite3.Row

paper_id = 'aa4b9c6f-e8a7-4fb5-85e7-975a07e204bd'

cursor = conn.execute('SELECT title, parse_status, parse_engine, pages_parsed, total_pages FROM papers WHERE id=?', (paper_id,))
paper = cursor.fetchone()
if paper:
    print(f'论文: {paper["title"][:60]}')
    print(f'状态: {paper["parse_status"]} | 引擎: {paper["parse_engine"]} | 进度: {paper["pages_parsed"]}/{paper["total_pages"]}')
    print()

cursor = conn.execute('SELECT engine, COUNT(*) as cnt, SUM(CASE WHEN parse_status="parsed" THEN 1 ELSE 0 END) as ok FROM paper_pages WHERE paper_id=? GROUP BY engine', (paper_id,))
print('各引擎结果:')
for r in cursor:
    print(f'  {r["engine"]}: {r["ok"]}/{r["cnt"]} 页')

print()
cursor = conn.execute('SELECT engine, status, progress, error_message, created_at FROM parse_jobs WHERE paper_id=? ORDER BY created_at DESC LIMIT 5', (paper_id,))
print('解析任务:')
for r in cursor:
    err = f' ERR: {r["error_message"][:60]}' if r["error_message"] else ''
    print(f'  {r["engine"]} - {r["status"]} ({r["progress"]*100:.0f}%){err}')

conn.close()
