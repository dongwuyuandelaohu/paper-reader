"""
引擎自动安装服务
支持两种安装方式:
1. 预编译包下载 (优先): 从 GitHub Release 下载打包好的引擎
2. pip 安装 (回退): 创建 venv 并 pip install
"""
import os
import sys
import json
import subprocess
import shutil
import hashlib
import platform
import logging
import tarfile
import zipfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class EngineInstaller:
    """自动安装和管理解析引擎"""

    def __init__(self):
        # 引擎安装目录
        self.engines_dir = Path.home() / ".paperlens" / "engines"
        self.engines_dir.mkdir(parents=True, exist_ok=True)

    def get_engine_path(self, engine_name: str) -> Path:
        """获取引擎路径"""
        return self.engines_dir / f"{engine_name}-engine"

    def is_engine_installed(self, engine_name: str) -> bool:
        """检查引擎是否已安装"""
        engine_path = self.get_engine_path(engine_name)
        if not engine_path.exists():
            return False

        # 检查 PyInstaller 可执行文件
        if sys.platform == "win32":
            exe = engine_path / f"{engine_name}-engine.exe"
            bat = engine_path / f"{engine_name}-engine.bat"
            if exe.exists() or bat.exists():
                return True
        else:
            exe = engine_path / f"{engine_name}-engine"
            if exe.exists():
                return True

        # 检查 venv 引擎
        if (engine_path / ".venv").is_dir():
            return True

        return False

    # ==================== 预编译包下载 ====================

    def _get_platform_key(self) -> str:
        """获取当前平台标识，如 darwin-arm64"""
        system = platform.system().lower()  # darwin, linux, windows
        machine = platform.machine().lower()  # arm64, x86_64, amd64
        if machine == "amd64":
            machine = "x86_64"
        return f"{system}-{machine}"

    def _load_engine_packages(self) -> dict:
        """加载 engine_packages.json 配置"""
        config_path = Path(__file__).parent.parent / "config" / "engine_packages.json"
        if config_path.exists():
            return json.loads(config_path.read_text(encoding="utf-8"))
        return {}

    def download_precompiled(self, engine_name: str, progress_callback=None) -> bool:
        """
        下载预编译包并解压到引擎目录

        Args:
            engine_name: 引擎名称 (marker, mineru)
            progress_callback: 进度回调 callback(message, percent)

        Returns:
            是否成功
        """
        import httpx

        def report(msg, pct=0):
            logger.info(f"[Engine] [{pct}%] {msg}")
            if progress_callback:
                progress_callback(msg, pct)

        packages = self._load_engine_packages()
        platform_key = self._get_platform_key()

        pkg_info = packages.get(engine_name, {}).get("packages", {}).get(platform_key)
        if not pkg_info:
            report(f"没有 {platform_key} 平台的预编译包", 0)
            return False

        url = pkg_info["url"]
        expected_sha = pkg_info.get("sha256", "")
        binary_name = pkg_info.get("binary", "")
        target_dir = self.get_engine_path(engine_name)

        # 临时下载目录
        download_dir = self.engines_dir / "downloads"
        download_dir.mkdir(exist_ok=True)
        download_filename = Path(url).name
        download_path = download_dir / download_filename

        report(f"准备下载 {engine_name} 引擎...", 5)
        logger.info(f"[Engine] URL: {url}")
        logger.info(f"[Engine] Platform: {platform_key}")

        try:
            # 1. 下载文件 (带进度)
            report("开始下载...", 10)
            with httpx.Client(follow_redirects=True, timeout=600) as client:
                with client.stream("GET", url) as resp:
                    resp.raise_for_status()
                    total = int(resp.headers.get("content-length", 0))
                    downloaded = 0

                    with open(download_path, "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total > 0:
                                pct = 10 + int(downloaded / total * 50)  # 下载占 10%-60%
                                mb_done = downloaded / (1024 * 1024)
                                mb_total = total / (1024 * 1024)
                                report(f"下载中... {mb_done:.1f}MB / {mb_total:.1f}MB", pct)

            report("下载完成", 60)

            # 2. SHA256 校验 (跳过 placeholder)
            if expected_sha and not expected_sha.startswith("placeholder"):
                report("校验文件完整性...", 65)
                sha = hashlib.sha256(download_path.read_bytes()).hexdigest()
                if sha != expected_sha:
                    raise RuntimeError(
                        f"SHA256 校验失败:\n  期望: {expected_sha}\n  实际: {sha}"
                    )
                report("校验通过", 70)
            else:
                report("跳过 SHA256 校验 (未配置)", 70)

            # 3. 解压
            report("解压引擎包...", 75)
            if target_dir.exists():
                shutil.rmtree(target_dir)
            target_dir.mkdir(parents=True)

            if download_filename.endswith(".zip"):
                with zipfile.ZipFile(download_path) as zf:
                    zf.extractall(target_dir)
            elif download_filename.endswith((".tar.gz", ".tgz")):
                with tarfile.open(download_path) as tf:
                    tf.extractall(target_dir)
            else:
                raise RuntimeError(f"不支持的压缩格式: {download_filename}")

            report("解压完成", 90)

            # 4. 处理解压后的目录结构
            # 如果 zip 内有一个同名子目录，把内容移上来
            inner_dir = target_dir / f"{engine_name}-engine"
            if inner_dir.is_dir() and (inner_dir / "VERSION").exists():
                # zip 内有 engine-name 子目录，内容已在正确位置
                pass
            elif inner_dir.is_dir():
                # 把子目录内容移到上层
                for item in inner_dir.iterdir():
                    dest = target_dir / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(dest))
                inner_dir.rmdir()

            # 5. 设置可执行权限 (macOS/Linux)
            if sys.platform != "win32":
                exe_file = target_dir / f"{engine_name}-engine"
                if exe_file.exists():
                    exe_file.chmod(0o755)

            # 6. 创建 VERSION 文件 (如果不存在)
            version_file = target_dir / "VERSION"
            if not version_file.exists():
                version = packages.get(engine_name, {}).get("version", "unknown")
                version_file.write_text(version)

            # 7. 清理下载文件
            download_path.unlink(missing_ok=True)

            report(f"{engine_name} 引擎安装完成！", 100)
            return True

        except Exception as e:
            report(f"下载失败: {e}", 0)
            logger.error(f"[Engine] Download failed: {e}", exc_info=True)
            # 清理
            download_path.unlink(missing_ok=True)
            if target_dir.exists():
                shutil.rmtree(target_dir)
            return False

    # ==================== pip 安装 (回退) ====================

    def install_engine(self, engine_name: str, progress_callback=None) -> bool:
        """
        通过 pip 安装引擎到独立虚拟环境 (回退方案)

        Args:
            engine_name: 引擎名称 (marker, mineru)
            progress_callback: 进度回调函数 callback(message: str, percent: int)

        Returns:
            bool: 是否安装成功
        """

        def report(msg, pct=0):
            print(f"[{pct}%] {msg}")
            if progress_callback:
                progress_callback(msg, pct)

        engine_path = self.engines_dir / engine_name

        if self.is_engine_installed(engine_name):
            report(f"引擎 {engine_name} 已安装", 100)
            return True

        try:
            # 1. 创建虚拟环境
            report(f"创建 {engine_name} 虚拟环境...", 10)
            subprocess.run(
                [sys.executable, "-m", "venv", str(engine_path)],
                check=True,
                capture_output=True,
            )

            # 2. 确定 Python 可执行文件路径
            if sys.platform == "win32":
                python_exe = engine_path / "Scripts" / "python.exe"
                pip_exe = engine_path / "Scripts" / "pip.exe"
            else:
                python_exe = engine_path / "bin" / "python"
                pip_exe = engine_path / "bin" / "pip"

            # 3. 升级 pip
            report("升级 pip...", 20)
            subprocess.run(
                [str(python_exe), "-m", "pip", "install", "--upgrade", "pip"],
                check=True,
                capture_output=True,
            )

            # 4. 根据引擎类型安装依赖
            if engine_name == "marker":
                report("安装 Marker 依赖 (这可能需要 5-10 分钟)...", 30)
                subprocess.run(
                    [
                        str(pip_exe),
                        "install",
                        "marker-pdf==1.10.2",
                        "transformers<5.0.0",
                        "opencv-python",
                        "pillow",
                    ],
                    check=True,
                    capture_output=True,
                )

            elif engine_name == "mineru":
                report("安装 MinerU 依赖 (这可能需要 5-10 分钟)...", 30)
                subprocess.run(
                    [str(pip_exe), "install", "mineru[all]==3.2.1"],
                    check=True,
                    capture_output=True,
                )
            else:
                report(f"未知的引擎类型: {engine_name}", 0)
                return False

            report(f"引擎 {engine_name} 安装完成！", 100)
            return True

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode("utf-8") if e.stderr else str(e)
            report(f"安装失败: {error_msg}", 0)
            # 清理失败的安装
            if engine_path.exists():
                shutil.rmtree(engine_path)
            return False
        except Exception as e:
            report(f"安装过程出错: {str(e)}", 0)
            if engine_path.exists():
                shutil.rmtree(engine_path)
            return False

    def uninstall_engine(self, engine_name: str) -> bool:
        """卸载指定引擎"""
        engine_path = self.get_engine_path(engine_name)
        if engine_path.exists():
            try:
                shutil.rmtree(engine_path)
                return True
            except Exception as e:
                print(f"卸载失败: {e}")
                return False
        # 兼容旧路径
        old_path = self.engines_dir / engine_name
        if old_path.exists():
            try:
                shutil.rmtree(old_path)
                return True
            except Exception as e:
                print(f"卸载失败: {e}")
                return False
        return True

    def get_python_exe(self, engine_name: str) -> Optional[str]:
        """获取引擎的 Python 可执行文件路径"""
        if not self.is_engine_installed(engine_name):
            return None

        engine_path = self.get_engine_path(engine_name)
        if sys.platform == "win32":
            return str(engine_path / "Scripts" / "python.exe")
        else:
            return str(engine_path / "bin" / "python")


