# PaperLens 前端设计

## 技术栈

| 组件 | 选型 | 版本 | 说明 |
|------|------|------|------|
| **框架** | React | 18.x | UI 框架 |
| **语言** | TypeScript | 5.x | 类型安全 |
| **构建** | Vite | 5.x | 快速构建 |
| **样式** | Tailwind CSS | 3.x | 原子化 CSS |
| **路由** | React Router | 6.x | 页面路由 |
| **状态** | Zustand | 4.x | 轻量状态管理 |
| **PDF** | PDF.js | 4.x | PDF 渲染 |
| **Markdown** | react-markdown | 9.x | Markdown 渲染 |
| **HTTP** | ky | 1.x | 轻量 HTTP 客户端 |
| **桌面** | Electron | 30.x | 桌面壳 |
| **图标** | lucide-react | - | 图标库 |

---

## 项目结构

```
frontend/
├── public/
│   └── pdf.worker.js          # PDF.js worker
├── src/
│   ├── main.tsx                # 入口
│   ├── App.tsx                 # 根组件 + 路由
│   ├── vite-env.d.ts
│   │
│   ├── api/                    # API 层
│   │   ├── client.ts           # HTTP 客户端封装 (ky)
│   │   ├── papers.ts           # 论文相关 API
│   │   ├── translate.ts        # 翻译 API (含 SSE)
│   │   ├── conversations.ts    # 对话 API (含 SSE)
│   │   ├── models.ts           # 模型管理 API
│   │   ├── settings.ts         # 设置 API
│   │   ├── notes.ts            # 笔记 API
│   │   ├── glossary.ts         # 术语 API
│   │   └── types.ts            # API 类型定义
│   │
│   ├── stores/                 # Zustand 状态管理
│   │   ├── usePaperStore.ts    # 论文库状态
│   │   ├── useReaderStore.ts   # 阅读器状态 (当前页、缩放、同步滚动)
│   │   ├── useQAStore.ts       # Q&A 侧边栏状态
│   │   ├── useSettingsStore.ts # 设置状态
│   │   └── useUIStore.ts       # UI 状态 (侧边栏展开、主题)
│   │
│   ├── pages/                  # 页面组件
│   │   ├── Library/            # 论文库页
│   │   │   ├── index.tsx
│   │   │   ├── PaperCard.tsx
│   │   │   ├── PaperGrid.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── UploadModal.tsx
│   │   │   └── ImportUrlModal.tsx
│   │   │
│   │   ├── Reader/             # 阅读工作台页
│   │   │   ├── index.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── PDFPanel.tsx         # 左栏 PDF
│   │   │   ├── TranslationPanel.tsx  # 右栏翻译
│   │   │   ├── ProgressRail.tsx      # 中间进度条
│   │   │   ├── StatusBar.tsx
│   │   │   ├── SelectionPopup.tsx    # 文本选中浮动栏
│   │   │   ├── FigureViewer.tsx      # 图片放大查看
│   │   │   └── TOCPanel.tsx          # 目录面板
│   │   │
│   │   └── Settings/           # 设置页
│   │       ├── index.tsx
│   │       ├── ModelSettings.tsx
│   │       ├── TranslateSettings.tsx
│   │       ├── QASettings.tsx
│   │       ├── ReadingSettings.tsx
│   │       ├── ParseSettings.tsx
│   │       └── DataSettings.tsx
│   │
│   ├── components/             # 共享组件
│   │   ├── qa/                 # Q&A 侧边栏
│   │   │   ├── QASidebar.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── InputArea.tsx
│   │   │   ├── CitationCard.tsx
│   │   │   ├── ToolCallBadge.tsx
│   │   │   ├── HistoryDropdown.tsx
│   │   │   └── QuickActions.tsx
│   │   │
│   │   ├── notes/              # 笔记面板
│   │   │   ├── NotesPanel.tsx
│   │   │   ├── NoteCard.tsx
│   │   │   └── NoteInput.tsx
│   │   │
│   │   ├── glossary/           # 术语速查
│   │   │   └── TermPopup.tsx
│   │   │
│   │   ├── search/             # 搜索面板
│   │   │   └── SearchPanel.tsx
│   │   │
│   │   └── common/             # 通用组件
│   │       ├── Modal.tsx
│   │       ├── Dropdown.tsx
│   │       ├── Toggle.tsx
│   │       ├── Slider.tsx
│   │       ├── Skeleton.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorBanner.tsx
│   │       └── Tooltip.tsx
│   │
│   ├── hooks/                  # 自定义 Hooks
│   │   ├── useSyncScroll.ts    # 同步滚动逻辑
│   │   ├── useTranslation.ts   # 渐进式翻译逻辑
│   │   ├── useTextSelection.ts # 文本选中逻辑
│   │   ├── useSSE.ts           # SSE 流式连接
│   │   ├── useDebounce.ts      # 防抖
│   │   ├── useKeyboard.ts      # 快捷键
│   │   └── useReadingPosition.ts # 阅读位置记忆
│   │
│   ├── lib/                    # 工具函数
│   │   ├── pdf.ts              # PDF.js 封装
│   │   ├── markdown.ts         # Markdown 渲染配置
│   │   ├── sse.ts              # SSE 解析工具
│   │   └── constants.ts        # 常量
│   │
│   └── styles/
│       └── globals.css         # Tailwind 入口 + 全局样式
│
├── electron/                   # Electron 主进程
│   ├── main.ts                 # 主进程入口
│   ├── preload.ts              # preload 脚本
│   └── backend-launcher.ts     # 启动 Python 后端
│
├── index.html
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
├── electron-builder.yml        # Electron 打包配置
└── package.json
```

