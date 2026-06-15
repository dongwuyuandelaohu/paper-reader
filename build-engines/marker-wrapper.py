#!/usr/bin/env python3
"""
Marker 引擎包装器
用于 PyInstaller 打包成独立可执行文件
"""

import sys
import os

# 防止重复导入
_imported = False

def main():
    """调用 marker 的 CLI 接口"""
    global _imported
    
    if _imported:
        return
    
    _imported = True
    
    # 确保环境变量正确
    if getattr(sys, 'frozen', False):
        # 如果是打包后的可执行文件
        base_path = sys._MEIPASS
        os.environ['MARKER_DATA_DIR'] = os.path.join(base_path, 'marker', 'data')
        # 设置环境变量避免某些模块重复加载
        os.environ['PYINSTALLER_FROZEN'] = '1'
    
    try:
        # 直接调用 marker 的 CLI
        from marker.scripts.convert_single import main as marker_main
        sys.argv[0] = 'marker_single'  # 修改程序名
        marker_main()
    except ImportError as e:
        print(f"错误: 无法导入 marker 模块: {e}", file=sys.stderr)
        print("请确保 marker-pdf 已正确安装", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
