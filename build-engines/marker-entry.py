#!/usr/bin/env python3
"""
Marker 引擎入口点
自动使用单进程模式，避免 PyInstaller + multiprocessing 兼容性问题
"""
import sys
import os
import multiprocessing

# PyInstaller 打包的应用必须使用 spawn 方法
if __name__ == '__main__':
    try:
        multiprocessing.set_start_method('spawn', force=True)
    except Exception:
        pass

def main():
    """主函数"""
    try:
        print("Marker 引擎正在启动（单进程模式）...", file=sys.stderr)
        sys.stderr.flush()
        
        print("正在加载 marker 模块...", file=sys.stderr)
        sys.stderr.flush()
        
        from marker.scripts.convert_single import convert_single_cli
        
        # 自动添加 --disable_multiprocessing 参数
        args = sys.argv[1:]
        if '--disable_multiprocessing' not in args:
            args.append('--disable_multiprocessing')
        
        # 替换 sys.argv
        sys.argv = [sys.argv[0]] + args
        
        print(f"开始转换（参数：{' '.join(args)}）...", file=sys.stderr)
        sys.stderr.flush()
        
        # 调用 marker
        return convert_single_cli()
        
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
