#!/usr/bin/env python3
"""
MinerU 引擎入口点
处理三种情况：
1. 直接调用：运行 mineru main 函数
2. 内部调用：运行 -m 指定的模块（如 API 服务）
3. Multiprocessing worker: 直接执行 Python 代码
"""
import sys
import os
import multiprocessing
import runpy
from pathlib import Path

def setup_environment():
    """设置运行环境"""
    # 获取用户主目录
    home = Path.home()
    
    # 设置模型缓存目录（使用用户目录，避免权限问题）
    cache_dir = home / ".cache" / "paperlens" / "huggingface"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    os.environ["HF_HOME"] = str(cache_dir)
    os.environ["TRANSFORMERS_CACHE"] = str(cache_dir)
    os.environ["HF_DATASETS_CACHE"] = str(cache_dir)
    # 默认使用 ModelScope 镜像（国内用户）
    if "MINERU_MODEL_SOURCE" not in os.environ:
        os.environ["MINERU_MODEL_SOURCE"] = "modelscope"
    
    # 设置临时文件目录（确保有足够空间）
    temp_dir = home / ".cache" / "paperlens" / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    os.environ["TMPDIR"] = str(temp_dir)
    os.environ["TEMP"] = str(temp_dir)
    os.environ["TMP"] = str(temp_dir)
    
    print(f"[MinerU] 模型缓存目录: {cache_dir}", file=sys.stderr)
    print(f"[MinerU] 临时文件目录: {temp_dir}", file=sys.stderr)
    sys.stderr.flush()

def is_multiprocessing_worker():
    """检测是否被 multiprocessing 作为 worker 进程启动"""
    # multiprocessing 会传递 --multiprocessing-fork 参数
    if '--multiprocessing-fork' in sys.argv:
        return True
    # 或者检查是否有 -c 参数（直接执行代码）
    if '-c' in sys.argv:
        return True
    return False

def handle_multiprocessing_worker():
    """处理 multiprocessing worker 进程"""
    # 找到 -c 参数并执行其后的代码
    if '-c' in sys.argv:
        c_index = sys.argv.index('-c')
        if c_index + 1 < len(sys.argv):
            code = sys.argv[c_index + 1]
            # 清理 sys.argv，移除 -B -S -I -c 等参数
            sys.argv = [sys.argv[0]] + sys.argv[c_index + 2:]
            
            print(f"[MinerU] Multiprocessing worker 执行代码", file=sys.stderr)
            sys.stderr.flush()
            
            # 使用 exec 执行代码
            exec(code, {'__name__': '__main__'})
            return 0
    return 1

def main():
    """主函数"""
    try:
        print("MinerU 引擎正在启动...", file=sys.stderr)
        sys.stderr.flush()
        
        # 设置运行环境
        setup_environment()
        
        # 检测是否为 multiprocessing worker
        if is_multiprocessing_worker():
            return handle_multiprocessing_worker()
        
        # 检查是否使用 -m 参数运行模块
        if '-m' in sys.argv:
            m_index = sys.argv.index('-m')
            if m_index + 1 < len(sys.argv):
                module_name = sys.argv[m_index + 1]
                # 移除 -m module_name 参数
                new_argv = sys.argv[:m_index] + sys.argv[m_index + 2:]
                sys.argv = new_argv
                
                print(f"[MinerU] 运行模块: {module_name}", file=sys.stderr)
                sys.stderr.flush()
                
                # 使用 runpy 运行模块
                runpy.run_module(module_name, run_name='__main__', alter_sys=True)
                return 0
        
        # 正常情况：导入并调用 main 函数
        from mineru.cli.client import main as mineru_main
        
        print(f"[MinerU] 执行命令: mineru {' '.join(sys.argv[1:])}", file=sys.stderr)
        sys.stderr.flush()
        
        # 直接调用 main 函数
        return mineru_main()
        
    except KeyboardInterrupt:
        print("[MinerU] 用户中断", file=sys.stderr)
        sys.stderr.flush()
        return 130
    except Exception as e:
        print(f"[MinerU] 错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.stderr.flush()
        return 1

# PyInstaller 打包的应用必须使用 spawn 方法
if __name__ == '__main__':
    # 仅在非 worker 进程中设置 spawn 方法
    if not is_multiprocessing_worker():
        try:
            multiprocessing.set_start_method('spawn', force=True)
        except Exception:
            pass
    
    sys.exit(main())