---

## 路由设计

```typescript
// App.tsx
const routes = [
  { path: '/',              element: <Library /> },
  { path: '/reader/:id',    element: <Reader /> },
  { path: '/settings',      element: <Settings /> },
];
```

---

## 状态管理设计

### usePaperStore — 论文库

```typescript
interface PaperStore {
  papers: Paper[];
  loading: boolean;
  filter: 'all' | 'favorite' | 'recent' | 'translated' | 'translating' | 'untranslated';
  sort: 'created_at' | 'last_read_at' | 'title';
  search: string;
  tags: Tag[];
  activeTag: string | null;

  fetchPapers: () => Promise<void>;
  uploadPaper: (file: File) => Promise<Paper>;
  importFromUrl: (url: string) => Promise<Paper>;
  deletePaper: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  setFilter: (filter: string) => void;
  setSort: (sort: string) => void;
  setSearch: (search: string) => void;
}
```

### useReaderStore — 阅读器

```typescript
interface ReaderStore {
  paper: Paper | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  syncScroll: boolean;
  panelRatio: '1:1' | '6:4' | '4:6';
  pdfDisplayMode: 'original' | 'dark' | 'sepia';

  pages: Map<number, PageContent>;
  translations: Map<number, TranslationContent>;
  translationStatus: Map<number, 'pending' | 'translating' | 'done' | 'failed'>;

  outline: OutlineItem[];
  highlights: Highlight[];
  bookmarks: Bookmark[];

  fetchPaper: (id: string) => Promise<void>;
  goToPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  toggleSyncScroll: () => void;
  triggerTranslation: (page: number) => void;
  addHighlight: (hl: NewHighlight) => Promise<void>;
  addBookmark: (bm: NewBookmark) => Promise<void>;
  saveReadingPosition: (page: number, scroll: number) => void;
}
```

### useQAStore — Q&A 侧边栏

