# PaperLens - 学术论文双语阅读助手

PaperLens 是一款面向科研工作者的桌面应用，提供 PDF 论文管理、AI 翻译、智能问答等功能。

## 功能特性

- **PDF 阅读** - 流畅的 PDF 渲染，支持缩放、页码跳转、目录导航
- **多引擎解析** - PyMuPDF（轻量）、Marker（高质量）、MinerU（高精度），按需切换
- **AI 双语翻译** - 支持多模型，SSE 流式输出，可后台翻译
- **智能问答** - 基于论文内容的 AI 对话，支持多轮上下文
- **笔记与高亮** - 阅读笔记、文本高亮、术语表
- **本地数据** - SQLite 本地存储，数据完全私有

## 系统要求

- Windows 10/11 (64 位)
- 2 GB 内存
- 500 MB 磁盘空间

## 安装使用

1. 从 [Releases](https://github.com/paper-reader/paper-reader/releases) 下载安装包
2. 运行 MSI 或 NSIS 安装程序
3. 双击桌面快捷方式启动

## 技术架构

```
┌─────────────────────────────────────────┐
│         Tauri 桌面应用 (Rust)            │
│  ┌───────────────────────────────────┐  │
│  │  前端: React 18 + Vite + TypeScript│  │
│  │  渲染: WebView2                    │  │
│  ───────────────┬───────────────────┘  │
│                  │  localhost:8765       │
│  ┌───────────────▼───────────────────┐  │
│  │  后端: Python FastAPI + SQLite     │  │
│  │  解析引擎: PyMuPDF / Marker / MinerU│  │
│  │  AI: OpenAI SDK (多模型)           │  │
│  └───────────────────────────────────  │
└─────────────────────────────────────────┘
```

## 开发构建

```powershell
# 安装依赖
npm install
cd frontend && npm install
cd ..\backend && pip install -r requirements.txt

# 开发模式
npx tauri dev

# 完整构建
.\build-windows.ps1
```

## 许可证

MIT
