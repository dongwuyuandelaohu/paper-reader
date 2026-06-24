"""
MinerU 解析引擎
优先使用独立打包的引擎，回退到系统安装的 mineru
"""

import json
import re
import shutil
import subprocess
import sys
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("paperlens.parse")


class MinerUEngine:
    """MinerU 解析引擎"""

    name = "mineru"

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir) if output_dir else None
        if self.output_dir:
            self.output_dir.mkdir(parents=True, exist_ok=True)

    def _find_mineru_executable(self) -> Optional[str]:
        """查找 mineru 可执行文件（优先独立打包版本）"""
        # 1. 检查独立打包的引擎（用户目录）
        user_engines_dir = Path.home() / ".paperlens" / "engines"
        isolated_mineru = user_engines_dir / "mineru-engine"
        if sys.platform == "win32":
            # Windows: 优先 .exe (PyInstaller)，回退到 .bat (venv wrapper)
            for ext in [".exe", ".bat"]:
                exe = isolated_mineru / f"mineru-engine{ext}"
                if exe.exists():
                    logger.info(f"[MINERU] 使用独立打包的引擎: {exe}")
                    return str(exe)
        else:
            exe = isolated_mineru / "mineru-engine"
            if exe.exists():
                logger.info(f"[MINERU] 使用独立打包的引擎: {exe}")
                return str(exe)

        # 2. 检查独立打包的引擎（应用目录）
        app_dir = Path(__file__).parent.parent.parent
        app_mineru = app_dir / "engines" / "mineru-engine"
        if sys.platform == "win32":
            for ext in [".exe", ".bat"]:
                exe = app_mineru / f"mineru-engine{ext}"
                if exe.exists():
                    logger.info(f"[MINERU] 使用应用目录的引擎: {exe}")
                    return str(exe)
        else:
            exe = app_mineru / "mineru-engine"
            if exe.exists():
                logger.info(f"[MINERU] 使用应用目录的引擎: {exe}")
                return str(exe)

        # 3. 回退到系统安装的 mineru
        system_mineru = shutil.which("mineru")
        if system_mineru:
            logger.info(f"[MINERU] 使用系统安装的引擎: {system_mineru}")
            return system_mineru

        return None

    def parse_all(self, pdf_path: str, paper_id: str = "") -> list[dict]:
        """解析全部页面"""
        if not self.output_dir:
            raise ValueError("MinerU 引擎需要指定输出目录")

        mineru_cmd = self._find_mineru_executable()
        if not mineru_cmd:
            raise RuntimeError(
                "MinerU CLI 未找到。请在应用内下载引擎，或执行: pip install mineru\n"
                "安装后确保 mineru 命令在 PATH 中"
            )

        temp_output = self.output_dir / "mineru_temp"
        if temp_output.exists():
            shutil.rmtree(temp_output)
        temp_output.mkdir(parents=True)

        logger.info(f"[MINERU] Command: {mineru_cmd}")
        logger.info(f"[MINERU] Input: {pdf_path}")
        logger.info(f"[MINERU] Output: {temp_output}")

        try:
            cmd = [
                mineru_cmd,
                "-p", pdf_path,
                "-o", str(temp_output),
                "-m", "auto",
                "-b", "pipeline",
            ]

            logger.info(f"[MINERU] Running: {' '.join(cmd)}")
            # .bat files on Windows need shell=True
            use_shell = mineru_cmd.lower().endswith(".bat")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, shell=use_shell)

            if result.returncode != 0:
                logger.error(f"[MINERU] Failed (code {result.returncode})")
                logger.error(f"[MINERU] STDERR: {result.stderr[:2000]}")
                logger.error(f"[MINERU] STDOUT: {result.stdout[:2000]}")
                raise RuntimeError(f"MinerU 执行失败 (code {result.returncode}): {result.stderr[:2000]}")

            logger.info(f"[MINERU] Success")
            logger.info(f"[MINERU] STDOUT: {result.stdout[:500]}")

            # 查找输出目录
            paper_stem = Path(pdf_path).stem
            paper_output = temp_output / paper_stem

            if not paper_output.exists():
                # 可能在 auto 子目录中
                auto_dir = paper_output / "auto"
                if auto_dir.exists():
                    paper_output = auto_dir
                else:
                    raise RuntimeError(f"MinerU 输出目录不存在: {paper_output}")

            logger.info(f"[MINERU] Output dir: {paper_output}")
            logger.info(f"[MINERU] Files: {list(paper_output.iterdir())}")

            # 查找 content_list.json
            content_list_file = paper_output / f"{paper_stem}_content_list.json"
            if not content_list_file.exists():
                auto_dir = paper_output / "auto"
                if auto_dir.exists():
                    content_list_file = auto_dir / f"{paper_stem}_content_list.json"
                    paper_output = auto_dir

            if not content_list_file.exists():
                raise RuntimeError(f"content_list.json 不存在于: {paper_output}")

            logger.info(f"[MINERU] Reading: {content_list_file}")
            content_list = json.loads(content_list_file.read_text(encoding='utf-8'))
            logger.info(f"[MINERU] Content list: {len(content_list)} blocks")

            # 复制图片
            images_dir = self.output_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            src_images_dir = paper_output / "images"
            if src_images_dir.exists():
                img_count = 0
                for img_file in src_images_dir.glob("*.*"):
                    if img_file.suffix.lower() in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
                        shutil.copy2(img_file, images_dir / img_file.name)
                        img_count += 1
                logger.info(f"[MINERU] Copied {img_count} images")

            # 重建 Markdown
            pages = self._reconstruct_from_content_list(content_list, paper_id)
            logger.info(f"[MINERU] Built {len(pages)} pages")
            return pages

        finally:
            if temp_output.exists():
                shutil.rmtree(temp_output)

    def _reconstruct_from_content_list(self, content_list: list, paper_id: str) -> list[dict]:
        """从 content_list.json 重建分页 Markdown"""
        pages = {}

        for block in content_list:
            page_idx = block.get('page_idx', 0)
            block_type = block.get('type', '')

            if page_idx not in pages:
                pages[page_idx] = []

            if block_type == 'text':
                text = block.get('text', '')
                text_level = block.get('text_level', 0)

                if text.strip():
                    if text_level == 1:
                        pages[page_idx].append(f'# {text}\n')
                    elif text_level == 2:
                        pages[page_idx].append(f'## {text}\n')
                    elif text_level == 3:
                        pages[page_idx].append(f'### {text}\n')
                    else:
                        pages[page_idx].append(f'{text}\n')

            elif block_type == 'chart':
                img_path = block.get('img_path', '')
                caption = block.get('chart_caption', [])

                if img_path:
                    img_filename = Path(img_path).name
                    img_url = f"/api/v1/parse/{paper_id}/images/{img_filename}"
                    pages[page_idx].append(f'<p align="center">')
                    pages[page_idx].append(f'  <img src="{img_url}" alt="figure" width="80%">')
                    pages[page_idx].append(f'</p>')

                if caption:
                    cap_text = caption[0] if isinstance(caption, list) else caption
                    pages[page_idx].append(f'<p align="center"><em>{cap_text}</em></p>\n')

            elif block_type == 'table':
                img_path = block.get('img_path', '')
                caption = block.get('table_caption', [])

                if caption:
                    cap_text = caption[0] if isinstance(caption, list) else caption
                    pages[page_idx].append(f'<p align="center"><em>{cap_text}</em></p>')

                if img_path:
                    img_filename = Path(img_path).name
                    img_url = f"/api/v1/parse/{paper_id}/images/{img_filename}"
                    pages[page_idx].append(f'<p align="center">')
                    pages[page_idx].append(f'  <img src="{img_url}" alt="table" width="80%">')
                    pages[page_idx].append(f'</p>\n')

            elif block_type == 'equation':
                text = block.get('text', '')
                img_path = block.get('img_path', '')

                if img_path:
                    img_filename = Path(img_path).name
                    img_url = f"/api/v1/parse/{paper_id}/images/{img_filename}"
                    pages[page_idx].append(f'<p align="center">')
                    pages[page_idx].append(f'  <img src="{img_url}" alt="equation" width="60%">')
                    pages[page_idx].append(f'</p>')

                if text:
                    if text.startswith('$$') and text.endswith('$$'):
                        pages[page_idx].append(f'{text}\n')
                    else:
                        pages[page_idx].append(f'$$\n{text}\n$$\n')

            elif block_type == 'list':
                sub_type = block.get('sub_type', '')
                list_items = block.get('list_items', [])

                if sub_type == 'ref_text':
                    for item in list_items:
                        pages[page_idx].append(f'{item}\n')
                else:
                    for item in list_items:
                        pages[page_idx].append(f'- {item}\n')

            elif block_type == 'header':
                text = block.get('text', '')
                if text.strip():
                    pages[page_idx].append(f'*{text}*\n')

            elif block_type == 'footnote':
                text = block.get('text', '')
                if text.strip():
                    pages[page_idx].append(f'<sup>{text}</sup>\n')

        # 构建结果
        result = []
        for page_num in sorted(pages.keys()):
            content = "".join(pages[page_num]).strip()
            images = self._extract_images_from_markdown(content, page_num, paper_id)
            headings = self._extract_headings(content)

            result.append({
                "page_number": page_num + 1,
                "markdown": content,
                "text_content": self._markdown_to_text(content),
                "images": images,
                "tables": [],
                "headings": headings,
                "word_count": len(content.split()),
            })

        return result

    def _extract_images_from_markdown(self, markdown: str, page_num: int, paper_id: str) -> list[dict]:
        """从 Markdown 中提取图片引用"""
        matches = re.findall(r'!\[([^\]]*)\]\(([^\)]+)\)', markdown)
        images = []
        for alt_text, img_path in matches:
            img_filename = Path(img_path).name
            images.append({
                "filename": img_filename,
                "page": page_num + 1,
                "alt_text": alt_text,
                "url": f"/api/v1/parse/{paper_id}/images/{img_filename}",
                "markdown": f"![{alt_text}](/api/v1/parse/{paper_id}/images/{img_filename})",
            })
        return images

    def _extract_headings(self, markdown: str) -> list[dict]:
        """从 Markdown 中提取标题"""
        matches = re.findall(r'^(#{1,6})\s+(.+)$', markdown, re.MULTILINE)
        headings = []
        for hashes, text in matches:
            level = len(hashes)
            clean_text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
            clean_text = re.sub(r'<[^>]+>', '', clean_text)
            headings.append({"level": level, "text": clean_text.strip()})
        return headings

    def _markdown_to_text(self, markdown: str) -> str:
        """将 Markdown 转为纯文本"""
        text = markdown
        text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'[图片：\1]', text)
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
        text = re.sub(r'#{1,6}\s+', '', text)
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        text = re.sub(r'`([^`]+)`', r'\1', text)
        text = re.sub(r'\$\$([^$]+)\$\$', r'[公式]', text)
        text = re.sub(r'<[^>]+>', '', text)
        return text.strip()
