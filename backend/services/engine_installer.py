"""
引擎安装服务
支持预编译包下载和 pip 安装两种方式
"""

import asyncio
import logging
import subprocess
import sys
import os
import json
import hashlib
import tarfile
import zipfile
import shutil
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
import platform

logger = logging.getLogger(__name__)

# 安装状态追踪
_install_status: Dict[str, Dict[str, Any]] = {}

# 引擎包配置
from config.paths import get_base_dir, is_frozen
ENGINE_PACKAGES_FILE = get_base_dir() / "backend" / "config" / "engine_packages.json" if not is_frozen() else get_base_dir() / "config" / "engine_packages.json"
ENGINE_INSTALL_DIR = Path.home() / ".paperlens" / "engines"


def get_platform_key() -> str:
    """获取当前平台标识"""
    system = platform.system().lower()
    machine = platform.machine().lower()
    
    if system == "darwin":
        if machine == "arm64":
            return "darwin-arm64"
        elif machine == "x86_64":
            return "darwin-x86_64"
    elif system == "linux":
        if machine == "x86_64":
            return "linux-x86_64"
    elif system == "windows":
        if machine in ["amd64", "x86_64"]:
            return "windows-x86_64"
    
    return f"{system}-{machine}"


def load_engine_packages() -> Dict[str, Any]:
    """加载引擎包配置"""
    try:
        if ENGINE_PACKAGES_FILE.exists():
            with open(ENGINE_PACKAGES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load engine packages config: {e}")
    
    return {}


def get_install_status(engine_name: str) -> Dict[str, Any]:
    """获取引擎安装状态"""
    return _install_status.get(engine_name, {
        "status": "not_started",
        "progress": 0,
        "logs": [],
        "started_at": None,
        "completed_at": None
    })


def verify_sha256(file_path: Path, expected_hash: str) -> bool:
    """验证文件 SHA256 哈希"""
    if expected_hash.startswith("placeholder"):
        logger.warning(f"Skipping SHA256 verification for {file_path.name} (placeholder hash)")
        return True
    
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    
    actual_hash = sha256_hash.hexdigest()
    return actual_hash.lower() == expected_hash.lower()


async def download_file(url: str, dest_path: Path, add_log, set_progress, start_progress: int = 0, end_progress: int = 70) -> bool:
    """下载文件（带进度）"""
    import aiohttp
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    add_log(f"下载失败: HTTP {response.status}")
                    return False
                
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                
                with open(dest_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        if total_size > 0:
                            progress = start_progress + int((downloaded / total_size) * (end_progress - start_progress))
                            set_progress(progress)
                            
                            # 每 10MB 记录一次进度
                            if downloaded % (10 * 1024 * 1024) < 8192:
                                mb_downloaded = downloaded / (1024 * 1024)
                                mb_total = total_size / (1024 * 1024)
                                add_log(f"已下载 {mb_downloaded:.1f} MB / {mb_total:.1f} MB")
                
                return True
    except Exception as e:
        add_log(f"下载出错: {str(e)}")
        return False


async def install_precompiled_package(engine_name: str, package_info: Dict[str, Any], add_log, set_progress) -> bool:
    """安装预编译包"""
    platform_key = get_platform_key()
    
    if platform_key not in package_info.get("packages", {}):
        add_log(f"不支持的平台: {platform_key}")
        return False
    
    pkg = package_info["packages"][platform_key]
    url = pkg["url"]
    expected_hash = pkg["sha256"]
    binary_name = pkg["binary"]
    
    # 创建安装目录
    ENGINE_INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    install_dir = ENGINE_INSTALL_DIR / engine_name
    install_dir.mkdir(exist_ok=True)
    
    # 下载文件
    temp_file = install_dir / f"{engine_name}-package{Path(url).suffix}"
    add_log(f"正在下载 {engine_name} 预编译包...")
    add_log(f"URL: {url}")
    
    if not await download_file(url, temp_file, add_log, set_progress, 10, 70):
        return False
    
    # 验证哈希
    add_log("验证文件完整性...")
    if not verify_sha256(temp_file, expected_hash):
        add_log("文件哈希验证失败")
        temp_file.unlink()
        return False
    
    set_progress(75)
    
    # 解压文件
    add_log("解压安装包...")
    try:
        if temp_file.suffix == ".gz":
            with tarfile.open(temp_file, 'r:gz') as tar:
                tar.extractall(install_dir)
        elif temp_file.suffix == ".zip":
            with zipfile.ZipFile(temp_file, 'r') as zip_ref:
                zip_ref.extractall(install_dir)
        else:
            add_log(f"不支持的压缩格式: {temp_file.suffix}")
            return False
        
        # 设置可执行权限（Unix 系统）
        binary_path = install_dir / binary_name
        if binary_path.exists() and platform.system() != "Windows":
            binary_path.chmod(0o755)
            add_log(f"设置可执行权限: {binary_path}")
        
        # 清理临时文件
        temp_file.unlink()
        
        set_progress(90)
        add_log("预编译包安装完成")
        return True
        
    except Exception as e:
        add_log(f"解压失败: {str(e)}")
        return False


async def install_pip_package(engine_name: str, package_name: str, add_log, set_progress) -> bool:
    """使用 pip 安装包"""
    add_log(f"正在安装 {package_name}...")
    
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", package_name],
            capture_output=True,
            text=True,
            timeout=900  # 15分钟超时
        )
        
        if result.returncode != 0:
            add_log(f"pip 安装失败: {result.stderr}")
            return False
        
        set_progress(90)
        add_log(f"{package_name} 安装完成")
        return True
        
    except subprocess.TimeoutExpired:
        add_log("安装超时")
        return False
    except Exception as e:
        add_log(f"安装出错: {str(e)}")
        return False


async def install_engine_background(engine_name: str, use_precompiled: bool = True) -> Dict[str, Any]:
    """
    后台安装引擎
    
    Args:
        engine_name: 引擎名称 (marker/mineru)
        use_precompiled: 是否优先使用预编译包
    
    Returns:
        安装结果
    """
    if engine_name not in ["marker", "mineru"]:
        raise ValueError(f"不支持的引擎: {engine_name}")
    
    # 检查是否已经在安装
    if engine_name in _install_status and _install_status[engine_name]["status"] == "installing":
        return {
            "status": "already_installing",
            "message": f"{engine_name} 正在安装中"
        }
    
    # 初始化安装状态
    _install_status[engine_name] = {
        "status": "installing",
        "progress": 0,
        "logs": [],
        "started_at": datetime.now().isoformat(),
        "completed_at": None
    }
    
    def add_log(message: str):
        """添加日志"""
        _install_status[engine_name]["logs"].append({
            "time": datetime.now().isoformat(),
            "message": message
        })
        logger.info(f"[Install {engine_name}] {message}")
    
    def set_progress(progress: int):
        """设置进度"""
        _install_status[engine_name]["progress"] = progress
    
    try:
        packages_config = load_engine_packages()
        package_info = packages_config.get(engine_name, {})
        
        install_success = False
        
        # 尝试预编译包安装
        if use_precompiled and package_info:
            add_log(f"尝试使用预编译包安装 {engine_name}...")
            set_progress(5)
            
            if await install_precompiled_package(engine_name, package_info, add_log, set_progress):
                install_success = True
            else:
                add_log("预编译包安装失败，回退到 pip 安装...")
        
        # 回退到 pip 安装
        if not install_success:
            pip_package = package_info.get("fallback_pip_package")
            if not pip_package:
                if engine_name == "marker":
                    pip_package = "marker-pdf"
                elif engine_name == "mineru":
                    pip_package = "mineru"
            
            set_progress(10)
            if await install_pip_package(engine_name, pip_package, add_log, set_progress):
                install_success = True
        
        # 验证安装
        set_progress(95)
        add_log("验证安装...")
        
        from services.engine_detector import detect_engines
        engines = detect_engines()
        
        if engines.get(engine_name, {}).get("available"):
            add_log("安装成功！")
            _install_status[engine_name]["status"] = "completed"
            _install_status[engine_name]["progress"] = 100
            _install_status[engine_name]["completed_at"] = datetime.now().isoformat()
            return _install_status[engine_name]
        else:
            add_log("安装完成，但验证失败")
            _install_status[engine_name]["status"] = "failed"
            _install_status[engine_name]["error"] = "安装完成但引擎不可用"
            _install_status[engine_name]["completed_at"] = datetime.now().isoformat()
            return _install_status[engine_name]
    
    except Exception as e:
        add_log(f"安装出错: {str(e)}")
        _install_status[engine_name]["status"] = "failed"
        _install_status[engine_name]["error"] = str(e)
        _install_status[engine_name]["completed_at"] = datetime.now().isoformat()
        return _install_status[engine_name]


def get_installed_engines() -> Dict[str, Any]:
    """获取已安装的引擎信息"""
    installed = {}
    
    if ENGINE_INSTALL_DIR.exists():
        for engine_dir in ENGINE_INSTALL_DIR.iterdir():
            if engine_dir.is_dir():
                engine_name = engine_dir.name
                # 查找可执行文件
                for binary in engine_dir.glob("*"):
                    if binary.is_file() and binary.suffix in ["", ".exe"]:
                        installed[engine_name] = {
                            "path": str(binary),
                            "type": "precompiled",
                            "install_dir": str(engine_dir)
                        }
                        break
    
    return installed