```typescript
interface QAStore {
  isOpen: boolean;
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isGenerating: boolean;
  citations: Citation[];
  selectedModel: Model | null;

  toggleSidebar: () => void;
  createConversation: () => Promise<Conversation>;
  switchConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopGeneration: () => void;
  addCitation: (citation: Citation) => void;
  removeCitation: (index: number) => void;
  setSelectedModel: (model: Model) => void;
}
```

### useSettingsStore — 设置

```typescript
interface SettingsStore {
  settings: Record<string, any>;
  models: Model[];
  loading: boolean;

  fetchSettings: () => Promise<void>;
  updateSettings: (patch: Record<string, any>) => Promise<void>;
  fetchModels: () => Promise<void>;
  createModel: (model: NewModel) => Promise<Model>;
  testModel: (id: string) => Promise<TestResult>;
  deleteModel: (id: string) => Promise<void>;
  setDefaultModel: (id: string, type: 'translate' | 'chat') => Promise<void>;
}
```

---

## 核心 Hooks 设计

### useSyncScroll — 同步滚动

```typescript
function useSyncScroll(
  leftRef: RefObject<HTMLElement>,
  rightRef: RefObject<HTMLElement>,
  enabled: boolean
) {
  // 基于页码映射同步，非像素级
  // 滚动事件节流 (requestAnimationFrame)
  // 主动滚动时暂停另一栏 200ms 避免冲突
  // 返回: { scrollToPage: (page: number) => void }
}
```

### useTranslation — 渐进式翻译

```typescript
function useTranslation(paperId: string) {
  // IntersectionObserver 监听页面进入视口
  // 页面进入视口 50% 时触发翻译
  // 预加载下一页
  // 检查缓存避免重复翻译
  // SSE 流式接收翻译结果
  // 返回: { translatePage, translationStatus, cancelTranslation }
}
```

### useTextSelection — 文本选中

```typescript
function useTextSelection(containerRef: RefObject<HTMLElement>) {
  // 监听 mouseup 事件
  // 获取选中文本和位置信息
  // 计算浮动操作栏位置
  // 双击触发术语速查
  // 返回: { selectedText, selectionRect, clearSelection }
}
```

### useSSE — 流式连接

```typescript
function useSSE(url: string, options: RequestInit) {
  // 建立 SSE 连接
  // 解析 event/data
  // 支持 tool_call / chunk / done / error 事件
  // 支持 abort (停止生成)
  // 返回: { data, error, isLoading, abort }
}
```

---

## 页面组件详细设计

### Library 页面

```
Library/
├── index.tsx          # 页面容器，组合 Sidebar + 主内容区
├── Sidebar.tsx        # 左侧导航栏 (分类/标签/设置)
├── PaperGrid.tsx      # 论文卡片网格 (含上传卡片)
├── PaperCard.tsx      # 单个论文卡片
├── UploadModal.tsx    # 上传弹窗 (本地文件 + URL 导入 Tab)
└── ImportUrlModal.tsx # URL 导入表单
```

**交互流程:**
1. 页面加载 → `usePaperStore.fetchPapers()`
2. 点击卡片 → `navigate('/reader/${paper.id}')`
3. 拖拽 PDF → 触发 `UploadModal` → `uploadPaper(file)`
4. 搜索 → `setSearch(query)` → 实时过滤

### Reader 页面

```
Reader/
├── index.tsx              # 页面容器，管理整体布局
├── Toolbar.tsx            # 顶部工具栏
├── PDFPanel.tsx           # 左栏 PDF (PDF.js 渲染)
├── TranslationPanel.tsx   # 右栏翻译 (Markdown 渲染)
├── ProgressRail.tsx       # 中间进度条
├── StatusBar.tsx          # 底部状态栏
├── SelectionPopup.tsx     # 文本选中浮动操作栏
├── FigureViewer.tsx       # 图片放大查看器 (全屏遮罩)
└── TOCPanel.tsx           # 目录导航面板 (左侧滑出)
```

