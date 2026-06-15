#!/bin/bash

# PaperLens Windows 交叉编译打包脚本（在 macOS/Linux 上打包 Windows 版本）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "========================================"
echo "PaperLens Windows 打包工具"
echo "========================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    log_error "Python 未安装"
    exit 1
fi

cd "$SCRIPT_DIR"

# 1. 检查前端构建
log_info "检查前端构建..."
if [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
    log_warn "前端未构建，正在构建..."
    cd "$FRONTEND_DIR"
    npm install
    npm run build
    if [ $? -ne 0 ]; then
        log_error "前端构建失败"
        exit 1
    fi
    cd "$SCRIPT_DIR"
fi
log_info "前端已构建"

# 2. 安装 PyInstaller
log_info "安装 PyInstaller..."
pip3 install pyinstaller==6.11.1 > /dev/null 2>&1
log_info "PyInstaller 已安装"

# 3. 打包后端
log_info "打包后端..."
pyinstaller --clean PaperLens.spec
if [ $? -ne 0 ]; then
    log_error "打包失败"
    exit 1
fi
log_info "后端打包完成"

# 4. 创建发布包
log_info "创建发布包..."
DIST_DIR="$SCRIPT_DIR/dist/PaperLens"
OUTPUT_DIR="$SCRIPT_DIR/release"

mkdir -p "$OUTPUT_DIR"

# 复制必要文件
cp "$BACKEND_DIR/config/engine_packages.json" "$DIST_DIR/config/" 2>/dev/null || true
cp "$PROJECT_ROOT/README.md" "$DIST_DIR/" 2>/dev/null || true

# 创建压缩包
cd "$DIST_DIR/.."
tar -czf "$OUTPUT_DIR/PaperLens-windows-x86_64.tar.gz" PaperLens

echo ""
echo "========================================"
echo "打包完成！"
echo "输出文件: $OUTPUT_DIR/PaperLens-windows-x86_64.tar.gz"
echo "可执行文件: $DIST_DIR/PaperLens.exe"
echo "========================================"
echo ""
echo "注意：这是在 macOS/Linux 上打包的 Windows 版本"
echo "需要在 Windows 上运行测试"
echo ""
