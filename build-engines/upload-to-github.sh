#!/bin/bash

# 上传引擎到 GitHub Release

set -e

REPO="dongwuyuandelaohu/paper-reader"
TAG="v0.1.0"

echo "=== 上传引擎到 GitHub Release ==="
echo "仓库: $REPO"
echo "标签: $TAG"
echo ""

# 检查 gh 是否安装
if ! command -v gh &> /dev/null; then
    echo "❌ 未安装 GitHub CLI (gh)"
    echo "请安装: brew install gh"
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo "❌ 未登录 GitHub"
    echo "请运行: gh auth login"
    exit 1
fi

echo "✓ GitHub CLI 已就绪"
echo ""

# 创建 Release（如果不存在）
echo "检查 Release 是否存在..."
if ! gh release view $TAG --repo $REPO &> /dev/null; then
    echo "创建 Release..."
    gh release create $TAG \
        --repo $REPO \
        --title "PaperLens v0.1.0 - 引擎包" \
        --notes "## PaperLens 引擎包

这是 PaperLens 的独立引擎包，用户可以在应用内一键下载安装。

### 包含的引擎

- **Marker v1.10.2** (334MB) - 高质量 PDF 解析引擎
- **MinerU v1.3.12** (511MB) - 学术论文解析引擎

### 使用说明

1. 打开 PaperLens 应用
2. 进入设置 → 引擎管理
3. 点击"下载"按钮
4. 等待下载和解压完成

### 技术细节

- 使用 PyInstaller --onedir 模式打包
- 每个引擎包含独立的 Python 环境
- 用户无需安装 Python 或其他依赖
"
    echo "✓ Release 创建成功"
else
    echo "✓ Release 已存在"
fi

echo ""
echo "开始上传文件..."

# 上传 Marker 引擎
if [ -f "marker-engine-v1.10.2.zip" ]; then
    echo "上传 Marker 引擎 (334MB)..."
    gh release upload $TAG marker-engine-v1.10.2.zip \
        --repo $REPO \
        --clobber
    echo "✓ Marker 上传成功"
else
    echo "⚠️  marker-engine-v1.10.2.zip 不存在"
fi

echo ""

# 上传 MinerU 引擎
if [ -f "mineru-engine-v1.3.12.zip" ]; then
    echo "上传 MinerU 引擎 (511MB)..."
    gh release upload $TAG mineru-engine-v1.3.12.zip \
        --repo $REPO \
        --clobber
    echo "✓ MinerU 上传成功"
else
    echo "⚠️  mineru-engine-v1.3.12.zip 不存在"
fi

echo ""
echo "=== 上传完成 ==="
echo "查看 Release: https://github.com/$REPO/releases/tag/$TAG"
