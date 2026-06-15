#!/usr/bin/env python3
"""
Marker 引擎包装器
用于 PyInstaller 打包成独立可执行文件

这个包装器直接调用 marker_single 命令行工具，
避免复杂的 Python 模块导入问题。
"""

import sys
import os
import subprocess
import shutil

def main():
    """调用 marker_single 命令"""
    # 如果是打包后的可执行文件，设置环境
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
        # 添加 marker 数据目录到环境变量
        marker_data = os.path.join(base_path, 'marker', 'data')
        if os.path.exists(marker_data):
            os.environ['MARKER_DATA_DIR'] = marker_data
        
        # 添加打包的 marker 到 PATH
        marker_bin = os.path.join(base_path, 'marker', 'bin')
        if os.path.exists(marker_bin):
            os.environ['PATH'] = marker_bin + os.pathsep + os.environ.get('PATH', '')
    
    # 查找 marker_single 命令
    marker_single = shutil.which('marker_single')
    if not marker_single:
        # 尝试在打包目录中查找
        if getattr(sys, 'frozen', False):
            marker_single = os.path.join(sys._MEIPASS, 'marker', 'bin', 'marker_single')
            if not os.path.exists(marker_single):
                marker_single = None
    
    if not marker_single:
        print("错误: 找不到 marker_single 命令", file=sys.stderr)
        print("请确保 marker-pdf 已正确安装", file=sys.stderr)
        sys.exit(1)
    
    # 构建命令
    cmd = [marker_single] + sys.argv[1:]
    
    try:
        # 执行命令，直接传递 stdin/stdout/stderr
        result = subprocess.run(cmd)
        sys.exit(result.returncode)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
