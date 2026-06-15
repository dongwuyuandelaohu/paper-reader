# PaperLens EXE 打包方案评估

## 一、核心问题：300MB 限制下的体积分析

### 各组件体积预估

| 组件 | 体积 | 说明 |
|------|------|------|
| **Electron 运行时** | ~150 MB | Chromium + Node.js，这是底线无法压缩 |
| **前端资源** (React+Vite 构建产物) | ~5 MB | JS/CSS/HTML，很小 |
| **Python 后端** (FastAPI+依赖, PyInstaller) | ~40-60 MB | fastapi, uvicorn, aiosqlite, openai 等 |
| **SQLite** | ~2 MB | 随 Python 自带 |
| **Marker 代码** (marker-pdf pip 包) | ~30 MB | Python 代码本身不大 |
| **⚠️ Marker ML 模型** | **~500 MB - 1.5 GB** | **这是最大的问题！** |
| **PyTorch 运行时** (Marker 依赖) | **~800 MB - 2 GB** | **Marker 需要 PyTorch** |

### 结论

> **Marker 的 ML 模型 + PyTorch 运行时总共约 1-3 GB，根本不可能塞进 300MB 的安装包。**
> 
> 解决方案：**安装包不包含 Marker 模型，首次使用时按需下载。**

### 最终安装包体积预估

| 组件 | 体积 | 备注 |
|------|------|------|
| Electron | ~150 MB | 使用 electron-builder 压缩 |
| 前端构建产物 | ~5 MB | Vite build |
| Python 后端 (不含 Marker) | ~50 MB | PyInstaller --onefile |
| 图标/资源 | ~2 MB | |
| NSIS 安装程序开销 | ~10 MB | |
| **合计** | **~217 MB** | **✅ 在 300MB 以内** |

---

## 二、架构调整：单服务 + Marker 内嵌

### 旧架构（两个服务，已废弃）

```
Electron → Frontend (React)
         → Backend (FastAPI :8765)
                ↓ HTTP
           Marker Service (:8010)   ← 独立进程，割裂
```

### 新架构（单服务，Marker 作为模块）

```
┌───────────────────────────────────────────────┐
│               Electron App                     │
│                                                │
│  ┌────────────┐    ┌────────────────────────┐  │
│  │  Frontend  │    │   Backend (单进程)      │  │
│  │ React+Vite │◄──►│   server.exe :8765     │  │
│  │            │    │                        │  │
│  └────────────┘    │  ┌──────────────────┐  │  │
│                    │  │ engines/         │  │  │
│                    │  │  ├─ marker.py    │  │  │
│                    │  │  ├─ mineru.py    │  │  │
│                    │  │  └─ pymupdf.py   │  │  │
│                    │  └──────────────────┘  │  │
│                    │  ┌──────────────────┐  │  │
│                    │  │ SQLite data.db   │  │  │
│                    │  └──────────────────┘  │  │
│                    └────────────────────────┘  │
└───────────────────────────────────────────────┘
```

**关键变化：**
- Marker 不再作为独立 HTTP 服务运行
- Marker 作为 Python 模块直接导入后端代码中
- 整个后端只有一个 `server.exe` 进程
- 解析引擎通过策略模式切换，共享同一个接口

---

## 三、PDF 解析引擎策略模式

```python
# backend/engines/base.py
class BaseEngine(ABC):
    @abstractmethod
    async def parse(self, pdf_path: str) -> ParseResult:
        """输入 PDF 路径，输出 Markdown + 图片 + 表格"""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """检查引擎是否可用（依赖是否安装、模型是否下载）"""
        pass

# backend/engines/marker_engine.py
class MarkerEngine(BaseEngine):
    async def parse(self, pdf_path: str) -> ParseResult:
        from marker.convert import convert_single_pdf
        from marker.models import load_all_models
        # ...调用 Marker 的 API
    
    def is_available(self) -> bool:
        try:
            import marker
            return True
        except ImportError:
            return False

# backend/engines/pymupdf_engine.py
class PyMuPDFEngine(BaseEngine):
    """轻量级备选引擎，不依赖 ML 模型"""
    async def parse(self, pdf_path: str) -> ParseResult:
        import fitz  # PyMuPDF
        # ...基础文本提取
    
    def is_available(self) -> bool:
        try:
            import fitz
            return True
        except ImportError:
            return False

# backend/engines/manager.py
class EngineManager:
    def __init__(self):
        self.engines = {
            "marker": MarkerEngine(),
            "pymupdf": PyMuPDFEngine(),
        }
    
    def get_engine(self, name: str) -> BaseEngine:
        engine = self.engines.get(name)
        if engine and engine.is_available():
            return engine
        # 降级到可用的引擎
        for e in self.engines.values():
            if e.is_available():
                return e
        raise NoEngineAvailableError()
```

