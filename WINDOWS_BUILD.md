# PaperLens Windows 构建指南

本文档说明如何构建 PaperLens Windows 桌面应用。

## 架构说明

PaperLens 采用前后端分离架构，通过 Tauri 打包为 Windows 桌面应用：

```
┌─────────────────────────────────────┐
│   Tauri 应用 (PaperLens.exe)        │
├─────────────────────────────────────┤
│  前端: React + Vite (WebView2)      │
│  - 用户界面                          │
│  - API 调用: http://localhost:8765  │
└──────────────┬──────────────────────┘
               │
               │ 启动时自动启动
               ▼
┌─────────────────────────────────────┐
│  后端: Python FastAPI (main.exe)    │
│  - API 服务: localhost:8765         │
│  - 数据库: SQLite                   │
│  - PDF 解析引擎                      │
└─────────────────────────────────────┘
```

## 构建方式

### 方式 1: GitHub Actions（推荐）

这是最简单的方式，无需 Windows 环境。

1. **推送代码到 GitHub**
   ```bash
   git add .
   git commit -m "feat: add Windows build support"
   git push
   ```

2. **创建 Release Tag**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. **自动构建**
   - GitHub Actions 会自动触发 `.github/workflows/build-windows.yml`
   - 构建完成后，在 GitHub Releases 页面下载安装包

### 方式 2: 在 Windows 机器上本地构建

#### 前置要求

1. **Node.js 20+**
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

2. **Rust**
   ```powershell
   winget install Rustlang.Rustup
   rustup target add x86_64-pc-windows-msvc
   ```

3. **Python 3.11+**
   ```powershell
   winget install Python.Python.3.11
   ```

4. **Visual Studio Build Tools**
   ```powershell
   winget install Microsoft.VisualStudio.2022.BuildTools
   # 安装时勾选 "C++ build tools"
   ```

#### 构建步骤

1. **安装前端依赖**
   ```powershell
   cd frontend
   npm install
   npm run build
   ```

2. **安装后端依赖**
   ```powershell
   cd backend
   pip install -r requirements.txt
   pip install pyinstaller
   ```

3. **打包后端为 exe**
   ```powershell
   cd backend
   pyinstaller --name main --onefile --noconsole main.py
   ```

4. **复制后端到 Tauri 资源目录**
   ```powershell
   mkdir -p src-tauri/resources/backend
   Copy-Item -Path "backend/dist/main/main.exe" -Destination "src-tauri/resources/backend/"
   # 如果有 _internal 目录，也要复制
   if (Test-Path "backend/dist/main/_internal") {
       Copy-Item -Path "backend/dist/main/_internal/*" -Destination "src-tauri/resources/backend/" -Recurse
   }
   ```

5. **构建 Tauri 应用**
   ```powershell
   npx tauri build --bundles msi,nsis
   ```

6. **获取安装包**
   - MSI: `src-tauri/target/release/bundle/msi/PaperLens_0.1.0_x64_en-US.msi`
   - NSIS: `src-tauri/target/release/bundle/nsis/PaperLens_0.1.0_x64-setup.exe`

### 方式 3: 在 macOS 上交叉编译（不推荐）

Tauri 不支持从 macOS 交叉编译到 Windows。必须使用 Windows 或 GitHub Actions。

## 安装包说明

### MSI 安装包
- **文件**: `PaperLens_x64_en-US.msi`
- **特点**: 
  - Windows 标准安装格式
  - 支持组策略部署
  - 需要管理员权限
- **适用场景**: 企业环境、系统管理员批量部署

### NSIS 安装包
- **文件**: `PaperLens_x64-setup.exe`
- **特点**:
  - 现代安装界面
  - 支持自定义安装路径
  - 当前用户安装（无需管理员）
  - 多语言选择（中文/英文）
- **适用场景**: 个人用户、快速安装

## 安装选项

NSIS 安装程序支持以下选项：

1. **安装模式**: 当前用户（无需管理员权限）
2. **安装路径**: 可自定义
3. **语言选择**: 简体中文 / English
4. **开始菜单快捷方式**: 自动创建
5. **桌面快捷方式**: 可选

## 系统要求

- **操作系统**: Windows 10 或更高版本 (64位)
- **内存**: 至少 2GB RAM
- **磁盘空间**: 至少 500MB
- **运行时**: WebView2（Windows 10/11 已内置）

## 故障排查

### 问题 1: 启动后白屏
**原因**: 后端未启动
**解决**: 
- 检查任务管理器中是否有 `main.exe` 进程
- 查看日志: `%APPDATA%/com.paperlens.app/logs/`

### 问题 2: 安装失败
**原因**: 缺少 WebView2
**解决**: 
- Windows 10/11 通常已内置
- 手动下载: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### 问题 3: 后端启动失败
**原因**: 缺少依赖文件
**解决**:
- 确保 `resources/backend/` 包含所有必要文件
- 检查 PyInstaller 打包是否成功

## 开发模式

在开发环境中测试：

```bash
# 启动后端
cd backend
python main.py

# 启动前端开发服务器（新终端）
cd frontend
npm run dev

# 启动 Tauri 开发模式（新终端）
npx tauri dev
```

## 版本发布流程

1. **更新版本号**
   ```bash
   # 更新 package.json
   npm version patch  # 或 minor, major
   
   # 更新 Cargo.toml
   # 手动修改 version = "0.1.1"
   ```

2. **提交更改**
   ```bash
   git add .
   git commit -m "chore: bump version to 0.1.1"
   git push
   ```

3. **创建 Release Tag**
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```

4. **等待 GitHub Actions 完成**
   - 访问 https://github.com/YOUR-REPO/actions
   - 等待构建完成
   - 在 Releases 页面下载安装包

## 技术细节

### 后端进程管理

Tauri 在启动时自动启动后端进程：
- 开发模式: 使用 `python main.py`
- 生产模式: 使用 `main.exe`

进程生命周期：
1. Tauri 启动 → 启动后端
2. 前端加载 → 等待后端就绪
3. 应用运行 → 前端与后端通信
4. 应用关闭 → 自动停止后端

### 资源目录结构

```
安装目录/
├── PaperLens.exe          # Tauri 主程序
├── resources/
│   └── backend/
│       ├── main.exe       # Python 后端（PyInstaller 打包）
│       └── _internal/     # Python 依赖（如果有）
└── ...
```

### 数据存储位置

用户数据存储在：
```
%APPDATA%/com.paperlens.app/
├── data.db               # SQLite 数据库
├── papers/               # PDF 文件
├── images/               # 解析生成的图片
└── logs/                 # 日志文件
```

## 下一步

- [ ] 添加应用图标（替换默认图标）
- [ ] 实现自动更新机制
- [ ] 添加崩溃报告
- [ ] 优化安装包大小
- [ ] 添加代码签名

## 参考链接

- [Tauri 文档](https://tauri.app/)
- [PyInstaller 文档](https://pyinstaller.org/)
- [NSIS 文档](https://nsis.sourceforge.io/Docs/)
- [GitHub Actions](https://docs.github.com/en/actions)
