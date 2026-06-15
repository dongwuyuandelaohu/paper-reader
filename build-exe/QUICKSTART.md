# PaperLens Windows 打包 - 快速开始

## 🚀 5 分钟快速打包

### 前提条件

- Windows 10/11
- Python 3.8+
- Node.js 16+
- Git（可选）

### 步骤 1：克隆项目

```bash
git clone https://github.com/your-repo/paper-reader.git
cd paper-reader
```

### 步骤 2：安装依赖

```bash
# 后端依赖
cd backend
pip install -r requirements.txt

# 前端依赖
cd ../frontend
npm install
npm run build
```

### 步骤 3：运行打包脚本

```bash
cd ../build-exe
build.bat
```

等待 2-5 分钟，打包完成后会看到：
```
========================================
打包完成！
输出文件: release/PaperLens-windows-x86_64.tar.gz
可执行文件: dist/PaperLens/PaperLens.exe
========================================
```

### 步骤 4：测试运行

```bash
cd dist/PaperLens
PaperLens.exe
```

浏览器会自动打开 http://localhost:8765

## 📦 发布给用户

### 1. 创建发布包

打包脚本会自动创建压缩包：
```
release/PaperLens-windows-x86_64.tar.gz (约 50-100MB)
```

### 2. 上传到 GitHub Releases

```bash
# 创建 Release
gh release create v0.1.0 \
  --title "PaperLens v0.1.0" \
  --notes "首次发布"

# 上传文件
gh release upload v0.1.0 \
  release/PaperLens-windows-x86_64.tar.gz
```

### 3. 用户下载安装

用户只需要：
1. 下载 `PaperLens-windows-x86_64.tar.gz`
2. 解压到任意目录
3. 双击 `start.bat`
4. 浏览器自动打开应用

## 🎯 核心特性

### ✅ 已完成

- [x] 前后端一体化打包
- [x] 自动处理路径差异
- [x] 排除大型 ML 库（减小体积）
- [x] 支持引擎动态安装
- [x] 数据存储到用户目录
- [x] 自动打开浏览器
- [x] 完整的文档和示例

### 🎁 打包体积

| 组件 | 大小 | 说明 |
|------|------|------|
| 主程序 | ~50-100 MB | 包含 Python 运行时和依赖 |
| 前端 | ~5 MB | React 静态文件 |
| **总计** | **~55-105 MB** | 不含 ML 库 |

### 📝 用户使用流程

```
1. 下载解压
   ↓
2. 双击 start.bat
   ↓
3. 浏览器自动打开
   ↓
4. 上传 PDF 论文
   ↓
5. 选择解析引擎
   ├─ PyMuPDF（内置，立即可用）
   ├─ Marker（点击安装，~1GB）
   └─ MinerU（点击安装，~1.5GB）
   ↓
6. 查看解析结果
   ↓
7. 使用翻译功能（需配置 AI 模型）
```

## 🔧 高级配置

### 添加应用图标

1. 准备图标文件（.ico 格式）
2. 修改 `PaperLens.spec`：
   ```python
   exe = EXE(
       ...
       icon='assets/icon.ico',
       ...
   )
   ```

### 隐藏控制台窗口

修改 `PaperLens.spec`：
```python
exe = EXE(
    ...
    console=False,  # 隐藏控制台
    ...
)
```

### 创建安装程序

使用 Inno Setup 创建专业安装程序：

1. 下载 [Inno Setup](https://jrsoftware.org/isinfo.php)
2. 创建安装脚本（参考 `build-exe/inno-setup.iss`）
3. 编译生成 `PaperLens-Setup.exe`

## 🐛 常见问题

### Q: 打包后运行报错

**A**: 查看控制台错误信息，通常是缺少依赖。检查 `requirements.txt` 是否完整。

### Q: 前端页面空白

**A**: 确保 `frontend/dist` 目录存在。重新运行 `npm run build`。

### Q: 打包体积太大

**A**: 检查是否包含了 torch 等大型库。在 `PaperLens.spec` 的 `excludes` 中添加。

### Q: 如何更新版本？

**A**: 
1. 修改代码
2. 重新运行 `build.bat`
3. 创建新的 GitHub Release

## 📚 详细文档

- [完整打包指南](README.md)
- [引擎打包系统](../build-engines/README.md)
- [API 文档](../backend/API.md)

## 💡 下一步

1. **测试所有功能**
   - 上传 PDF
   - 解析论文
   - 安装引擎
   - 翻译功能

2. **优化用户体验**
   - 添加应用图标
   - 创建安装程序
   - 编写用户手册

3. **发布和推广**
   - 创建官网
   - 发布到 GitHub
   - 收集用户反馈

---

**需要帮助？** 查看 [完整文档](README.md) 或提交 Issue。
