"""
Marker 解析引擎
优先使用独立打包的引擎，回退到系统安装的 marker_single
"""

import os
import re
import json
import sys
import shutil
import subprocess
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("paperlens.parse")


class MarkerEngine:
    """Marker 解析引擎"""

    name = "marker"

    def __init__(self, output_dir: Optional[str] = None):
        self.output_dir = Path(output_dir) if output_dir else None
        if self.output_dir:
            self.output_dir.mkdir(parents=True, exist_ok=True)

    def _find_marker_executable(self) -> Optional[str]:
        """查找 marker 可执行文件（优先独立打包版本）"""
        # 1. 检查独立打包的引擎（用户目录）
        user_engines_dir = Path.home() / ".paperlens" / "engines"
        isolated_marker = user_engines_dir / "marker-engine"
        if sys.platform == "win32":
            isolated_marker_exe = isolated_marker / "marker-engine.exe"
        else:
            isolated_marker_exe = isolated_marker / "marker-engine"
        
        if isolated_marker_exe.exists():
            logger.info(f"[MARKER] 使用独立打包的引擎: {isolated_marker_exe}")
            return str(isolated_marker_exe)

        # 2. 检查独立打包的引擎（应用目录）
        app_dir = Path(__file__).parent.parent.parent
        app_marker = app_dir / "engines" / "marker-engine"
        if sys.platform == "win32":
            app_marker_exe = app_marker / "marker-engine.exe"
        else:
            app_marker_exe = app_marker / "marker-engine"
        
        if app_marker_exe.exists():
            logger.info(f"[MARKER] 使用应用目录的引擎: {app_marker_exe}")
            return str(app_marker_exe)

        # 3. 回退到系统安装的 marker_single
        system_marker = shutil.which("marker_single")
        if system_marker:
            logger.info(f"[MARKER] 使用系统安装的引擎: {system_marker}")
            return system_marker

        return None

    def parse_all(self, pdf_path: str, paper_id: str = "") -> list[dict]:
        """解析全部页面"""
        if not self.output_dir:
            raise ValueError("Marker 引擎需要指定输出目录")

        marker_cmd = self._find_marker_executable()
        if not marker_cmd:
            raise RuntimeError("Marker 未安装。请在应用内下载引擎，或执行: pip install marker-pdf")

        temp_output = self.output_dir / "marker_temp"
        if temp_output.exists():
            shutil.rmtree(temp_output)
        temp_output.mkdir(parents=True)

        try:
            # 构建命令
            cmd = [
                marker_cmd,
                pdf_path,
                "--output_dir", str(temp_output),
                "--output_format", "markdown",
                "--paginate_output",
            ]
            
            # 如果是独立打包的引擎，自动添加单进程参数
            if "marker-engine" in marker_cmd and "--disable_multiprocessing" not in cmd:
                cmd.append("--disable_multiprocessing")

            logger.info(f"[MARKER] Command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)

            if result.returncode != 0:
                logger.error(f"[MARKER] Failed: {result.stderr}")
                raise RuntimeError(f"Marker 执行失败: {result.stderr}")

            logger.info(f"[MARKER] STDOUT: {result.stdout[:500]}")

            # 查找输出目录
            paper_stem = Path(pdf_path).stem
            paper_output = temp_output / paper_stem
            if not paper_output.exists():
                raise RuntimeError(f"Marker 输出目录不存在: {paper_output}")

            # 查找 markdown 文件
            md_files = list(paper_output.glob("*.md"))
            if not md_files:
                raise RuntimeError(f"Markdown 文件不存在于: {paper_output}")

            md_file = md_files[0]
            markdown_content = md_file.read_text(encoding="utf-8")
            logger.info(f"[MARKER] Read {len(markdown_content)} chars from {md_file}")

            # 查找 meta.json
            meta_file = paper_output / f"{paper_stem}_meta.json"
            meta_data = None
            if meta_file.exists():
                with open(meta_file, 'r', encoding='utf-8') as f:
                    meta_data = json.load(f)

            # 复制图片
            images_dir = self.output_dir / "images"
            images_dir.mkdir(parents=True, exist_ok=True)
            for img_file in paper_output.glob("*.*"):
                if img_file.suffix.lower() in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
                    shutil.copy2(img_file, images_dir / img_file.name)

            # 按页拆分
            pages = self._split_by_pages(markdown_content, paper_id, meta_data)
            pages = self._fill_missing_pages_with_pymupdf(pages, pdf_path, paper_id)
            return self._build_result(pages, paper_id)

        finally:
            if temp_output.exists():
                shutil.rmtree(temp_output)

    def _split_by_pages(self, markdown: str, paper_id: str, meta_data: Optional[dict] = None) -> dict:
        """按页码拆分 Markdown"""
        page_pattern = r'<span id="page-(\d+)-(\d+)"></span>'
        splits = re.split(page_pattern, markdown)

        raw_blocks = {}
        current_page = 0

        for i, part in enumerate(splits):
            if i % 3 == 1:
                current_page = int(part)
                if current_page not in raw_blocks:
                    raw_blocks[current_page] = []
            elif i % 3 == 0 and part.strip():
                if current_page not in raw_blocks:
                    raw_blocks[current_page] = []
                raw_blocks[current_page].append(part)

        return raw_blocks

    def _fill_missing_pages_with_pymupdf(self, pages: dict, pdf_path: str, paper_id: str) -> dict:
        """使用 PyMuPDF 填充 Marker 缺失的页"""
        import fitz

        existing_page_nums = set(pages.keys())
        doc = fitz.open(pdf_path)
        total_pages = len(doc)

        missing_pages = [i for i in range(total_pages) if i not in existing_page_nums]

        if not missing_pages:
            doc.close()
            return pages

        from engines.pymupdf_engine import PyMuPDFEngine
        pymupdf_engine = PyMuPDFEngine(output_dir=str(self.output_dir / "images"))

        for page_idx in missing_pages:
            try:
                result = pymupdf_engine.parse_page(pdf_path, page_idx + 1, paper_id)
                pages[page_idx] = [result["markdown"]]
            except Exception as e:
                logger.warning(f"[MARKER] PyMuPDF fallback page {page_idx + 1} failed: {e}")
                pages[page_idx] = []

        doc.close()
        return pages

    def _build_result(self, pages: dict, paper_id: str) -> list[dict]:
        """构建解析结果"""
        result = []

        for page_num in sorted(pages.keys()):
            content = "".join(pages[page_num]).strip()
            content = self._replace_image_paths(content, paper_id)

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

    def _replace_image_paths(self, markdown: str, paper_id: str) -> str:
        """将相对路径图片替换为 API URL"""
        def replace_img(match):
            alt_text = match.group(1)
            img_path = match.group(2)
            if img_path.startswith(('http://', 'https://', '/api/', 'data:')):
                return match.group(0)
            img_filename = Path(img_path).name
            new_url = f"/api/v1/parse/{paper_id}/images/{img_filename}"
            return f"![{alt_text}]({new_url})"

        return re.sub(r'!\[([^\]]*)\]\(([^\)]+)\)', replace_img, markdown)

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
