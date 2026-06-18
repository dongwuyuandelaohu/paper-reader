# PaperLens 引擎构建指南

## 概述

PaperLens 支持三种 PDF 解析引擎：
- **PyMuPDF** - 内置，轻量级文本提取
- **Marker** - 高质量 PDF→Markdown，使用 PyInstaller 打包
- **MinerU** - 高精度复杂版面解析，使用 venv + wrapper 方案

## 为什么分开构建？

Marker 和 MinerU 依赖不同版本的 `transformers`：
- **Marker** 需要 `transformers==4.46.3` (4.x)
- **MinerU** 需要 `transformers>=5.0` (5.x)

因此它们必须在**独立的虚拟环境**中构建，不能共享依赖。

## 构建方式对比

| 引擎 | 打包方式 | 产物 | 大小 |
|------|---------|------|------|
| Marker | PyInstaller --onedir | `marker-engine.exe` + `_internal/` | ~1.5 GB |
| MinerU | venv + wrapper | `.venv/` + `mineru-engine.bat` | ~3.5 GB |

## Windows 构建步骤

### 前置条件
- Python 3.10+ (推荐 3.11)
- 足够的磁盘空间 (构建过程需要 ~10 GB)
- 稳定的网络连接 (需要下载 PyTorch 和模型依赖)

### 1. 构建 Marker 引擎

```powershell
cd build-engines
.\build-marker-windows.bat
```

构建完成后产物在 `dist/marker-engine/`：
```
marker-engine/
├── marker-engine.exe    # 主程序
├── _internal/           # 依赖库
├── VERSION              # 版本号
── engine.json          # 元信息
```

### 2. 构建 MinerU 引擎

```powershell
cd build-engines
.\build-mineru-windows.bat
```

构建完成后产物在 `dist/mineru-engine/`：
```
mineru-engine/
├── mineru-engine.bat    # Wrapper 脚本
├── .venv/               # Python 虚拟环境
├── VERSION              # 版本号
└── engine.json          # 元信息
```

### 3. 打包为 zip

```powershell
cd build-engines
.\zip-engines-windows.ps1 -EngineType all
```

产物在 `build-engines/dist/` 目录下：
- `marker-engine-v1.10.2-windows-x86_64.zip`
- `mineru-engine-v3.2.1-windows-x86_64.zip`

### 4. 测试引擎

**测试 Marker：**
```powershell
cd build-engines/dist/marker-engine
.\marker-engine.exe --help
.\marker-engine.exe test.pdf --output_dir output/
```

**测试 MinerU：**
```powershell
cd build-engines/dist/mineru-engine
.\mineru-engine.bat --help
.\mineru-engine.bat -p test.pdf -o output/ -b pipeline
```

### 5. 上传到 GitHub Release

1. 创建 Release tag (如 `marker-1.10.2` 或 `mineru-3.2.1`)
2. 上传 zip 文件
3. 更新 `backend/config/engine_packages.json` 中的 SHA256 和 URL

## macOS/Linux 构建

```bash
# Marker
cd build-engines
./build-marker-onedir.sh

# MinerU
./build-mineru-onedir.sh

# 打包
./zip-engines.sh all
```

## 手动安装引擎 (给国内用户)

如果用户无法从 GitHub 下载，可以手动安装：

### 方式 1：解压预编译包

1. 下载对应平台的 zip 文件
2. 解压到 `~/.paperlens/engines/` 目录：
   ```
   Windows: C:\Users\<用户名>\.paperlens\engines\
   macOS:   ~/.paperlens/engines/
   Linux:   ~/.paperlens/engines/
   ```
3. 确保目录结构正确：
   ```
   engines/
   ├── marker-engine/
   │   ├── marker-engine.exe  (Windows) 或 marker-engine (macOS/Linux)
   │   ├── VERSION
   │   └── engine.json
   └── mineru-engine/
       ├── mineru-engine.bat  (Windows) 或 mineru-engine (macOS/Linux)
       ├── .venv/
       ├── VERSION
       └── engine.json
   ```
4. 重启 PaperLens 应用，在设置中检测引擎

### 方式 2：pip 安装 (开发环境)

```powershell
# Marker
pip install marker-pdf==1.10.2

# MinerU
pip install "mineru[all]==3.2.1"
```

应用会自动检测系统安装的引擎。

## 常见问题

### Q: 构建时内存不足
A: PyInstaller 打包 Marker 需要大量内存，建议至少 16 GB RAM。

### Q: MinerU 构建失败
A: MinerU 依赖较多，确保 Python 版本在 3.10-3.13 之间。

### Q: 引擎检测不到
A: 检查目录结构是否正确，确保有可执行文件和 VERSION 文件。

### Q: 模型下载慢
A: MinerU 首次运行会自动下载模型，可以设置 `MINERU_MODEL_SOURCE=modelscope` 使用国内镜像。

## 引擎包配置

`backend/config/engine_packages.json` 定义了各平台的下载链接：

```json
{
  "marker": {
    "packages": {
      "windows-x86_64": {
        "url": "https://github.com/paper-reader/engines/releases/download/marker-1.10.2/marker-engine-windows-x86_64.zip",
        "sha256": "<计算得到的SHA256>",
        "size_mb": 1500,
        "binary": "marker-engine.exe"
      }
    }
  }
}
```

每次上传新引擎包后，需要更新 SHA256 值。

## 文件说明

### 构建脚本

| 文件 | 说明 |
|------|------|
| `build-marker-onedir.sh` | macOS/Linux 下构建 Marker 引擎 (PyInstaller --onedir) |
| `build-marker-windows.bat` | Windows 下构建 Marker 引擎 (PyInstaller --onedir) |
| `build-mineru-onedir.sh` | macOS/Linux 下构建 MinerU 引擎 (venv + wrapper) |
| `build-mineru-windows.bat` | Windows 下构建 MinerU 引擎 (venv + wrapper) |

### 打包脚本

| 文件 | 说明 |
|------|------|
| `zip-engines.sh` | macOS/Linux 下将构建产物压缩为 zip |
| `zip-engines-windows.ps1` | Windows 下将构建产物压缩为 zip (PowerShell) |

### 上传脚本

| 文件 | 说明 |
|------|------|
| `upload-to-github.sh` | 辅助脚本，将 zip 文件上传到 GitHub Release |

### 入口文件

| 文件 | 说明 |
|------|------|
| `marker-entry.py` | Marker 引擎的 PyInstaller 入口点，处理单进程模式和参数 |
| `mineru-entry.py` | MinerU 引擎的入口点，处理 multiprocessing worker 和模块调用 |

### 其他

| 文件 | 说明 |
|------|------|
| `install-marker-engine.sh` | 在目标机器上安装 Marker 引擎的辅助脚本 |
| `README.md` | 本文档 |
