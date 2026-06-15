# Tauri 后端启动器
# 这个脚本会在 Tauri 启动时运行，启动 Python 后端服务

import os
import sys
import subprocess
import time
import signal
from pathlib import Path

# 后端进程对象
backend_process = None

def get_base_dir():
    """获取应用基础目录"""
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包后
        return Path(sys._MEIPASS)
    else:
        # 开发环境
        return Path(__file__).parent.parent

def start_backend():
    """启动 Python 后端"""
    global backend_process
    
    base_dir = get_base_dir()
    
    # 确定后端入口文件位置
    if getattr(sys, 'frozen', False):
        # 打包环境：使用打包后的 main.exe
        backend_path = base_dir / 'backend' / 'main.exe'
        if not backend_path.exists():
            backend_path = base_dir / 'main.exe'
    else:
        # 开发环境：使用 Python 运行 main.py
        backend_path = base_dir / 'backend' / 'main.py'
    
    print(f"启动后端: {backend_path}")
    
    # 启动后端进程
    if backend_path.suffix == '.exe':
        cmd = [str(backend_path)]
    else:
        cmd = [sys.executable, str(backend_path)]
    
    backend_process = subprocess.Popen(
        cmd,
        cwd=str(base_dir / 'backend'),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # 等待后端启动
    time.sleep(3)
    
    return backend_process

def stop_backend():
    """停止后端进程"""
    global backend_process
    if backend_process:
        print("停止后端...")
        backend_process.terminate()
        try:
            backend_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_process.kill()
        backend_process = None

if __name__ == '__main__':
    # 启动后端
    process = start_backend()
    
    try:
        # 等待后端进程
        process.wait()
    except KeyboardInterrupt:
        stop_backend()
