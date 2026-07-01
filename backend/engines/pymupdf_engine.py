"""
PyMuPDF 解析引擎
将 PDF 转为 Markdown，按页拆分，提取图片
"""

import re
import fitz
from pathlib import Path
from typing import Optional
import base64

from config.paths import get_api_base_url


class PyMuPDFEngine:
    """PyMuPDF 解析引擎"""

    name = "pymupdf"

    def __init__(self, output_dir: Optional[str] = None):
        """初始化引擎
        
        Args:
            output_dir: 图片输出目录，如果为 None 则使用 base64 内嵌
        """
        self.output_dir = Path(output_dir) if output_dir else None
        if self.output_dir:
            self.output_dir.mkdir(parents=True, exist_ok=True)

    def parse_page(self, pdf_path: str, page_number: int, paper_id: str = "") -> dict:
        """解析单页 PDF 为 Markdown"""
        doc = fitz.open(pdf_path)

        if page_number < 1 or page_number > len(doc):
            doc.close()
            raise ValueError(f"页码 {page_number} 超出范围 (1-{len(doc)})")

        page = doc[page_number - 1]
        result = self._parse_page_content(page, page_number, paper_id, doc)
        doc.close()
        return result

    def parse_all(self, pdf_path: str, paper_id: str = "", log_callback=None, register_process=None) -> list[dict]:
        """解析全部页面

        Args:
            log_callback: 可选回调函数（PyMuPDF 原生解析较快，日志较少）
            register_process: 可选回调函数（PyMuPDF 不使用子进程，无需注册）
        """
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        results = []

        for i in range(total_pages):
            page = doc[i]
            result = self._parse_page_content(page, i + 1, paper_id, doc)
            results.append(result)

        doc.close()
        return results

    def _parse_page_content(self, page, page_number: int, paper_id: str, doc) -> dict:
        """解析单页内容"""
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        markdown_parts = []
        headings = []
        images = []
        tables = []
        text_content_parts = []

        for block in blocks:
            if block["type"] == 0:
                text = self._process_text_block(block)
                if text:
                    markdown_parts.append(text)
                    text_content_parts.append(block.get("text", "").strip())

                    heading = self._detect_heading(block)
                    if heading:
                        headings.append(heading)

            elif block["type"] == 1:
                img_info = self._extract_image_from_block(block, page, page_number, paper_id, doc)
                if img_info:
                    images.append(img_info)
                    markdown_parts.append(img_info["markdown"])

        page_images = self._extract_embedded_images(page, page_number, paper_id, doc)
        for img_info in page_images:
            images.append(img_info)
            markdown_parts.append(img_info["markdown"])

        markdown = "\n\n".join(markdown_parts)
        text_content = "\n".join(text_content_parts)
        word_count = len(text_content.split())

        return {
            "page_number": page_number,
            "markdown": markdown,
            "text_content": text_content,
            "images": images,
            "tables": tables,
            "headings": headings,
            "word_count": word_count,
        }

    def _process_text_block(self, block: dict) -> Optional[str]:
        """处理文本块，转换为 Markdown"""
        if "lines" not in block:
            return None

        lines = []
        for line in block["lines"]:
            spans = line.get("spans", [])
            if not spans:
                continue

            line_text = ""
            for span in spans:
                text = span.get("text", "")
                if not text.strip():
                    line_text += text
                    continue

                font = span.get("font", "")
                size = span.get("size", 12)
                flags = span.get("flags", 0)

                is_bold = bool(flags & 2 ** 4) or "Bold" in font or "bold" in font
                is_italic = bool(flags & 2 ** 1) or "Italic" in font or "italic" in font or "Oblique" in font

                if is_bold and is_italic:
                    text = f"***{text}***"
                elif is_bold:
                    text = f"**{text}**"
                elif is_italic:
                    text = f"*{text}*"

                line_text += text

            line_text = line_text.strip()
            if line_text:
                lines.append(line_text)

        if not lines:
            return None

        return "\n".join(lines)

    def _detect_heading(self, block: dict) -> Optional[dict]:
        """检测标题块"""
        if "lines" not in block:
            return None

        for line in block["lines"]:
            spans = line.get("spans", [])
            if not spans:
                continue

            for span in spans:
                size = span.get("size", 12)
                font = span.get("font", "")
                text = span.get("text", "").strip()

                if not text:
                    continue

                is_bold = "Bold" in font or "bold" in font

                if size >= 20:
                    return {"level": 1, "text": text}
                elif size >= 16:
                    return {"level": 2, "text": text}
                elif size >= 14 and is_bold:
                    return {"level": 3, "text": text}

        return None

    def _extract_image_from_block(self, block: dict, page, page_number: int, paper_id: str, doc) -> Optional[dict]:
        """从图片块中提取图片"""
        bbox = block.get("bbox")
        if not bbox:
            return None

        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]

        if width < 50 or height < 50:
            return None

        return self._save_image(page, bbox, page_number, paper_id, width, height)

    def _extract_embedded_images(self, page, page_number: int, paper_id: str, doc) -> list[dict]:
        """提取页面中嵌入的图片"""
        images = []
        image_list = page.get_images(full=True)

        for img_index, img in enumerate(image_list):
            xref = img[0]
            
            try:
                # 获取图片在页面上的位置
                img_rects = page.get_image_rects(xref)
                if not img_rects:
                    continue
                
                # 使用第一个矩形（通常图片只有一个位置）
                bbox = img_rects[0]
                width = bbox[2] - bbox[0]
                height = bbox[3] - bbox[1]
                
                # 跳过太小的图片
                if width < 50 or height < 50:
                    continue

                # 优先使用页面渲染方式提取图片（更可靠）
                img_filename = f"page_{page_number}_img_{img_index}.png"
                
                try:
                    # 使用 get_pixmap 渲染图片区域，这样可以正确处理各种颜色空间和透明度
                    clip = fitz.Rect(bbox)
                    # 使用 2x 缩放以获得更清晰的图片
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip)
                    img_bytes = pix.tobytes("png")
                    img_ext = "png"
                    render_width = pix.width
                    render_height = pix.height
                except Exception as e:
                    print(f"渲染图片失败，尝试直接提取: {e}")
                    # 如果渲染失败，回退到直接提取
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                    
                    img_bytes = base_image["image"]
                    img_ext = base_image["ext"]
                    render_width = base_image["width"]
                    render_height = base_image["height"]
                
                # 验证图片是否有效（检查是否太小或可能是空图片）
                if len(img_bytes) < 100:
                    print(f"图片数据太小，跳过：{img_filename}")
                    continue
                
                # 检查图片是否大部分是黑色（可能是提取失败）
                try:
                    import io
                    from PIL import Image
                    img_check = Image.open(io.BytesIO(img_bytes))
                    # 转换为 RGB 并检查平均亮度
                    img_rgb = img_check.convert('RGB')
                    pixels = list(img_rgb.getdata())
                    if pixels:
                        avg_brightness = sum(sum(p) for p in pixels) / (len(pixels) * 3)
                        # 如果平均亮度低于 20（非常暗），可能是黑色图片
                        if avg_brightness < 20:
                            print(f"图片太暗，可能是提取失败，跳过：{img_filename} (亮度：{avg_brightness:.1f})")
                            continue
                except ImportError:
                    # 如果没有 PIL，跳过亮度检查
                    pass
                except Exception as e:
                    print(f"图片验证失败：{e}")

                if self.output_dir:
                    img_path = self.output_dir / img_filename
                    with open(img_path, "wb") as f:
                        f.write(img_bytes)
                    img_url = f"{get_api_base_url()}/parse/{paper_id}/images/{img_filename}"
                else:
                    import base64
                    img_base64 = base64.b64encode(img_bytes).decode("utf-8")
                    img_url = f"data:image/{img_ext};base64,{img_base64}"

                img_info = {
                    "filename": img_filename,
                    "page": page_number,
                    "width": render_width,
                    "height": render_height,
                    "url": img_url,
                    "markdown": f"![Figure {page_number}-{img_index}]({img_url})",
                }
                images.append(img_info)
            except Exception as e:
                print(f"Failed to extract image {xref}: {e}")
                continue

        return images

    def _save_image(self, page, bbox, page_number: int, paper_id: str, width: float, height: float) -> Optional[dict]:
        """保存图片"""
        img_filename = f"page_{page_number}_figure_{abs(hash(str(bbox))) % 10000}.png"

        try:
            clip = fitz.Rect(bbox)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip)
            img_bytes = pix.tobytes("png")
            
            if self.output_dir:
                img_path = self.output_dir / img_filename
                with open(img_path, "wb") as f:
                    f.write(img_bytes)
                img_url = f"{get_api_base_url()}/parse/{paper_id}/images/{img_filename}"
            else:
                img_base64 = base64.b64encode(img_bytes).decode("utf-8")
                img_url = f"data:image/png;base64,{img_base64}"

            return {
                "filename": img_filename,
                "page": page_number,
                "bbox": list(bbox),
                "width": round(width),
                "height": round(height),
                "url": img_url,
                "markdown": f"![Figure {page_number}]({img_url})",
            }
        except Exception as e:
            print(f"Failed to extract image: {e}")
            return None
