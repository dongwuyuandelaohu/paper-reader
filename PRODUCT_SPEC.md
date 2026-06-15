# PaperLens Reader v2 - 产品设计规格文档

> 版本: 2.0 | 更新日期: 2026-06-10

---

## 1. 产品概述

PaperLens 是一款学术论文双语阅读工具。本文档聚焦于 **Reader（论文阅读页）** 的全面重构，涵盖 PDF 原始渲染、智能解析、AI 翻译、多模型问答四大核心模块的交互设计与技术规格。

---

## 2. 页面布局架构

### 2.1 整体布局

```
┌─────────────────────────────────────────────────────────┐
│  Toolbar (44px, 固定顶部)                                │
├─────┬──────────────────────┬──────────┬────────────────┤
│ TOC │                      │          │                │
│ 目录 │   PDF Panel          │  Parse   │   Q&A          │
│ 导航 │   (原始 PDF 渲染)    │  Panel   │   Panel        │
│     │                      │  解析面板 │   问答面板      │
│220px│   flex / 60%         │  flex/40%│   380px        │
│可折叠│                      │  可拖拽   │   可拖拽        │
│     │                      │  可收起   │   可收起        │
└─────┴──────────────────────┴──────────┴────────────────┘
```

### 2.2 三种布局状态

| 状态 | 触发条件 | PDF 宽度 | Parse 面板 | Q&A 面板 |
|------|----------|----------|-----------|---------|
| **全屏 PDF** | 论文未解析，未打开解析/问答 | 100% | 隐藏 | 隐藏 |
| **双栏阅读** | 论文已解析，或触发解析后 | ~60% | ~40% (可拖拽) | 隐藏 |
| **三栏阅读** | 同时打开解析 + 问答 | 按比例分配 | 可拖拽 | 可拖拽 |

**布局计算规则：**
- TOC 折叠后释放宽度
- Parse 和 Q&A 面板展开后，剩余空间按 PDF:Parse = 60:40 分配
- 三栏时 PDF 取最小 30%，Parse 和 Q&A 各最小 240px，其余按比例分配
- 面板收起使用 `width: 0; overflow: hidden; transition: width 0.3s ease`

---

## 3. PDF 面板 (原始 PDF 渲染)

### 3.1 核心要求

**使用 pdfjs-dist 渲染原始 PDF 文件**，而非解析后的 Markdown 文本。

### 3.2 功能规格

| 功能 | 实现方式 | 交互细节 |
|------|----------|----------|
| **渲染** | `pdfjs-dist` 加载 PDF，Canvas 渲染每页 | 按当前页码渲染单页，翻页时重新渲染 |
| **缩放** | Canvas scale + CSS transform | 滚轮缩放 (Ctrl/Cmd + 滚轮)，工具栏 +/- 按钮，适应宽度按钮 |
| **拖动平移** | mousedown + mousemove 实现拖拽 | 缩放 > 100% 时启用拖动，cursor 变为 `grab` / `grabbing` |
| **滚动翻页** | 鼠标滚轮到达底部/顶部时翻页 | 滚动到页面顶部继续上滚 → 上一页；滚动到底部继续下滚 → 下一页 |
| **页码跳转** | 工具栏输入框输入页码回车 | 直接跳转到指定页 |
| **上/下页按钮** | 工具栏 ChevronLeft / ChevronRight | 到达边界时按钮置灰 |
| **键盘快捷键** | 全局 keydown 监听 | `←/→` 翻页，`+/-` 缩放，`0` 重置缩放，`Space` 下一页 |

### 3.3 工具栏布局 (44px)

```
┌──────┬────────────┬─────────────────────────┬──────────────┬──────────────┐
│ ← 返回│ 论文标题    │   ⊖ 100% ⊕ ⊡   ◂ [1] / 15 ▸  │ 目录 │ 解析 │ 问答 │
└──────┴────────────┴─────────────────────────┴──────────────┴──────────────┘
  Left              Center: zoom + page nav                      Right
```

### 3.4 全屏 PDF 模式

