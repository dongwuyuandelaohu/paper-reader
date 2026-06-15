#!/usr/bin/env python3
"""查看后端解析流程和数据存储"""
import sqlite3

conn = sqlite3.connect('backend/data/data.db')
conn.row_factory = sqlite3.Row

print("=" * 60)
print("论文解析状态")
print("=" * 60)

# 1. 查看所有论文
cursor = conn.execute(
    'SELECT id, title, parse_status, parse_engine, pages_parsed, total_pages '
    'FROM papers ORDER BY created_at DESC LIMIT 5'
)
papers = cursor.fetchall()

if not papers:
    print("数据库中没有论文")
else:
    print(f"\n共 {len(papers)} 篇论文:\n")
    for i, p in enumerate(papers, 1):
        print(f"{i}. [{p['id'][:8]}] {p['title'][:50]}")
        print(f"   状态: {p['parse_status']} | 引擎: {p['parse_engine']} | 进度: {p['pages_parsed']}/{p['total_pages']}")
        print()

    # 2. 用第一篇论文展示详细解析结果
    pid = papers[0]['id']
    print("=" * 60)
    print(f"论文详情 (ID: {pid[:8]}...)")
    print("=" * 60)

    # 查看各引擎的解析结果
    cursor = conn.execute(
        'SELECT engine, COUNT(*) as cnt, '
        'SUM(CASE WHEN parse_status="parsed" THEN 1 ELSE 0 END) as parsed '
        'FROM paper_pages WHERE paper_id=? GROUP BY engine',
        (pid,)
    )
    engines = cursor.fetchall()

    if engines:
        print("\n各引擎解析结果:")
        for e in engines:
            print(f"  • {e['engine']}: {e['parsed']}/{e['cnt']} 页已解析")
    else:
        print("\n尚无解析结果")

    # 3. 查看解析任务历史
    cursor = conn.execute(
        'SELECT engine, status, progress, error_message, started_at, completed_at '
        'FROM parse_jobs WHERE paper_id=? ORDER BY created_at DESC LIMIT 5',
        (pid,)
    )
    jobs = cursor.fetchall()

    if jobs:
        print("\n最近解析任务:")
        for j in jobs:
            err = f" | 错误: {j['error_message'][:50]}" if j['error_message'] else ""
            print(f"  • {j['engine']} - {j['status']} ({j['progress']*100:.0f}%){err}")
    else:
        print("\n无解析任务记录")

    # 4. 查看文件存储位置
    print("\n" + "=" * 60)
    print("文件存储位置")
    print("=" * 60)

    import os
    from pathlib import Path

    base_dir = Path("data/images")
    paper_dir = base_dir / pid

    if paper_dir.exists():
        print(f"\n论文目录: {paper_dir}")
        for engine_dir in paper_dir.iterdir():
            if engine_dir.is_dir():
                files = list(engine_dir.rglob("*"))
                file_count = len([f for f in files if f.is_file()])
                print(f"\n  {engine_dir.name}/")
                print(f"    文件数: {file_count}")
                if file_count > 0 and file_count <= 10:
                    for f in files[:10]:
                        if f.is_file():
                            size_kb = f.stat().st_size / 1024
                            print(f"      • {f.relative_to(engine_dir)} ({size_kb:.1f} KB)")
    else:
        print(f"\n论文目录不存在: {paper_dir}")

conn.close()