**交互流程:**
1. 页面加载 → `useReaderStore.fetchPaper(id)` → 加载 PDF + 解析内容
2. 滚动 → `useSyncScroll` 同步左右栏
3. 页面进入视口 → `useTranslation` 触发翻译
4. 选中文本 → `useTextSelection` → 显示 `SelectionPopup`
5. 双击单词 → 术语速查 `TermPopup`
6. 点击图表 → `FigureViewer` 放大查看
7. 每 5 秒 → `saveReadingPosition(page, scroll)`

### Settings 页面

```
Settings/
├── index.tsx              # 页面容器，左侧导航 + 右侧内容
├── ModelSettings.tsx      # 模型管理 (卡片列表 + 添加/编辑/删除/测试)
├── TranslateSettings.tsx  # 翻译设置 (默认模型/语言/风格/开关)
├── QASettings.tsx         # 问答设置 (默认模型/温度/系统提示词)
├── ReadingSettings.tsx    # 阅读设置 (字体/行距/主题/比例/同步)
├── ParseSettings.tsx      # PDF 解析设置 (引擎/地址/兜底模型)
└── DataSettings.tsx       # 数据管理 (统计/清除/导出/导入)
```

---

## Q&A 侧边栏组件

```
qa/
├── QASidebar.tsx        # 侧边栏容器 (展开/收起动画)
├── MessageList.tsx      # 消息列表 (滚动条 + 自动滚底)
├── MessageBubble.tsx    # 单条消息 (用户/AI 不同样式)
├── InputArea.tsx        # 输入区域 (引用预览 + 输入框 + 发送)
├── CitationCard.tsx     # 引用卡片 (可移除)
├── ToolCallBadge.tsx    # 工具调用标签 (可展开)
├── HistoryDropdown.tsx  # 历史对话下拉列表
└── QuickActions.tsx     # 快捷操作按钮组
```

**MessageList 滚动条设计:**
```typescript
// 自动滚底逻辑
const shouldAutoScroll = useRef(true);

useEffect(() => {
  if (shouldAutoScroll.current) {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }
}, [messages]);

// 用户手动上滚时暂停自动滚动
const handleScroll = () => {
  const { scrollTop, scrollHeight, clientHeight } = listRef.current;
  const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
  shouldAutoScroll.current = isNearBottom;
  setShowScrollButton(!isNearBottom);
};
```

---

## 关键交互流程

### 1. 上传论文 → 进入阅读

```
用户拖拽 PDF
  → UploadModal 打开
  → POST /papers/upload (multipart)
  → 返回 paper_id + parse_job_id
  → 轮询 GET /parse/{id}/status
  → 解析完成 → navigate('/reader/{id}')
  → Reader 加载 PDF.js + 获取解析内容
  → 滚动触发渐进式翻译
```

### 2. 选中文本 → 添加到对话

```
用户在 PDF/翻译面板选中文本
  → useTextSelection 捕获选区
  → SelectionPopup 出现在选区上方
  → 点击「添加到对话」
  → useQAStore.addCitation({text, page, paragraph})
  → Q&A 侧边栏自动展开 (如果未展开)
  → InputArea 显示引用预览卡片
  → 输入框获得焦点
```

### 3. 发送消息 → 流式回复

```
用户输入问题 + 点击发送
  → useQAStore.sendMessage(content)
  → POST /conversations/{id}/messages (SSE)
  → isGenerating = true, 发送按钮变为「停止」
  → 接收 tool_call 事件 → 显示 ToolCallBadge
  → 接收 chunk 事件 → 逐字追加到 MessageBubble
  → 接收 done 事件 → isGenerating = false
  → 消息保存到 messages 列表
  → 自动滚到底部
```

### 4. 双击单词 → 术语速查

```
用户双击单词
  → useTextSelection 检测到 dblclick
  → GET /glossary/lookup?term=xxx
  → TermPopup 出现在单词上方
  → 显示: 音标 + 翻译 + 解释
  → 点击「深入提问」→ 添加到 Q&A 引用
  → 点击「收藏术语」→ 加入术语表
  → 点击空白处 → TermPopup 关闭
```

