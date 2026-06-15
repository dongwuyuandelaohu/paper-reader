#!/usr/bin/env python3
"""
Marker 引擎包装器
用于 PyInstaller 打包成独立可执行文件

这个包装器直接调用 marker 的 CLI 接口，
避免复杂的 Python 模块导入问题。
"""

import sys
import os
import re

def main():
    """调用 marker 的 convert_single_cli"""
    # 如果是打包后的可执行文件，设置环境
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
        # 添加 marker 数据目录到环境变量
        marker_data = os.path.join(base_path, 'marker', 'data')
        if os.path.exists(marker_data):
            os.environ['MARKER_DATA_DIR'] = marker_data
    
    try:
        # 直接导入并调用 marker 的 CLI
        from marker.scripts.convert_single import convert_single_cli
        
        # 修改 argv[0] 以匹配原始命令
        sys.argv[0] = re.sub(r'(-script\.pyw|\.exe)?$', '', sys.argv[0])
        
        # 调用 CLI
        sys.exit(convert_single_cli())
        
    except ImportError as e:
        print(f"错误: 无法导入 marker 模块: {e}", file=sys.stderr)
        print("请确保 marker-pdf 已正确安装", file=sys.stderr)
        sys.exit(1)
    except SystemExit:
        # 正常退出
        raise
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
