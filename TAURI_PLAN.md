# Tauri 桌面应用实施计划

## 目标
将 PaperLens Web 应用转换为 Windows 桌面应用，提供：
- 原生窗口体验（无浏览器标签栏、地址栏）
- Windows 安装包（.exe / .msi）
- 双击打开应用
- 支持常见安装选项（安装路径、开始菜单快捷方式等）

## 技术选型
**Tauri 2.0** - 使用系统 WebView2 渲染前端，Rust 后端管理窗口和系统集成

## 实施步骤

### 阶段 1：Tauri 项目初始化 ✅
1. 安装 Rust 环境 ✅
2. 安装 tauri-cli（进行中）
3. 初始化 Tauri 项目结构
4. 配置 tauri.conf.json

### 阶段 2：后端集成
1. 创建后端启动器（tauri/backend_launcher.py）
2. 使用 PyInstaller 打包后端为 exe
3. 配置 Tauri 在启动时运行后端
4. 处理进程生命周期（启动/关闭）

### 阶段 3：前端适配
1. 修改前端 API 调用（localhost:8765）
2. 处理文件选择对话框
3. 适配桌面窗口行为
4. 添加应用图标

### 阶段 4：Windows 构建
1. 创建 GitHub Actions workflow
2. 在 Windows 环境中编译
3. 生成安装包（.exe + .msi）
4. 测试安装和运行

### 阶段 5：发布
1. 创建 GitHub Release
2. 上传安装包
3. 编写用户文档
4. 签名（可选）

## 当前状态
- ✅ Rust 已安装（1.96.0）
- ⏳ tauri-cli 编译中（约 5-10 分钟）
- ⏳ 等待初始化 Tauri 项目

## 预期成果
- `PaperLens-x86_64.msi` - Windows 安装程序（约 50-100MB）
- `PaperLens_x64_en-US.msi` - 多语言安装包
- 自动创建桌面快捷方式和开始菜单项
- 双击 .exe 直接打开应用窗口