- 当论文 **未解析** 且 **未打开** 解析/问答面板时，PDF 面板占满主区域 100% 宽度
- PDF 页面居中显示，两侧留白，页面有投影 `box-shadow: 0 2px 24px rgba(0,0,0,0.35)`
- 底部显示页码指示器：`— 1 —`

### 3.5 后端接口依赖

```
GET  /api/v1/papers/{paper_id}/file     → PDF 二进制文件
PUT  /api/v1/papers/{paper_id}/reading-position  → 保存阅读位置
```

---

## 4. 解析面板 (Parse Panel)

### 4.1 解析流程

#### 4.1.1 未解析论文 → 触发解析

```
步骤 1: 用户点击工具栏「解析」按钮
        ↓
步骤 2: 弹出解析引擎选择 Modal (PyMuPDF / Marker / MinerU)
        ↓
步骤 3: 用户选择引擎，点击「开始解析」
        ↓
步骤 4: 动画过渡
        - PDF 面板平滑收缩至左侧 60% (transition: width 0.4s cubic-bezier)
        - 右侧 40% 展开解析面板
        ↓
步骤 5: 解析面板显示「解析中」加载动画
        - 居中显示骨架屏 + 动态透明度脉冲 (opacity 0.4 → 1 → 0.4, 循环)
        - 显示进度条和百分比 (轮询 /parse/status)
        - 字体偏小 (12px)，颜色 muted
        ↓
步骤 6: 解析完成
        - 加载动画淡出 (opacity → 0, 200ms)
        - 解析内容淡入 (opacity 0 → 1, 300ms)
        - 渲染完整解析结果
```

#### 4.1.2 已解析论文 → 直接展示

```
打开论文 → 检测 parse_status === 'parsed'
         → 自动以 60/40 布局展示
         → 左侧 PDF，右侧解析内容
```

#### 4.1.3 切换引擎重新解析

```
用户点击工具栏「解析」→ 选择不同引擎 → 点击「开始解析」
→ 右侧面板切换为「解析中」加载动画
→ 解析完成后替换为新结果
```

### 4.2 解析内容渲染

#### 4.2.1 核心要求

**一比一复刻原始 PDF 内容**，支持：
- Markdown 完整渲染 (h1-h6, 段落, 列表, 引用, 代码块)
- **图片**: 使用 `<img>` 标签，src 指向 `/api/v1/parse/{paper_id}/images/{filename}`，保持原始尺寸比例，最大宽度 100%
- **表格**: 使用 `<table>` 渲染，带表头背景色和单元格边框，完整保留列对齐
- **数学公式**: 使用 KaTeX 渲染 `$$...$$` 和 `$...$`
- **代码块**: 带语法高亮的 `<pre><code>` 块

#### 4.2.2 Chunk 结构

每页解析结果为 **一个 Chunk**（不再拆分为多个 chunk），Chunk 头部包含：

```
┌─────────────────────────────────────────────────┐
│ 第 X 页                                          │
│                                    [翻译成中文]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  (完整 Markdown 渲染内容)                         │
│  - 标题、段落、图片、表格、公式                     │
│  - 图片正常显示                                   │
│  - 表格带完整样式                                 │
│                                                 │
├─────────────────────────────────────────────────┤
│ ▸ 翻译结果 (折叠区)                               │
│  GPT-4o · 1,200 tokens        [重新翻译]         │
│                                                 │
│  (翻译后的中文内容)                                │
└─────────────────────────────────────────────────┘
```

#### 4.2.3 Chunk 翻译按钮

- 位置：Chunk 头部右上角
- 默认状态：`翻译成中文` (coral 色边框按钮)
- 点击后：SSE 流式翻译，按钮变为 spinner + `翻译中...`
- 翻译完成：翻译区域展开，按钮变为 `隐藏翻译`
- 翻译区域内提供 `重新翻译` 按钮

#### 4.2.4 解析视图切换

解析面板头部提供 Toggle：
- **解析文** (默认): 显示原始英文解析内容
- **翻译文**: 显示翻译后的中文内容 (如已翻译)

### 4.3 解析面板可拖拽调整宽度