---

## 四、Marker 按需安装方案

### 用户首次使用时的体验

```
1. 用户安装 PaperLens（~217MB 安装包）
2. 打开应用，上传论文
3. 系统检测 Marker 未安装
4. 弹出提示：
   ┌──────────────────────────────────────┐
   │ 📄 安装 PDF 解析引擎                  │
   │                                      │
   │ Marker 是推荐的 PDF 解析引擎，       │
   │ 可以将论文高质量转为 Markdown。       │
   │                                      │
   │ 需要下载约 1.5 GB 的模型文件。       │
   │ 预计下载时间：5-10 分钟              │
   │                                      │
   │ [立即安装]  [稍后安装]  [使用轻量模式]│
   └──────────────────────────────────────┘
5. 点击「立即安装」→ 后台自动执行：
   pip install marker-pdf
   → 自动下载 ML 模型到 ~/.cache/marker/
6. 安装完成 → 开始解析论文

如果选择「使用轻量模式」：
  → 使用内置的 PyMuPDF 引擎（已包含在安装包中）
  → 基础文本提取，无 ML 模型，速度快但质量一般
  → 随时可在设置中安装 Marker 升级
```

### 后端实现

```python
# backend/services/marker_installer.py
import subprocess
import asyncio

class MarkerInstaller:
    INSTALL_DIR = Path.home() / ".paperlens" / "marker"
    
    async def is_installed(self) -> bool:
        """检查 Marker 是否已安装"""
        try:
            result = subprocess.run(
                ["pip", "show", "marker-pdf"],
                capture_output=True, text=True
            )
            return result.returncode == 0
        except:
            return False
    
    async def install(self, progress_callback=None):
        """安装 Marker + 下载模型"""
        # 1. pip install marker-pdf
        process = await asyncio.create_subprocess_exec(
            "pip", "install", "marker-pdf",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        # 2. 预下载模型（避免首次解析时等待）
        process = await asyncio.create_subprocess_exec(
            "python", "-c", "from marker.models import load_all_models; load_all_models()"
        )
        await process.wait()
    
    async def get_install_progress(self) -> dict:
        """返回安装进度"""
        # 检查 pip 安装状态和模型下载状态
        pass
```

### API 端点

```
GET  /system/engines          → 列出所有引擎及可用状态
POST /system/engines/marker/install   → 触发 Marker 安装
GET  /system/engines/marker/install/status → 查询安装进度
```

---

## 五、EXE 制作完整流程

### 你需要准备的环境

```bash
# 1. Node.js (用于前端构建和 Electron 打包)
# 下载安装: https://nodejs.org/ (LTS 版本)
node --version  # 确认 >= 18

# 2. Python 3.10+ (用于后端)
# 下载安装: https://www.python.org/
python --version  # 确认 >= 3.10

# 3. Git (用于版本管理)
git --version
```

### 项目目录结构（最终版）

