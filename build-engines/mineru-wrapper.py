#!/usr/bin/env python3
"""
MinerU 引擎包装器
用于 PyInstaller 打包成独立可执行文件
"""

import sys
import os

def main():
    """调用 magic_pdf 的 CLI 接口"""
    # 确保环境变量正确
    if getattr(sys, 'frozen', False):
        # 如果是打包后的可执行文件
        base_path = sys._MEIPASS
        os.environ['MAGIC_PDF_DATA_DIR'] = os.path.join(base_path, 'magic_pdf', 'data')
    
    try:
        # 直接调用 magic_pdf 的 CLI
        from magic_pdf.cli import magic_pdf_cli
        sys.argv[0] = 'magic-pdf'  # 修改程序名
        magic_pdf_cli.main()
    except ImportError as e:
        print(f"错误: 无法导入 magic_pdf 模块: {e}", file=sys.stderr)
        print("请确保 mineru 已正确安装", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