详见 §7 可拖拽面板。

### 4.4 后端接口依赖

```
POST /api/v1/parse/{paper_id}/parse           → 触发解析 (body: { engine })
GET  /api/v1/parse/{paper_id}/parse/status     → 轮询解析状态
GET  /api/v1/parse/{paper_id}/pages            → 获取所有解析页面
GET  /api/v1/parse/{paper_id}/pages/{page}     → 获取单页解析结果
GET  /api/v1/parse/{paper_id}/images/{filename} → 获取解析图片
GET  /api/v1/system/engines                    → 获取可用引擎列表
POST /api/v1/translate/{paper_id}/pages/{page} → SSE 流式翻译
```

---

## 5. AI 问答面板 (Q&A Panel)

### 5.1 模型切换

#### 5.1.1 需求

用户可以在问答过程中 **实时切换 AI 模型**，同时保持对话上下文不变。

#### 5.1.2 交互设计

```
┌──────────────────────────────────────────┐
│ 论文问答     [GPT-4o ▾]   + 新对话    × │  ← 模型名称是可点击的下拉选择器
├──────────────────────────────────────────┤
│  [总结核心贡献] [解释方法] [实验结果]      │  ← 快捷问题 (pill 按钮)
├──────────────────────────────────────────┤
│                                          │
│  消息区域                                 │
│  ...                                     │
│                                          │
├──────────────────────────────────────────┤
│  [输入框...]                     [发送]   │
│  📎 添加图片                              │  ← 图片附件区
├──────────────────────────────────────────┤
│  基于论文全文回答 · 当前模型: GPT-4o      │
└──────────────────────────────────────────┘
```

#### 5.1.3 模型选择器 (Dropdown)

- 点击模型名称展开下拉列表
- 列表项显示：模型图标 + 名称 + 是否已验证 + 视觉能力标识 (👁)
- 切换模型时：
  - **不创建新对话**，在当前对话中切换 `model_id`
  - 前端 toast 提示：`已切换到 [模型名称]`
  - 后续消息使用新模型，历史消息保持不变
  - 对话上下文（所有历史消息）随请求一起发送，实现丝滑切换

#### 5.1.4 后端接口变更

需要新增后端接口或在现有 `sendMessage` 接口中增加 `model_id` 参数：

```
POST /api/v1/conversations/{conv_id}/messages
Body: {
  "content": "用户消息",
  "model_id": "新的模型ID",    ← 新增：可选，不传则使用对话创建时的模型
  "citations": [...],
  "images": [...]               ← 新增：图片附件列表
}
```

后端逻辑：收到 `model_id` 时，用该模型处理本次请求，不影响对话的默认模型设置。

### 5.2 图片支持 (Vision)

#### 5.2.1 模型配置新增字段

在模型管理中新增 `supports_vision` 布尔字段：

**后端变更：**
```sql
ALTER TABLE models ADD COLUMN supports_vision INTEGER DEFAULT 0;
```

**前端模型表单新增：**
```
┌─────────────────────────────────────┐
│ 添加模型                             │
├─────────────────────────────────────┤
│ 模型名称: [___________]             │
│ API Base URL: [___________]         │
│ API Key: [___________]              │
│ 模型 ID: [___________]              │
│                                     │
│ ☐ 支持图片理解 (Vision)             │  ← 新增 Toggle
│   勾选后可在问答中发送图片           │
└─────────────────────────────────────┘
```

**API 类型变更：**
```typescript
interface AIModel {
  // ...existing fields
  supports_vision: boolean  // 新增
}
```

#### 5.2.2 问答输入区图片功能

输入区支持三种方式添加图片：

| 方式 | 实现 | 交互 |
|------|------|------|
| **粘贴图片** | `onPaste` 事件监听 `clipboardData.items` | Ctrl+V 粘贴截图，显示缩略图预览 |
| **拖拽图片** | `onDrop` 事件处理 `DataTransfer` | 拖入图片文件，显示缩略图预览 |
| **点击添加** | 隐藏的 `<input type="file" accept="image/*">` | 点击 📎 图标选择图片 |

