# PaperLens 前端

论文双语阅读工具的 React 前端应用。

## 技术栈

- **框架**: React 18 + TypeScript
- **构建**: Vite 5
- **样式**: Tailwind CSS 3
- **路由**: React Router 6
- **状态管理**: Zustand 4
- **HTTP 客户端**: ky
- **图标**: lucide-react
- **PDF 渲染**: pdfjs-dist (待集成)
- **Markdown 渲染**: react-markdown (待集成)

## 项目结构

```
frontend/
├── src/
│   ├── api/              # API 客户端和类型定义
│   │   ├── client.ts     # ky HTTP 客户端配置
│   │   └── types.ts      # TypeScript 类型定义
│   ├── pages/            # 页面组件
│   │   ├── Library.tsx   # 论文库页面
│   │   ├── Reader.tsx    # 阅读工作台页面
│   │   └── Settings.tsx  # 设置页面
│   ├── stores/           # Zustand 状态管理
│   │   ├── usePaperStore.ts    # 论文数据状态
│   │   ├── useReaderStore.ts   # 阅读器 UI 状态
│   │   ├── useQAStore.ts       # 问答对话状态
│   │   └── useSettingsStore.ts # 设置状态
│   ├── styles/
│   │   └── globals.css   # Tailwind CSS 入口
│   ├── App.tsx           # 根组件和路由配置
│   └── main.tsx          # 应用入口
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 页面说明

### 论文库页面 (/)

- 显示所有已上传的论文卡片
- 支持搜索过滤
- 上传新论文（PDF 文件）
- 点击论文卡片进入阅读工作台

### 阅读工作台页面 (/reader/:id)

- 左侧：PDF 原文渲染（待集成 PDF.js）
- 右侧：翻译内容显示（待集成）
- 工具栏：同步滚动开关、问答侧边栏开关
- 状态栏：页码、解析进度、翻译进度

### 设置页面 (/settings)

- 模型管理：添加/编辑/删除 AI 模型配置
- PDF 解析引擎：查看引擎状态、安装 Marker
- 其他设置：翻译、问答、阅读、数据管理（待实现）

## 状态管理

使用 Zustand 管理应用状态：

- **usePaperStore**: 论文列表、上传、删除、更新
- **useReaderStore**: 当前页码、同步滚动、侧边栏显示状态
- **useQAStore**: 对话列表、消息、引用
- **useSettingsStore**: 应用设置、引擎状态

## API 集成

通过 Vite 代理连接到后端 API (http://localhost:8765)：

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8765',
      changeOrigin: true,
    },
  },
}
```

## 待开发功能

1. **PDF 渲染**: 集成 PDF.js 渲染 PDF 原文
2. **翻译面板**: 显示翻译后的 Markdown 内容
3. **问答侧边栏**: 完整的对话界面、引用管理、工具调用显示
4. **文本选择**: 选中文本后添加到对话引用
5. **术语速查**: 双击单词显示释义弹窗
6. **笔记面板**: 阅读笔记的创建、编辑、导出
7. **设置页面**: 完善所有设置选项
8. **Electron 集成**: 打包为桌面应用

## 样式规范

使用 Tailwind CSS 的自定义样式：

- **主色调**: primary-500 (#3b82f6)
- **背景色**: zinc-900 (深色主题)
- **卡片**: bg-zinc-800 border-zinc-700
- **按钮**: btn-primary, btn-secondary
- **输入框**: input

## 开发注意事项

1. 所有 API 调用使用 `api` 客户端（src/api/client.ts）
2. 类型定义集中在 src/api/types.ts
3. 使用 Zustand stores 管理全局状态，避免 prop drilling
4. 组件使用函数式组件 + Hooks
5. 使用 lucide-react 图标库保持一致性
