# PaperLens 桌面应用构建总结

## 已完成的工作

### 1. Tauri 项目初始化 ✅
- 使用 `npx tauri init` 初始化项目
- 配置窗口大小: 1400x900 (最小 1000x700)
- 设置应用标识: `com.paperlens.app`
- 配置 Windows 安装包格式: MSI + NSIS

### 2. 后端进程管理 ✅
- Rust 代码自动启动 Python 后端
- 开发模式: 使用 `python main.py`
- 生产模式: 使用 `main.exe` (PyInstaller 打包)
- 窗口关闭时自动停止后端进程

### 3. 构建配置 ✅
- **tauri.conf.json**: 窗口、打包、资源配置
- **Cargo.toml**: Rust 依赖管理
- **main.spec**: PyInstaller 打包配置
- **resources/backend/**: 后端资源目录

### 4. 自动化构建 ✅
- **GitHub Actions**: 推送 tag 自动构建 Windows 安装包
- **build-windows.ps1**: 本地 Windows 构建脚本
- 支持 MSI 和 NSIS 两种安装包格式

### 5. 文档 ✅
- **WINDOWS_BUILD.md**: 完整的构建指南
- 包含故障排查和开发模式说明

## 项目结构

```
paper-reader/
├── frontend/                    # React 前端
│   ├── src/
│   ├── dist/                    # 构建输出
│   └── package.json
│
├── backend/                     # Python 后端
│   ├── main.py                  # 入口文件
│   ├── main.spec                # PyInstaller 配置
│   ├── requirements.txt
│   └── config/
│
├── src-tauri/                   # Tauri 桌面应用
│   ├── src/
│   │   ├── main.rs              # 入口
│   │   └── lib.rs               # 后端进程管理
│   ├── resources/
│   │   └── backend/             # 后端 exe 和资源
│   ├── tauri.conf.json          # Tauri 配置
│   └── Cargo.toml               # Rust 依赖
│
├── .github/workflows/
│   └── build-windows.yml        # GitHub Actions
│
├── build-windows.ps1            # Windows 构建脚本
└── WINDOWS_BUILD.md             # 构建文档
```

## 构建方式

### 方式 1: GitHub Actions（推荐）

```bash
# 1. 提交代码
git add .
git commit -m "feat: add Windows desktop support"

# 2. 创建版本标签
git tag v0.1.0
git push origin v0.1.0

# 3. 等待自动构建
# GitHub Actions 会自动构建 Windows 安装包
# 在 Releases 页面下载
```

### 方式 2: 本地 Windows 构建

```powershell
# 在 Windows 上运行
.\build-windows.ps1

# 或使用参数跳过某些步骤
.\build-windows.ps1 -SkipFrontend
.\build-windows.ps1 -SkipBackend
.\build-windows.ps1 -Clean
```

### 方式 3: 开发模式测试

```bash
# 终端 1: 启动后端
cd backend
python main.py

# 终端 2: 启动前端开发服务器
cd frontend
npm run dev

# 终端 3: 启动 Tauri 开发模式
npx tauri dev
```

## 安装包特性

### MSI 安装包
- ✅ Windows 标准格式
- ✅ 支持组策略部署
- ✅ 多语言支持（中文/英文）

### NSIS 安装包
- ✅ 现代安装界面
- ✅ 自定义安装路径
- ✅ 语言选择器
- ✅ 当前用户安装（无需管理员）
- ✅ 创建桌面快捷方式

## 系统要求

- **操作系统**: Windows 10/11 (64位)
- **内存**: 2GB+
- **磁盘**: 500MB+
- **运行时**: WebView2 (已内置)

## 下一步行动

### 立即可做
1. ✅ 提交代码到 GitHub
2. ✅ 创建 v0.1.0 标签
3. ⏳ 等待 GitHub Actions 构建
4. ⏳ 下载安装包测试

### 优化项（可选）
- [ ] 替换默认应用图标
- [ ] 添加自动更新功能
- [ ] 实现崩溃报告
- [ ] 优化安装包大小
- [ ] 添加代码签名证书

## 技术栈

### 前端
- React 18 + TypeScript
- Vite 构建工具
- Ant Design 组件库

### 后端
- Python 3.11
- FastAPI + Uvicorn
- SQLite 数据库
- PyMuPDF/Marker/MinerU 引擎

### 桌面应用
- Tauri 2.x
- Rust 后端进程管理
- WebView2 渲染引擎

## 关键文件说明

### src-tauri/src/lib.rs
```rust
// 启动时自动启动 Python 后端
// 关闭时自动停止后端进程
// 支持开发模式和生产模式
```

### tauri.conf.json
```json
{
  "productName": "PaperLens",
  "identifier": "com.paperlens.app",
  "bundle": {
    "targets": ["msi", "nsis"],
    "resources": ["resources/backend/**/*"]
  }
}
```

### backend/main.spec
```python
# PyInstaller 配置
# 打包为单文件 main.exe
# 隐藏控制台窗口
# 包含配置文件
```

## 测试清单

### 功能测试
- [ ] 应用启动正常
- [ ] 后端自动启动
- [ ] 前端界面显示
- [ ] PDF 上传功能
- [ ] 解析引擎选择
- [ ] 翻译功能
- [ ] 数据持久化

### 安装测试
- [ ] MSI 安装正常
- [ ] NSIS 安装正常
- [ ] 安装路径自定义
- [ ] 语言选择
- [ ] 快捷方式创建
- [ ] 卸载功能

### 兼容性测试
- [ ] Windows 10
- [ ] Windows 11
- [ ] 不同分辨率
- [ ] 高 DPI 显示器

## 常见问题

### Q: 为什么不能在 macOS 上直接构建 Windows 版本？
A: Tauri 不支持跨平台编译，必须在目标平台上构建或使用 CI/CD。

### Q: GitHub Actions 构建失败怎么办？
A: 查看 Actions 日志，常见原因：
- Python 依赖安装失败
- Rust 编译错误
- 资源文件缺失

### Q: 安装包太大怎么办？
A: 
- 检查 PyInstaller 是否包含了不必要的文件
- 使用 UPX 压缩
- 考虑将大文件改为在线下载

## 联系方式

如有问题，请参考：
- Tauri 文档: https://tauri.app/
- PyInstaller 文档: https://pyinstaller.org/
- 项目文档: WINDOWS_BUILD.md