# 全局实例
engine_installer = EngineInstaller()

# 安装状态追踪
_install_status = {}


async def install_engine_background(engine_name: str, use_precompiled: bool = True):
    """
    后台安装引擎
    优先使用预编译包下载，失败则回退到 pip 安装

    Args:
        engine_name: 引擎名称
        use_precompiled: 是否优先使用预编译包
    """
    global _install_status

    _install_status[engine_name] = {
        "status": "installing",
        "progress": 0,
        "logs": [],
    }

    def progress_callback(message: str, percent: int):
        _install_status[engine_name]["progress"] = percent
        _install_status[engine_name]["logs"].append(
            {
                "message": message,
                "percent": percent,
            }
        )

    try:
        success = False

        # 优先使用预编译包
        if use_precompiled:
            try:
                progress_callback("尝试下载预编译包...", 5)
                success = engine_installer.download_precompiled(
                    engine_name, progress_callback
                )
            except Exception as e:
                logger.warning(
                    f"[Engine] Precompiled download failed: {e}, falling back to pip"
                )
                progress_callback(f"预编译包下载失败: {e}，回退到 pip 安装", 0)
                success = False

        # 回退到 pip 安装
        if not success:
            progress_callback("使用 pip 安装引擎...", 5)
            success = engine_installer.install_engine(engine_name, progress_callback)

        if success:
            _install_status[engine_name]["status"] = "completed"
            _install_status[engine_name]["progress"] = 100
        else:
            _install_status[engine_name]["status"] = "failed"

    except Exception as e:
        _install_status[engine_name]["status"] = "failed"
        _install_status[engine_name]["logs"].append(
            {
                "message": f"安装失败: {str(e)}",
                "percent": 0,
            }
        )


def get_install_status(engine_name: str):
    """
    获取引擎安装状态

    Returns:
        dict: {
            "status": "not_started" | "installing" | "completed" | "failed",
            "progress": int (0-100),
            "logs": [{"message": str, "percent": int}, ...]
        }
    """
    global _install_status

    if engine_name not in _install_status:
        # 检查是否已安装
        if engine_installer.is_engine_installed(engine_name):
            return {
                "status": "completed",
                "progress": 100,
                "logs": [{"message": "已安装", "percent": 100}],
            }
        else:
            return {
                "status": "not_started",
                "progress": 0,
                "logs": [],
            }

    return _install_status[engine_name]
