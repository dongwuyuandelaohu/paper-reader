#!/usr/bin/env python3
"""
Marker 引擎包装器 v4
使用 subprocess 调用系统中的 marker_single 命令，
避免 PyInstaller 打包 marker 模块导致的重复加载问题。
"""

import sys
import os
import subprocess
import shutil

def find_marker_single():
    """查找 marker_single 命令"""
    # 1. 检查 PATH 中是否有 marker_single
    marker_path = shutil.which('marker_single')
    if marker_path:
        return marker_path
    
    # 2. 检查常见的安装位置
    common_paths = [
        os.path.expanduser('~/.local/bin/marker_single'),
        '/usr/local/bin/marker_single',
        '/usr/bin/marker_single',
    ]
    
    for path in common_paths:
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    
    return None

def main():
    """主函数"""
    print("Marker 引擎包装器 v4", file=sys.stderr)
    
    # 查找 marker_single
    marker_path = find_marker_single()
    
    if not marker_path:
        print("错误: 找不到 marker_single 命令", file=sys.stderr)
        print("请确保已安装 marker-pdf: pip install marker-pdf", file=sys.stderr)
        sys.exit(1)
    
    print(f"使用 marker_single: {marker_path}", file=sys.stderr)
    
    # 构建命令
    cmd = [marker_path] + sys.argv[1:]
    
    print(f"执行命令: {' '.join(cmd)}", file=sys.stderr)
    
    try:
        # 使用 subprocess 调用，直接传递 stdin/stdout/stderr
        result = subprocess.run(cmd)
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        print("\n用户中断", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