```
paper-reader/
├── frontend/                   # React + Electron 前端
│   ├── src/                    # React 源码
│   ├── electron/               # Electron 主进程代码
│   │   ├── main.ts             # Electron 入口
│   │   ├── preload.ts          # preload 脚本
│   │   └── backend-launcher.ts # 启动/管理后端子进程
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   ├── electron-builder.yml    # Electron 打包配置
│   └── tsconfig.json
│
├── backend/                    # Python 后端（单进程）
│   ├── main.py                 # FastAPI 入口
│   ├── requirements.txt        # Python 依赖
│   ├── api/                    # API 路由
│   │   ├── papers.py
│   │   ├── translate.py
│   │   ├── conversations.py
│   │   ├── models.py
│   │   ├── settings.py
│   │   ├── notes.py
│   │   ├── glossary.py
│   │   └── system.py
│   ├── engines/                # PDF 解析引擎（策略模式）
│   │   ├── __init__.py
│   │   ├── base.py             # 抽象基类
│   │   ├── marker_engine.py    # Marker 引擎
│   │   ├── pymupdf_engine.py   # PyMuPDF 引擎（轻量备选）
│   │   └── manager.py          # 引擎管理器
│   ├── services/               # 业务逻辑
│   │   ├── db.py               # 数据库操作
│   │   ├── ai.py               # AI 翻译/对话
│   │   ├── parser.py           # PDF 解析调度
│   │   └── marker_installer.py # Marker 安装器
│   ├── models/                 # 数据模型 (Pydantic)
│   │   └── schemas.py
│   └── paperlens.spec          # PyInstaller 打包配置
│
├── database/                   # 数据库相关
│   ├── DESIGN.md
│   ├── migrations/             # SQL 迁移文件
│   │   └── 001_initial.sql
│   └── init_db.py              # 数据库初始化脚本
│
├── scripts/                    # 构建脚本
│   ├── build-backend.sh        # 打包后端 exe
│   ├── build-frontend.sh       # 打包前端 + Electron
│   └── build-all.sh            # 一键打包
│
└── paper-reader-design.html    # UI 设计文档
```

### 开发阶段（日常开发）

```bash
# 终端 1：启动后端（热重载）
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8765 --reload

# 终端 2：启动前端（热重载）
cd frontend
npm install
npm run dev

# 如果需要 Marker 解析能力：
pip install marker-pdf
# 首次安装会自动下载模型（约 1.5GB）
```

**注意：开发时不需要启动单独的 Marker 服务。Marker 作为 Python 模块直接被后端 import 调用。**

### 打包阶段（制作 EXE）

#### 步骤 1：打包 Python 后端为 exe

```bash
cd backend

# 安装 PyInstaller
pip install pyinstaller

# 打包（排除 Marker 和 PyTorch，减小体积）
pyinstaller \
  --name server \
  --onefile \
  --hidden-import=uvicorn.logging \
  --hidden-import=uvicorn.lifespan \
  --hidden-import=uvicorn.protocols.http \
  --hidden-import=uvicorn.protocols.websockets \
  --hidden-import=aiofiles \
  --exclude-module=torch \
  --exclude-module=marker \
  --exclude-module=transformers \
  --add-data "migrations:migrations" \
  main.py

# 产出: dist/server.exe (~50MB)
```

#### 步骤 2：构建前端 + Electron

```bash
cd frontend

# 构建前端
npm run build

# 复制后端 exe 到 resources
cp ../backend/dist/server.exe resources/server.exe

# 打包 Electron
npx electron-builder --win --x64

# 产出: release/PaperLens Setup x.x.x.exe (~217MB)
```

#### electron-builder.yml 配置

```yaml
appId: com.paperlens.app
productName: PaperLens
directories:
  output: release
  buildResources: build
files:
  - dist/**/*
  - electron/**/*
extraResources:
  - from: resources/server.exe
    to: backend/server.exe
win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  installerHeaderIcon: build/icon.ico
  createDesktopShortcut: true
  shortcutName: PaperLens
```

#### Electron 主进程：启动后端

```typescript
// electron/backend-launcher.ts
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';

let backendProcess: ChildProcess | null = null;

export function launchBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(
      process.resourcesPath, 'backend', 'server.exe'
    );
    
    backendProcess = spawn(serverPath, [], {
      env: {
        ...process.env,
        PAPERLENS_DATA_DIR: path.join(app.getPath('userData'), 'data'),
        PAPERLENS_PAPERS_DIR: path.join(app.getPath('userData'), 'papers'),
      }
    });

    // 等待后端就绪
    const checkHealth = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:8765/api/v1/system/health');
        if (res.ok) {
          clearInterval(checkHealth);
          resolve();
        }
      } catch {}
    }, 500);

    // 超时处理
    setTimeout(() => {
      clearInterval(checkHealth);
      reject(new Error('Backend failed to start'));
    }, 30000);
  });
}

export function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}
```

---

## 六、300MB 限制的注意事项清单

### ✅ 必须做的

1. **Electron 使用 NSIS 压缩安装包**（比 portable zip 小 30%）
2. **PyInstaller 排除 ML 相关模块**：`--exclude-module=torch --exclude-module=marker --exclude-module=transformers`
3. **前端只打包生产构建**：`npm run build` 后的 dist 目录
4. **不要打包 node_modules**：Electron Builder 默认不会
5. **图片资源