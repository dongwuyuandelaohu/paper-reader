# PaperLens Windows 打包指南

本文档介绍如何将 PaperLens 打包为 Windows 可执行文件（exe）。

## 目录结构

```
build-exe/
├── PaperLens.spec       # PyInstaller 配置文件
├── build.bat            # Windows 打包脚本
├── build.sh             # Unix 打包脚本
├── start.bat            # 启动器脚本
└── README.md            # 本文档
```

## 打包步骤

### 方法 1：在 Windows 上打包（推荐）

1. **安装依赖**
   ```bash
   # 安装 Python 3.8+
   # 安装 Node.js 16+
   
   # 安装后端依赖
   cd backend
   pip install -r requirements.txt
   
   # 安装前端依赖
   cd ../frontend
   npm install
   ```

2. **构建前端**
   ```bash
   cd frontend
   npm run build
   ```

3. **运行打包脚本**
   ```bash
   cd build-exe
   build.bat
   ```

4. **测试打包结果**
   ```bash
   cd dist/PaperLens
   PaperLens.exe
   ```

### 方法 2：在 macOS/Linux 上交叉编译

⚠️ **注意**：PyInstaller 不支持真正的交叉编译。在 macOS/Linux 上打包的 Windows 版本可能无法正常工作。建议在 Windows 虚拟机或 Wine 环境中打包。

```bash
cd build-exe
chmod +x build.sh
./build.sh
```

## 打包配置说明

### PaperLens.spec

这是 PyInstaller 的配置文件，定义了：

- **入口文件**：`backend/main.py`
- **数据文件**：
  - 前端静态文件（`frontend/dist` → `static`）
  - 配置文件（`backend/config` → `config`）
- **隐藏导入**：FastAPI、uvicorn、API 模块等
- **排除模块**：大型 ML 库（torch、transformers 等）

### 排除大型 ML 库的原因

为了减小打包体积，我们排除了以下库：
- `torch`、`torchvision`、`torchaudio`（~2GB）
- `transformers`（~500MB）
- `marker`（~1GB）
- `magic_pdf`（MinerU）（~800MB）
- `paddle`、`paddleocr`（~1GB）

这些库可以通过应用内的**引擎安装器**动态安装，用户按需下载。

## 发布包结构

打包完成后，发布包结构如下：

```
PaperLens/
├── PaperLens.exe              # 主程序
├── start.bat                  # 启动器（自动打开浏览器）
├── config/
│   └── engine_packages.json   # 引擎包配置
├── static/                    # 前端静态文件
│   ├── index.html
│   └── assets/
├── _internal/                 # PyInstaller 运行时
└── README.md                  # 使用说明
```

## 用户首次运行

1. **解压发布包**
   ```
   解压 PaperLens-windows-x86_64.tar.gz
   ```

2. **运行启动器**
   ```
   双击 start.bat
   ```

3. **自动打开浏览器**
   ```
   访问 http://localhost:8765
   ```

4. **安装解析引擎**（可选）
   - 在应用界面点击"安装引擎"
   - 选择 Marker 或 MinerU
   - 等待下载安装完成

## 数据存储位置

用户数据存储在以下位置：

**Windows**:
```
C:\Users\<用户名>\AppData\Roaming\PaperLens\data\
├── data.db                    # 数据库
├── papers/                    # PDF 文件
├── images/                    # 解析生成的图片
├── logs/                      # 日志文件
└── temp/                      # 临时文件
```

**macOS/Linux**:
```
~/.paperlens/data/
├── data.db
├── papers/
├── images/
├── logs/
└── temp/
```

## 常见问题

### Q: 打包后运行报错 "ModuleNotFoundError"

**A**: 检查 `PaperLens.spec` 中的 `hiddenimports`，添加缺失的模块。

### Q: 前端页面无法加载

**A**: 确保 `frontend/dist` 目录存在且包含 `index.html`。

### Q: 打包体积太大

**A**: 检查是否意外包含了大型 ML 库。可以在 `PaperLens.spec` 的 `excludes` 中添加更多模块。

### Q: 如何添加应用图标？

**A**: 在 `PaperLens.spec` 中设置 `icon` 参数：
```python
exe = EXE(
    ...
    icon='path/to/icon.ico',
    ...
)
```

### Q: 如何隐藏控制台窗口？

**A**: 在 `PaperLens.spec` 中设置 `console=False`：
```python
exe = EXE(
    ...
    console=False,
    ...
)
```

## 高级配置

### 创建 Windows 安装程序

可以使用 **Inno Setup** 或 **NSIS** 创建专业的安装程序：

1. 下载 [Inno Setup](https://jrsoftware.org/isinfo.php)
2. 创建安装脚本（`.iss` 文件）
3. 编译生成安装程序（`setup.exe`）

示例 Inno Setup 脚本：
```pascal
[Setup]
AppName=PaperLens
AppVersion=0.1.0
DefaultDirName={autopf}\PaperLens
DefaultGroupName=PaperLens
OutputDir=output
OutputBaseFilename=PaperLens-Setup

[Files]
Source: "dist\PaperLens\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\PaperLens"; Filename: "{app}\PaperLens.exe"
Name: "{autodesktop}\PaperLens"; Filename: "{app}\PaperLens.exe"
```

### 自动更新

可以集成 **WinSparkle** 或 **Squirrel.Windows** 实现自动更新功能。

## 性能优化

### 减小打包体积

1. **使用 UPX 压缩**（已启用）
   ```python
   exe = EXE(..., upx=True, ...)
   ```

2. **排除不必要的模块**
   在 `excludes` 中添加更多模块

3. **使用 `--onefile` 模式**
   ```bash
   pyinstaller --onefile PaperLens.spec
   ```
   ⚠️ 注意：`--onefile` 会增加启动时间

### 提高启动速度

1. **禁用热重载**（已实现）
   ```python
   reload=not is_frozen()
   ```

2. **延迟加载引擎**
   只在用户请求时加载解析引擎

## 测试清单

在发布前，请测试以下功能：

- [ ] 启动应用，浏览器自动打开
- [ ] 上传 PDF 文件
- [ ] 使用 PyMuPDF 引擎解析
- [ ] 查看解析结果和图片
- [ ] 翻译功能（需要配置 AI 模型）
- [ ] 安装 Marker/MinerU 引擎
- [ ] 使用高级引擎解析
- [ ] 关闭应用，数据正确保存

## 技术支持

如有问题，请查看：
- PyInstaller 文档：https://pyinstaller.org/
- FastAPI 文档：https://fastapi.tiangolo.com/
- 项目 Issues：https://github.com/your-repo/issues
