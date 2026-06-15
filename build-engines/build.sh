#!/bin/bash

# 引擎打包脚本
# 在隔离环境中打包 Marker 和 MinerU 为独立可执行文件

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv-build"
DIST_DIR="$SCRIPT_DIR/dist"

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

# 清理函数
cleanup() {
    log_info "清理临时文件..."
    rm -rf "$SCRIPT_DIR/build"
    rm -rf "$SCRIPT_DIR/__pycache__"
    rm -rf "$SCRIPT_DIR"/*.pyc
}

# 创建隔离的虚拟环境
setup_venv() {
    if [ -d "$VENV_DIR" ]; then
        log_warn "虚拟环境已存在，跳过创建"
        return
    fi
    
    log_info "创建隔离的虚拟环境..."
    python3 -m venv "$VENV_DIR"
    
    log_info "激活虚拟环境..."
    source "$VENV_DIR/bin/activate"
    
    log_info "升级 pip..."
    pip install --upgrade pip wheel
    
    log_info "安装 PyInstaller..."
    pip install pyinstaller==6.11.1
}

# 打包 Marker
build_marker() {
    log_info "开始打包 Marker 引擎..."
    
    # 创建临时虚拟环境
    local marker_venv="$SCRIPT_DIR/venv-marker"
    if [ -d "$marker_venv" ]; then
        rm -rf "$marker_venv"
    fi
    
    log_info "创建 Marker 专用环境..."
    python3 -m venv "$marker_venv"
    source "$marker_venv/bin/activate"
    
    log_info "安装 Marker 依赖（最小化）..."
    pip install --upgrade pip
    pip install marker-pdf==1.10.2
    pip install pyinstaller==6.11.1
    
    # 获取 marker 包的实际路径（处理命名空间包的情况）
    log_info "检测 Marker 包路径..."
    MARKER_PATH=$(python -c "import site; import os; sp = site.getsitepackages()[0]; print(os.path.join(sp, 'marker'))" 2>/dev/null)
    
    if [ ! -d "$MARKER_PATH" ]; then
        log_error "找不到 marker 包，请检查安装"
        exit 1
    fi
    
    log_info "Marker 包路径: $MARKER_PATH"
    
    # 创建 PyInstaller 缓存和配置目录（在项目内，避免权限问题）
    export PYINSTALLER_CACHE_DIR="$SCRIPT_DIR/.pyinstaller-cache"
    export PYINSTALLER_CONFIG_DIR="$SCRIPT_DIR/.pyinstaller-config"
    mkdir -p "$PYINSTALLER_CACHE_DIR"
    mkdir -p "$PYINSTALLER_CONFIG_DIR"
    
    log_info "使用 PyInstaller 打包..."
    pyinstaller --clean \
        --name marker-engine \
        --onefile \
        --workpath "$SCRIPT_DIR/build/marker-work" \
        --specpath "$SCRIPT_DIR/build/marker-spec" \
        --runtime-tmpdir "$SCRIPT_DIR/build/marker-tmp" \
        marker-wrapper-v4.py
    
    deactivate
    
    log_info "Marker 打包完成！"
    log_info "输出文件: $DIST_DIR/marker-engine"
    
    # 清理临时环境
    log_info "清理 Marker 临时环境..."
    rm -rf "$marker_venv"
}

# 打包 MinerU
build_mineru() {
    log_info "开始打包 MinerU 引擎..."
    
    # 创建临时虚拟环境
    local mineru_venv="$SCRIPT_DIR/venv-mineru"
    if [ -d "$mineru_venv" ]; then
        rm -rf "$mineru_venv"
    fi
    
    log_info "创建 MinerU 专用环境..."
    python3 -m venv "$mineru_venv"
    source "$mineru_venv/bin/activate"
    
    log_info "安装 MinerU 依赖（最小化）..."
    pip install --upgrade pip
    pip install mineru==3.2.1
    pip install pyinstaller==6.11.1
    
    # 创建 PyInstaller 缓存和配置目录（在项目内，避免权限问题）
    export PYINSTALLER_CACHE_DIR="$SCRIPT_DIR/.pyinstaller-cache"
    export PYINSTALLER_CONFIG_DIR="$SCRIPT_DIR/.pyinstaller-config"
    mkdir -p "$PYINSTALLER_CACHE_DIR"
    mkdir -p "$PYINSTALLER_CONFIG_DIR"
    
    log_info "使用 PyInstaller 打包..."
    pyinstaller --clean \
        --name mineru-engine \
        --onefile \
        --workpath "$SCRIPT_DIR/build/mineru-work" \
        --specpath "$SCRIPT_DIR/build/mineru-spec" \
        --runtime-tmpdir "$SCRIPT_DIR/build/mineru-tmp" \
        mineru-wrapper-v4.py
    
    deactivate
    
    log_info "MinerU 打包完成！"
    log_info "输出文件: $DIST_DIR/mineru-engine"
    
    # 清理临时环境
    log_info "清理 MinerU 临时环境..."
    rm -rf "$mineru_venv"
}

# 主函数
main() {
    local target="${1:-all}"
    
    log_info "=== 引擎打包工具 ==="
    log_info "目标: $target"
    
    # 创建输出目录
    mkdir -p "$DIST_DIR"
    
    # 设置陷阱以清理
    trap cleanup EXIT
    
    case "$target" in
        marker)
            build_marker
            ;;
        mineru)
            build_mineru
            ;;
        all)
            build_marker
            build_mineru
            ;;
        *)
            log_error "未知目标: $target"
            echo "用法: $0 [marker|mineru|all]"
            exit 1
            ;;
    esac
    
    log_info "=== 打包完成 ==="
    ls -lh "$DIST_DIR"
}

main "$@"
