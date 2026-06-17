# 手动上传引擎到 GitHub Release

## 📦 准备上传的文件

以下文件位于 `build-engines/dist/` 目录：

1. **marker-engine-v1.10.2.zip** (334MB)
2. **mineru-engine-v1.3.12.zip** (511MB)

## 🚀 上传步骤

### 步骤 1: 访问 GitHub Release 页面

打开浏览器访问：
```
https://github.com/dongwuyuandelaohu/paper-reader/releases
```

### 步骤 2: 创建新的 Release

1. 点击 **"Draft a new release"** 按钮
2. 填写以下信息：

**Tag version（标签版本）:**
```
v0.1.0-engines
```

**Release title（发布标题）:**
```
PaperLens 引擎包 v0.1.0
```

**描述（Description）:**
```markdown
## PaperLens 独立引擎包

这是 PaperLens 的独立引擎包，用户可以在应用内一键下载安装。

### 📦 包含的引擎

| 引擎 | 版本 | 大小 | 说明 |
|------|------|------|------|
| **Marker** | v1.10.2 | 334MB | 高质量 PDF 解析引擎，支持表格、公式识别 |
| **MinerU** | v1.3.12 | 511MB | 学术论文解析引擎，专为科研论文优化 |

### 🎯 特点

- ✅ **完全独立**: 每个引擎包含独立的 Python 环境
- ✅ **无需依赖**: 用户无需安装 Python 或其他依赖
- ✅ **单进程模式**: 自动禁用 multiprocessing，避免兼容性问题
- ✅ **即装即用**: 下载解压后即可使用

### 📥 使用说明

1. 打开 PaperLens 应用
2. 进入 **设置** → **引擎管理**
3. 点击引擎旁的 **"下载"** 按钮
4. 等待下载和解压完成（可能需要几分钟）
5. 引擎状态变为 **"已安装"** 后即可使用

### 🔧 技术细节

- 使用 PyInstaller `--onedir` 模式打包
- 每个引擎包含完整的 Python 运行时和所有依赖
- 使用 `spawn` 方法启动，避免 multiprocessing 问题
- 自动设置单进程模式，确保稳定性

### 📊 文件大小说明

引擎文件较大是因为包含了：
- 完整的 Python 3.11 运行时
- PyTorch、Transformers 等深度学习框架
- OCR、版面分析等 AI 模型
- 所有必要的系统库

这是必要的，以确保用户无需安装任何额外依赖。
```

### 步骤 3: 上传文件

1. 在 **"Attach binaries"** 区域
2. 拖拽或点击上传以下文件：
   - `marker-engine-v1.10.2.zip`
   - `mineru-engine-v1.3.12.zip`
3. 等待上传完成（可能需要 5-10 分钟）

### 步骤 4: 发布 Release

1. 勾选 **"Set as the latest release"**（可选）
2. 点击 **"Publish release"** 按钮

## ✅ 验证上传

发布后，你应该能在以下 URL 看到上传的文件：
```
https://github.com/dongwuyuandelaohu/paper-reader/releases/tag/v0.1.0-engines
```

## 📝 后续步骤

上传完成后，我们需要：

1. **更新后端代码** - 使用新的 Release URL
2. **测试下载功能** - 确保能正确下载和解压
3. **测试引擎调用** - 确保下载的引擎能正常工作

## 🆘 常见问题

### Q: 文件太大，上传失败？
**A:** GitHub 限制单个文件最大 2GB，我们的文件都在限制内。如果上传失败，可以尝试：
- 使用 Chrome 或 Firefox 浏览器
- 确保网络连接稳定
- 尝试分次上传（先传 Marker，再传 MinerU）

### Q: 可以修改已发布的 Release 吗？
**A:** 可以！在 Release 页面点击 "Edit" 按钮即可修改描述或添加文件。

### Q: 需要创建多个 Release 吗？
**A:** 建议将所有引擎放在同一个 Release 中，便于管理。

---

**准备好了吗？** 现在就去 GitHub 上传吧！上传完成后告诉我，我会继续更新后端代码。