**图片预览区 (输入框上方)：**
```
┌──────────────────────────────────────────┐
│  [🖼️ 图1.jpg ×]  [🖼️ 图2.png ×]         │  ← 缩略图预览，可删除
├──────────────────────────────────────────┤
│  [输入您的问题...]               [发送]   │
└──────────────────────────────────────────┘
```

#### 5.2.3 不支持图片的模型提示

当用户尝试添加图片但当前模型 `supports_vision === false` 时：

1. **粘贴/拖入时**: 阻止操作，Toast 提示 `当前模型 [模型名] 不支持图片上传，请切换到支持 Vision 的模型`
2. **点击添加时**: 按钮置灰 + tooltip 提示，或在打开文件选择器后立即 Toast 提示
3. **输入区下方**: 显示黄色提示条 `当前模型不支持图片理解`

#### 5.2.4 图片发送实现

- 图片以 base64 编码存入消息的 `images` 字段
- SSE 发送时将图片作为 OpenAI Vision API 格式的 `image_url` content part
- 后端接收到图片后组装为多模态请求格式

**消息数据结构变更：**
```typescript
interface Message {
  // ...existing fields
  images?: ImageAttachment[]  // 新增
}

interface ImageAttachment {
  id: string
  name: string
  data: string  // base64
  mime_type: string
}
```

### 5.3 问答面板可拖拽调整宽度

详见 §7 可拖拽面板。

---

## 6. 目录侧边栏 (TOC)

### 6.1 功能

- 从已解析页面的 `headings` 数据生成目录树
- 支持 h1 / h2 / h3 三级缩进
- 每项右侧显示页码标签，点击跳转到对应页
- 当前页对应的目录项高亮 (coral 色)

### 6.2 交互

- 默认折叠 (width: 0)
- 工具栏「目录」按钮切换显示/隐藏
- 关闭按钮收起
- 过渡动画：`transition: width 0.25s ease`

---

## 7. 可拖拽面板 (Resizable Panels)

### 7.1 设计规格

解析面板和问答面板均支持 **拖拽调整宽度** 和 **收起**。

#### 7.1.1 拖拽手柄 (Resize Handle)

```
  PDF Panel  │◂▸│  Parse Panel
             ↑
         拖拽手柄
         4px 宽
```

- **位置**: 面板左边缘
- **宽度**: 4px
- **默认样式**: 透明 / `var(--border)` 色细线
- **悬停样式**: 
  - 宽度扩展为 6px
  - 背景变为 `var(--accent)` (高亮)
  - cursor 变为 `col-resize`
  - 过渡: `transition: all 0.15s`
- **拖拽中样式**: 
  - 背景 `var(--accent)` 不透明
  - cursor `col-resize`
  - 禁用文本选择 (`user-select: none`)
  - 面板宽度实时跟随鼠标

#### 7.1.2 拖拽约束

| 面板 | 最小宽度 | 最大宽度 | 默认宽度 |
|------|----------|----------|----------|
| Parse Panel | 280px | 60% 屏幕宽度 | 40% 剩余空间 |
| Q&A Panel | 280px | 50% 屏幕宽度 | 380px |

- 拖拽到小于最小宽度时自动吸附到最小值
- 拖拽到小于最小宽度的 50% 时触发收起

#### 7.1.3 收起/展开

- **收起方式**: 
  1. 拖拽到极小宽度自动收起
  2. 面板头部 × 按钮
  3. 工具栏对应按钮 toggle
- **收起动画**: `width → 0`, `transition: width 0.3s ease`
- **展开动画**: `width → 目标值`, `transition: width 0.3s ease`

### 7.2 技术实现

```typescript
// 自定义 Hook
function useResizable(defaultWidth: number, min: number, max: number) {
  // 返回: { width, isResizing, handleRef, handlers }
  // mousedown → 记录起始位置
  // mousemove → 计算 delta，更新 width (clamp to min/max)
  // mouseup → 结束拖拽
  // 拖拽到 < min * 0.5 时触发 onCollapse
}
```

---

## 8. 解析引擎选择 Modal