---

## Electron 集成

### main.ts (主进程)

```typescript
import { app, BrowserWindow } from 'electron';
import { launchBackend, stopBackend } from './backend-launcher';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  // 1. 启动后端子进程（只有一个 server.exe）
  await launchBackend();

  // 2. 创建窗口，加载前端
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });

  // 开发模式加载 Vite dev server，生产模式加载构建产物
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
});

app.on('window-all-closed', () => {
  stopBackend();  // 关闭后端子进程
  app.quit();
});
```

### backend-launcher.ts

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';

let backendProcess: ChildProcess | null = null;

export async function launchBackend(): Promise<void> {
  // 开发模式：直接运行 Python
  // 生产模式：运行 PyInstaller 打包的 server.exe
  const isDev = process.env.NODE_ENV === 'development';
  const cmd = isDev ? 'python' : path.join(process.resourcesPath, 'backend', 'server.exe');
  const args = isDev ? ['-m', 'uvicorn', 'main:app', '--port', '8765'] : [];

  backendProcess = spawn(cmd, args, {
    cwd: isDev ? path.join(__dirname, '../../backend') : undefined,
    env: {
      ...process.env,
      PAPERLENS_DATA_DIR: path.join(app.getPath('userData'), 'data'),
      PAPERLENS_PAPERS_DIR: path.join(app.getPath('userData'), 'papers'),
    }
  });

  // 轮询健康检查，等待后端就绪
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch('http://localhost:8765/api/v1/system/health');
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Backend failed to start within 30s');
}

export function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}
```

### preload.ts

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  onBackendReady: (cb: () => void) => ipcRenderer.on('backend-ready', cb),
});
```

---

## EXE 打包方案

### 打包结构

```
PaperLens/
├── PaperLens.exe              # Electron 主程序
├── resources/
│   ├── app.asar               # 前端打包
│   └── backend/
│       └── server.exe         # PyInstaller 打包的后端（含 PyMuPDF 引擎）
└── uninstall.exe
```

**注意：只有一个 `server.exe`，没有独立的 Marker 服务进程。**
Marker 作为 Python 模块内嵌在后端中，按需安装。详见 [EXE-EVALUATION.md](../EXE-EVALUATION.md)。

### 开发阶段

```bash
# 终端 1：启动后端（热重载）
cd backend
pip install -r requirements.txt
uvicorn main:app --port 8765 --reload

# 终端 2：启动前端（热重载）
cd frontend
npm install
npm run dev

# 可选：安装 Marker 引擎（首次安装会下载 ~1.5GB 模型）
pip install marker-pdf
```

**不需要启动任何额外的 Marker 服务。**

### 打包 EXE（发布阶段）

```bash
# 步骤 1：打包后端（排除 Marker 和 PyTorch）
cd backend
pyinstaller --name server --onefile \
  --exclude-module=torch --exclude-module=marker --exclude-module=transformers \
  main.py

# 步骤 2：构建前端 + Electron
cd frontend
npm run build
cp ../backend/dist/server.exe resources/server.exe
npx electron-builder --win --x64

# 产出: release/PaperLens Setup x.x.x.exe (~217MB)
```

---

## 性能优化策略

| 场景 | 策略 |
|------|------|
| PDF 渲染 | PDF.js worker 线程，离屏渲染，只渲染视口内页面 |
| 翻译缓存 | 内存 Map + IndexedDB 双层缓存 |
| 消息列表 | 虚拟滚动 (react-virtuoso)，超过 100 条消息时启用 |
| 搜索 | 300ms 防抖，后端 FTS5 全文索引 |
| 图片 | 懒加载，IntersectionObserver |
| 状态更新 | Zustand selector 精确订阅，避免不必要的重渲染 |
