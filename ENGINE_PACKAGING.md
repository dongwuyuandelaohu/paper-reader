# 引擎独立打包方案

## 整体架构

```
PaperLens.exe (Tauri 桌面应用)
├── 前端 (React)
├── 后端 (Python FastAPI)
│   ├── PyMuPDF (内置)
│   └── 引擎调用器
└── engines/ 目录 (用户下载的插件)
    ├── marker-engine/     ← 独立打包的 Marker
    │   ├── marker-engine.exe
    │   ├── VERSION
    │   └── ... (所有依赖)
    └── mineru-engine/     ← 独立打包的 MinerU
        ├── mineru-engine.exe
        ├── VERSION
        └── ... (所有依赖)
```

## 为什么使用 --onedir 而不是 --onefile

| 模式 | 优点 | 缺点 | 适合场景 |
|------|------|------|---------|
| `--onefile` | 单个 exe 文件 | multiprocessing 问题、启动慢、路径问题 | 简单应用 |
| `--onedir` | 稳定可靠、支持复杂依赖 | 需要压缩成 zip | 复杂 ML 应用 ✓ |

**结论**：对于包含 PyTorch、transformers 的复杂应用，使用 `--onedir` 更稳定。

## 打包流程（开发者执行）

### 1. 准备打包环境

```bash
# 创建独立的打包目录
mkdir -p /tmp/engine-build
cd /tmp/engine-build

# 为 Marker 创建虚拟环境
python -m venv marker-venv
source marker-venv/bin/activate  # Windows: marker-venv\Scripts\activate

# 安装依赖
pip install marker-pdf==1.10.2
pip install transformers==4.46.3  # 降级到兼容版本
pip install pyinstaller

# 验证安装
marker_single --version
```

### 2. 创建入口文件

```python
# marker-entry.py
import sys
from marker.scripts.convert_single import convert_single_cli

if __name__ == "__main__":
    sys.argv[0] = "marker_single"
    sys.exit(convert_single_cli())
```

### 3. 执行打包

```bash
pyinstaller \
  --name marker-engine \
  --onedir \
  --noconfirm \
  --clean \
  marker-entry.py
```

### 4. 添加版本文件

```bash
echo "1.10.2" > dist/marker-engine/VERSION
```

### 5. 压缩成 zip

```bash
cd dist
zip -r marker-engine-v1.10.2.zip marker-engine/
```

### 6. 上传到 GitHub Releases

- 访问 https://github.com/YOUR-REPO/releases
- 创建新 Release (例如 v1.0.0)
- 上传 `marker-engine-v1.10.2.zip`
- 同样处理 `mineru-engine-v3.2.1.zip`

## 用户下载安装流程

### 用户视角

1. 打开 PaperLens 应用
2. 进入"设置" → "引擎管理"
3. 看到 Marker 和 MinerU 显示"未安装"
4. 点击"下载"按钮
5. 等待下载和解压完成
6. 引擎变为"已安装"，可以开始使用

### 技术实现

```python
# 下载 URL (配置在后端)
ENGINE_DOWNLOAD_URLS = {
    "marker": "https://github.com/xxx/releases/download/v1.0.0/marker-engine-v1.10.2.zip",
    "mineru": "https://github.com/xxx/releases/download/v1.0.0/mineru-engine-v3.2.1.zip"
}

# 下载和解压流程
async def download_and_install_engine(engine_name: str):
    url = ENGINE_DOWNLOAD_URLS[engine_name]
    
    # 1. 下载 zip 文件
    zip_path = f"~/.paperlens/engines/temp/{engine_name}.zip"
    await download_file(url, zip_path, on_progress=update_progress)
    
    # 2. 解压到 engines 目录
    extract_dir = f"~/.paperlens/engines/{engine_name}-engine"
    await extract_zip(zip_path, extract_dir)
    
    # 3. 验证安装
    if verify_engine(extract_dir):
        return True
    else:
        return False
```

## 调用引擎流程

### 后端调用逻辑

```python
async def call_marker_engine(pdf_path: str, output_dir: str):
    """调用独立打包的 Marker 引擎"""
    
    # 1. 获取引擎路径
    engines_dir = get_engines_dir()
    marker_exe = engines_dir / "marker-engine" / "marker-engine.exe"
    
    if not marker_exe.exists():
        raise EngineNotFoundError("Marker 引擎未安装")
    
    # 2. 构建命令
    cmd = [
        str(marker_exe),
        pdf_path,
        "--output_dir", output_dir,
        "--output_format", "markdown"
    ]
    
    # 3. 执行命令
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600  # 10分钟超时
    )
    
    # 4. 检查结果
    if result.returncode != 0:
        raise EngineError(f"Marker 执行失败: {result.stderr}")
    
    return result.stdout
```

## 完整工作流程

```
用户操作                    系统响应
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 打开应用          →     检测 engines/ 目录
                           - PyMuPDF: ✓ 内置
                           - Marker: ✗ 未安装
                           - MinerU: ✗ 未安装

2. 点击"下载 Marker" →     从 GitHub 下载 zip
                           解压到 engines/marker-engine/
                           验证安装成功

3. 上传 PDF 文档     →     选择引擎 (PyMuPDF/Marker/MinerU)
                           调用对应引擎解析
                           返回解析结果

4. 查看解析结果      →     显示 Markdown 和翻译
```

## 文件清单

### 打包脚本
- `build-engines/build-marker-onedir.sh` - 打包 Marker (--onedir 模式)
- `build-engines/build-mineru-onedir.sh` - 打包 MinerU (--onedir 模式)
- `build-engines/marker-entry.py` - Marker 入口文件
- `build-engines/mineru-entry.py` - MinerU 入口文件

### 后端代码
- `backend/services/engine_detector.py` - 引擎检测服务
- `backend/services/engine_installer.py` - 引擎安装服务（TODO）
- `backend/engines/marker_engine.py` - Marker 调用器（已更新）
- `backend/engines/mineru_engine.py` - MinerU 调用器（已更新）

### 配置
- `backend/config/engine_packages.json` - 引擎下载配置

## 下一步

1. **测试打包**：在 Windows 环境执行打包脚本
2. **上传 Release**：将 zip 文件上传到 GitHub
3. **实现下载**：完成 `engine_installer.py` 的下载逻辑
4. **前端集成**：在 UI 中添加"下载引擎"按钮
5. **端到端测试**：完整测试下载 → 安装 → 调用流程

## 常见问题

### Q: 为什么不用 pip install？
A: 用户可能没有 Python 环境，需要完全独立的方案。

### Q: 引擎文件很大怎么办？
A: Marker 约 500MB，MinerU 约 800MB。这是正常的，因为包含 PyTorch 和模型文件。

### Q: 如何更新引擎？
A: 重新打包 → 上传新版本 zip → 用户点击"更新"按钮。

### Q: 支持哪些平台？
A: 目前只支持 Windows x64。后续可以扩展 macOS 和 Linux。