### 8.1 设计

```
┌──────────────────────────────────────────┐
│ 选择解析引擎                          ×  │
├──────────────────────────────────────────┤
│                                          │
│  ○ PyMuPDF         [内置] [v1.24.0]     │
│    轻量级文本提取，无需 ML 模型 · 15 MB   │
│                                          │
│  ● Marker          [已安装] [v0.18.0]   │
│    高质量 PDF→Markdown，表格/公式/图片    │
│                                          │
│  ○ MinerU          [已安装] [v1.2.0]    │
│    高质量复杂版面解析，公式/表格           │
│                                          │
├──────────────────────────────────────────┤
│            [取消]     [开始解析]          │
└──────────────────────────────────────────┘
```

### 8.2 行为

- 不可用的引擎 (未安装) 显示为灰色 + `安装` 按钮
- 当前引擎显示 `默认` 标签
- 重新解析时保留上次选择的引擎
- 弹窗有半透明背景遮罩

---

## 9. 状态管理设计

### 9.1 useReaderStore 变更

```typescript
interface ReaderStore {
  // 论文数据
  paper: Paper | null
  pages: ParsedPage[]
  currentPage: number
  translations: Record<number, string>     // page_number → 翻译内容
  chunkTranslations: Record<string, string> // "page-chunkIdx" → 翻译内容

  // 面板状态
  tocOpen: boolean
  parsePanelOpen: boolean
  qaPanelOpen: boolean
  parsePanelWidth: number       // 新增：拖拽后的实际宽度
  qaPanelWidth: number          // 新增：拖拽后的实际宽度

  // PDF 状态
  zoom: number
  pdfScrollPosition: { x: number; y: number }  // 新增：拖动偏移

  // 解析状态
  parseStatus: ParseStatus | null
  parsing: boolean              // 新增：是否正在解析中
  parseProgress: number         // 新增：0-1 进度值
  selectedEngine: string        // 新增：当前选择的引擎

  // 布局状态
  isParsed: boolean             // 新增：论文是否已解析

  // Actions
  loadPaper: (id: string) => Promise<void>
  loadPages: () => Promise<void>
  setCurrentPage: (page: number) => void
  translateCurrentPage: (modelId?: string) => Promise<void>
  translateChunk: (page: number, chunkIdx: number) => Promise<void>  // 新增
  triggerParse: (engine: string) => Promise<void>    // 新增：触发解析 + 轮询
  toggleToc: () => void
  toggleParsePanel: () => void
  toggleQaPanel: () => void
  setParsePanelWidth: (w: number) => void    // 新增
  setQaPanelWidth: (w: number) => void       // 新增
  setZoom: (zoom: number) => void
}
```

### 9.2 useQAStore 变更

```typescript
interface QAStore {
  conversations: Conversation[]
  activeConversationId: string | null
  activeModelId: string | null      // 新增：当前使用的模型 ID
  messages: Message[]
  streaming: boolean
  streamingContent: string
  attachedImages: ImageAttachment[] // 新增：待发送的图片附件

  // Actions
  fetchConversations: (paperId: string) => Promise<void>
  createConversation: (paperId: string, modelId: string) => Promise<void>
  loadMessages: (convId: string) => Promise<void>
  sendMessage: (convId: string, content: string, modelId?: string) => Promise<void>  // 修改：支持 modelId
  switchModel: (modelId: string) => void    // 新增：切换模型（仅前端状态）
  addImage: (file: File) => Promise<void>   // 新增：添加图片附件
  removeImage: (id: string) => void         // 新增：移除图片附件
  stopGeneration: () => Promise<void>
}
```

### 9.3 useSettingsStore 变更

```typescript
// AIModel 类型新增字段
interface AIModel {
  // ...existing fields
  supports_vision: boolean  // 新增
}
```

---

## 10. 组件架构

### 10.1 新增/重构组件清单

| 组件 | 路径 | 说明 |
|------|------|------|
| `PDFViewer` | `components/PDFViewer.tsx` | pdfjs-dist 渲染器，支持缩放/拖动/翻页 |
| `ParsePanel` | `components/ParsePanel.tsx` | 解析面板，含加载动画/内容渲染/翻译 |
| `QAPanel` | `components/QAPanel.tsx` | 问答面板，含模型切换/图片/消息列表 |
| `ResizableHandle` | `components/ResizableHandle.tsx` | 拖拽手柄组件 |
| `EngineModal` | `components/EngineModal.tsx` | 解析引擎选择弹窗 |
| `ModelSelector` | `components/ModelSelector.tsx` | 问答面板内的模型下拉选择器 |
| `MarkdownRenderer` | `components/MarkdownRenderer.tsx` | 完整 Markdown 渲染 (图片/表格/公式) |
| `ParseLoading` | `components/ParseLoading.tsx` | 解析中加载动画组件 |
| `ImageAttachment` | `components/ImageAttachment.tsx` | 图片预览缩略图 + 删除按钮 |

### 10.2 关键组件 API

#### PDFViewer

```typescript
interface PDFViewerProps {
  pdfUrl: string              // PDF 文件 URL
  currentPage: number         // 当前页码
  zoom: number                // 缩放级别
  onPageChange: (page: number) => void
  onZoomChange: (zoom: number) => void
}
```

#### ResizableHandle

```typescript
interface ResizableHandleProps {
  onResize: (deltaX: number) => void
  onCollapse: () => void
  isVisible: boolean          // hover 时是否显示高亮
}
```

#### ModelSelector

```typescript
interface ModelSelectorProps {
  models: AIModel[]
  activeModelId: string | null
  onSelect: (modelId: string) => void
}
```

#### ParseLoading

```typescript
interface ParseLoadingProps {
  progress: number            // 0-1
  engineName: string
  message?: string
}
// 渲染：居中骨架屏 + 脉冲透明度动画 + 进度条
```

---

## 11. 动画与过渡规格

### 11.1 布局过渡

| 动画 | 触发 | 参数 |
|------|------|------|
| PDF 面板收缩 | 解析面板展开 | `transition: flex 0.4s cubic-bezier(0.4, 0, 0.2, 1)` |
| 解析面板展开 | 解析按钮 | `transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1)` |
| 面板收起 | × 按钮 / 拖拽 | `transition: width 0.3s ease` |
| TOC 折叠 | 目录按钮 | `transition: width 0.25s ease` |

### 11.2 内容过渡

| 动画 | 触发 | 参数 |
|------|------|------|
| 解析加载脉冲 | 解析中 | `@keyframes pulse: opacity 0.4 → 1 → 0.4, 2s infinite` |
| 解析完成淡入 | 解析完成 | `opacity: 0 → 1, 300ms ease` |
| 翻译区域展开 | 翻译完成 | `max-height: 0 → auto, 300ms ease` (用 CSS transition) |
| 消息流式光标 | SSE 流式中 | `@keyframes blink: opacity 1 → 0, 1s infinite` |
| Toast 滑入 | 显示 Toast | `translateY(8px) → 0, 300ms ease` |

### 11.3 拖拽手柄

| 状态 | 样式 | 过渡 |
|------|------|------|
| 默认 | `width: 4px, background: var(--border)` | - |
| 悬停 | `width: 6px, background: var(--accent)` | `150ms ease` |
| 拖拽中 | `width: 6px, background: var(--accent), opacity: 1` | - |

---

## 12. 后端接口变更汇总

### 12.1 新增/修改接口

#### 12.1.1 模型新增 vision 字段

```
POST /api/v1/models
Body: { ..., "supports_vision": true }  // 新增可选字段

PATCH /api/v1/models/{id}
Body: { ..., "supports_vision": true }

GET /api/v1/models
Response: { items: [{ ..., "supports_vision": true }] }
```

#### 12.1.2 问答消息支持模型切换和图片

```
POST /api/v1/conversations/{conv_id}/messages
Body: {
  "content": "string",
  "model_id": "string | null",     // 新增：指定本次请求使用的模型
  "citations": [...],
  "images": [                       // 新增：图片附件
    {
      "data": "base64...",
      "mime_type": "image/png"
    }
  ]
}
```

#### 12.1.3 单 Chunk 翻译 (新接口建议)

当前翻译接口按整页翻译，建议新增按 Chunk 翻译：

```
POST /api/v1/translate/{paper_id}/pages/{page_number}/chunks/{chunk_index}
Body: { "model_id": "string | null" }
Response: SSE stream
```

或复用现有接口，前端将 chunk markdown 作为 content 发送到 AI 模型直接翻译。

### 12.2 数据库 Schema 变更

```sql
-- models 表新增 vision 支持
ALTER TABLE models ADD COLUMN supports_vision INTEGER DEFAULT 0;

-- messages 表新增 images 字段
ALTER TABLE messages ADD COLUMN images TEXT;  -- JSON array of ImageAttachment
```

---

## 13. 交互流程汇总

### 13.1 打开未解析论文

```
点击论文卡片 → /reader/:id
  → 加载论文数据 + 检查解析状态
  → parse_status !== 'parsed'
  → 全屏 PDF 模式 (100% 宽度)
  → 工具栏「解析」按钮高亮提示用户解析
  → 用户点击「解析」→ 引擎选择 Modal → 开始解析
  → PDF 收缩至 60%，解析面板 40% 展开
  → 显示加载动画 (脉冲 + 进度条)
  → 解析完成 → 渲染解析内容
```

### 13.2 打开已解析论文

```
点击论文卡片 → /reader/:id
  → 加载论文数据 + 检查解析状态
  → parse_status === 'parsed'
  → 自动 60/40 布局：左侧 PDF，右侧解析内容
  → 工具栏「解析」按钮可切换引擎重新解析
```

### 13.3 问答流程 (含模型切换)

```
点击「问答」→ Q&A 面板展开
  → 显示当前默认模型
  → 点击模型名称 → 下拉选择器
  → 选择新模型 → Toast 提示
  → 输入消息 → 使用新模型发送
  → 历史消息保持不变
  → 可继续切换模型
```

### 13.4 图片问答流程

```
粘贴/拖入/选择图片 → 检查当前模型 supports_vision
  → true: 显示图片预览缩略图
         → 输入文字 + 发送 → 图片随消息发送
  → false: Toast 提示 "当前模型不支持图片"
          → 阻止添加 / 灰化附件区域
```

---

## 14. 性能要求

| 指标 | 目标值 |
|------|--------|
| PDF 首页渲染 | < 500ms (本地文件) |
| 翻页响应 | < 200ms |
| 面板展开/收起动画 | 60fps, 无卡顿 |
| 拖拽调整宽度 | 实时响应，无延迟感 |
| SSE 翻译首字延迟 | < 1s |
| SSE 问答首字延迟 | < 2s |
| 解析进度轮询间隔 | 3s |

---

## 15. 技术栈依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| pdfjs-dist | ^4.6 | PDF 渲染 |
| react-markdown | ^9.0 | Markdown 渲染 |
| katex | ^0.16 | 数学公式渲染 |
| zustand | ^4.5 | 状态管理 |
| lucide-react | ^0.441 | 图标 |

---

## 16. 实施优先级

| 优先级 | 模块 | 预估工作量 |
|--------|------|-----------|
| P0 | PDF 原始渲染 (pdfjs-dist) | PDFViewer 组件 |
| P0 | 解析流程重构 (全屏→60/40→加载动画) | Reader 布局 + ParsePanel |
| P0 | 解析内容一比一渲染 (图片/表格/公式) | MarkdownRenderer |
| P0 | Chunk 翻译按钮 | ParsePanel 翻译逻辑 |
| P1 | 可拖拽面板 | ResizableHandle + hooks |
| P1 | 问答模型切换 | ModelSelector + QAStore |
| P1 | 模型 vision 字段 + 表单 | Settings/Models 页面 |
| P2 | 图片粘贴/拖拽/上传 | QAPanel 输入区 |
| P2 | 后端接口变更 | Python API 修改 |
| P3 | 解析视图切换 (解析文/翻译文) | ParsePanel Toggle |
