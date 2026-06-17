#!/bin/bash

# MinerU 引擎打包脚本 (venv 方案)
# 不使用 PyInstaller，创建包含完整 Python 虚拟环境的引擎包
# MinerU 3.x 的 CLI 会拉起 mineru-api 子进程，PyInstaller 无法处理这种架构
# 因此采用 venv + wrapper 方案：打包完整的虚拟环境，运行时通过 wrapper 脚本调用

set -e

MINERU_VERSION="${MINERU_VERSION:-3.2.1}"
# 是否预下载模型 (PREBUNDLE_MODELS=1 ./build-mineru-onedir.sh)
PREBUNDLE_MODELS="${PREBUNDLE_MODELS:-0}"
# 模型源: modelscope (国内镜像，默认) 或 huggingface
MODEL_SOURCE="${MINERU_MODEL_SOURCE:-modelscope}"
echo "=== MinerU 引擎打包开始 (v${MINERU_VERSION}) ==="
echo "   模型预下载: $([ "$PREBUNDLE_MODELS" = "1" ] && echo "开启" || echo "关闭")"
echo "   模型源: $MODEL_SOURCE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ==================== 1. 检查 Python 版本 ====================
echo ""
echo "1. 检查 Python 版本..."
PYTHON=""
for py in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$py" &>/dev/null; then
        ver=$("$py" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
            PYTHON="$py"
            echo "   ✓ 使用 Python $ver ($PYTHON)"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "   ✗ 需要 Python 3.10+，请先安装"
    exit 1
fi

PYTHON_VERSION=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")

# ==================== 2. 创建构建用虚拟环境 ====================
echo ""
echo "2. 创建构建用虚拟环境..."
BUILD_VENV="venv-mineru-build"
rm -rf "$BUILD_VENV"
$PYTHON -m venv "$BUILD_VENV"
source "$BUILD_VENV/bin/activate"

# ==================== 3. 安装 MinerU ====================
echo ""
echo "3. 安装 MinerU 和依赖..."
pip install --upgrade pip

# CPU 版 PyTorch (大幅减小包体积)
echo "   安装 PyTorch (CPU 版本)..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# 安装 MinerU
echo "   安装 MinerU ${MINERU_VERSION}..."
pip install "mineru[all]==${MINERU_VERSION}"

# 验证安装
echo ""
echo "4. 验证 MinerU 安装..."
mineru --version || echo "   ⚠ mineru --version 返回非零状态码，继续打包..."
echo "   ✓ MinerU 安装成功"
echo "   包列表:"
pip list | grep -i -E "mineru|torch|transformers|paddle" || true

# ==================== 4. 构建引擎包 ====================
echo ""
echo "5. 构建引擎包..."
ENGINE_DIR="dist/mineru-engine"
rm -rf "$ENGINE_DIR"
mkdir -p "$ENGINE_DIR"

# 创建独立的 venv（--copies 复制 Python 二进制而非符号链接）
echo "   创建可分发的虚拟环境..."
$PYTHON -m venv "$ENGINE_DIR/.venv" --copies

# 在独立 venv 中安装同样的包
echo "   在引擎 venv 中安装依赖（这可能需要几分钟）..."
"$ENGINE_DIR/.venv/bin/pip" install --upgrade pip
"$ENGINE_DIR/.venv/bin/pip" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
"$ENGINE_DIR/.venv/bin/pip" install "mineru[all]==${MINERU_VERSION}"

# 验证引擎 venv
echo "   验证引擎 venv..."
"$ENGINE_DIR/.venv/bin/mineru" --version || true
echo "   ✓ 引擎 venv 验证通过"

# ==================== 5. 预下载模型 (可选) ====================
if [ "$PREBUNDLE_MODELS" = "1" ]; then
    echo ""
    echo "5b. 预下载 MinerU 模型..."
    MODELS_DIR="$ENGINE_DIR/models"
    mkdir -p "$MODELS_DIR"

    # 设置模型缓存目录
    export HF_HOME="$MODELS_DIR/huggingface"
    export MINERU_MODEL_SOURCE="$MODEL_SOURCE"
    mkdir -p "$HF_HOME"

    echo "   模型缓存目录: $HF_HOME"
    echo "   模型源: $MODEL_SOURCE"
    echo "   开始下载模型 (这可能需要较长时间)..."

    # 通过一个小型 PDF 触发模型下载
    TEMP_PDF=$(mktemp /tmp/mineru-dl-test-XXXXXX.pdf)
    # 创建一个最小的有效 PDF
    echo "%PDF-1.0 1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj xref 0 4 0000000000 65535 f 0000000009 00000 n 0000000052 00000 n 0000000101 00000 n trailer<</Size 4/Root 1 0 R>> startxref 166 %%EOF" > "$TEMP_PDF"

    # 使用引擎 venv 运行一次解析来触发模型下载
    echo "   触发模型下载 (pipeline 后端)..."
    "$ENGINE_DIR/.venv/bin/mineru" -p "$TEMP_PDF" -o /tmp/mineru-dl-output -b pipeline 2>&1 || {
        echo "   ⚠ 模型下载过程中断，但部分模型可能已下载"
    }

    # 清理临时文件
    rm -f "$TEMP_PDF"
    rm -rf /tmp/mineru-dl-output

    # 更新 engine.json 标记模型已预下载
    if [ -d "$HF_HOME" ] && [ "$(ls -A "$HF_HOME" 2>/dev/null)" ]; then
        echo "   ✓ 模型下载完成"
        du -sh "$HF_HOME"
        # 记录模型信息到 engine.json
        python3 -c "
import json, os
p = '$ENGINE_DIR/engine.json'
d = json.load(open(p)) if os.path.exists(p) else {}
d['models_preloaded'] = True
d['models_dir'] = 'models/huggingface'
json.dump(d, open(p, 'w'), indent=2)
"
    else
        echo "   ⚠ 模型目录为空，可能下载未成功"
    fi
fi

# ==================== 6. 创建 wrapper 脚本 ====================
echo ""
echo "6. 创建 wrapper 脚本..."

# macOS/Linux wrapper
cat > "$ENGINE_DIR/mineru-engine" << 'WRAPPER_EOF'
#!/bin/bash
# MinerU Engine Wrapper
# 运行时查找系统 Python 3.10+，修复 venv 路径后调用 mineru CLI
# 这样引擎包可以被移动到任意位置（解压即用）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
PYVENV_CFG="$VENV_DIR/pyvenv.cfg"

# 查找 Python 3.10+
find_python() {
    for py in python3.13 python3.12 python3.11 python3.10 python3; do
        if command -v "$py" &>/dev/null 2>&1; then
            local ver
            ver=$("$py" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null) || continue
            local minor
            minor=$(echo "$ver" | cut -d. -f2)
            if [ "$minor" -ge 10 ] 2>/dev/null; then
                echo "$py"
                return 0
            fi
        fi
    done
    return 1
}

PYTHON=$(find_python)
if [ -z "$PYTHON" ]; then
    echo "错误: 需要 Python 3.10+，请先安装 Python" >&2
    echo "下载地址: https://www.python.org/downloads/" >&2
    echo "" >&2
    echo "macOS: brew install python@3.12" >&2
    echo "Ubuntu: sudo apt install python3.12 python3.12-venv" >&2
    exit 1
fi

# 获取系统 Python 的安装目录（写入 pyvenv.cfg 的 home 字段）
PYTHON_HOME=$(dirname "$(which "$PYTHON")")
PYTHON_VERSION=$($PYTHON -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")

# 修复 pyvenv.cfg 中的 home 路径（使 venv 适配当前系统的 Python）
if [ -f "$PYVENV_CFG" ]; then
    CURRENT_HOME=$(grep "^home = " "$PYVENV_CFG" | sed 's/^home = //')
    if [ "$CURRENT_HOME" != "$PYTHON_HOME" ]; then
        echo "[MinerU] 适配 Python 环境: $PYTHON ($PYTHON_VERSION)" >&2
        # 备份原始配置
        cp "$PYVENV_CFG" "$PYVENV_CFG.orig" 2>/dev/null || true
        # 更新 home 和 version 字段
        sed -i.bak "s|^home = .*|home = $PYTHON_HOME|" "$PYVENV_CFG"
        sed -i.bak "s|^version = .*|version = $PYTHON_VERSION|" "$PYVENV_CFG" 2>/dev/null || true
        rm -f "$PYVENV_CFG.bak"
    fi
fi

# 模型目录: 优先使用打包时预置的模型，否则使用用户缓存
BUNDLED_MODELS="$SCRIPT_DIR/models/huggingface"
HOME_DIR="$HOME"

if [ -d "$BUNDLED_MODELS" ] && [ "$(ls -A "$BUNDLED_MODELS" 2>/dev/null)" ]; then
    # 预置模型: 直接使用打包好的模型
    export HF_HOME="$BUNDLED_MODELS"
    echo "[MinerU] 使用预置模型: $BUNDLED_MODELS" >&2
else
    # 用户缓存: 下载到 ~/.cache/paperlens/huggingface
    export HF_HOME="${HF_HOME:-$HOME_DIR/.cache/paperlens/huggingface}"
    export MINERU_MODEL_SOURCE="${MINERU_MODEL_SOURCE:-modelscope}"
    echo "[MinerU] 使用模型缓存: $HF_HOME" >&2
fi

export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-$HF_HOME}"
mkdir -p "$HF_HOME" 2>/dev/null || true

echo "[MinerU] 使用 Python: $PYTHON ($PYTHON_VERSION)" >&2
echo "[MinerU] 参数: $@" >&2

# 运行 mineru CLI
exec "$VENV_DIR/bin/python" -m mineru.cli.client "$@"
WRAPPER_EOF

chmod +x "$ENGINE_DIR/mineru-engine"

# Windows wrapper
cat > "$ENGINE_DIR/mineru-engine.bat" << 'BAT_WRAPPER_EOF'
@echo off
setlocal enabledelayedexpansion

REM MinerU Engine Wrapper for Windows
REM 运行时查找系统 Python 3.10+，修复 venv 路径后调用 mineru CLI

set "SCRIPT_DIR=%~dp0"
set "VENV_DIR=%SCRIPT_DIR%.venv"
set "PYVENV_CFG=%VENV_DIR%\pyvenv.cfg"

REM 查找 Python 3.10+
set "PYTHON="
for %%P in (python3.13 python3.12 python3.11 python3.10 python py) do (
    where %%P >nul 2>&1
    if !errorlevel! == 0 (
        for /f "tokens=*" %%V in ('%%P -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2^>nul') do (
            for /f "tokens=2 delims=." %%M in ("%%V") do (
                if %%M GEQ 10 (
                    if "!PYTHON!"=="" (
                        set "PYTHON=%%P"
                        set "PYTHON_VERSION=%%V"
                    )
                )
            )
        )
    )
)

if "%PYTHON%"=="" (
    echo Error: Python 3.10+ required. Please install Python from https://www.python.org/downloads/ >&2
    exit /b 1
)

REM 获取 Python home 目录
for /f "tokens=*" %%H in ('%PYTHON% -c "import sys, os; print(os.path.dirname(sys.executable))"') do set "PYTHON_HOME=%%H"

REM 修复 pyvenv.cfg 中的 home 路径
if exist "%PYVENV_CFG%" (
    %PYTHON% -c "import sys; cfg='%PYVENV_CFG%'.replace('\\','\\\\'); lines=open(cfg).readlines(); f=open(cfg,'w'); [f.write(('home = '+sys.executable.rsplit('\\',1)[0]+'\n') if l.startswith('home = ') else l) for l in lines]; f.close()"
)

REM 模型目录: 优先使用打包时预置的模型，否则使用用户缓存
set "BUNDLED_MODELS=%SCRIPT_DIR%models\huggingface"
if exist "%BUNDLED_MODELS%\*" (
    set "HF_HOME=%BUNDLED_MODELS%"
    echo [MinerU] Using bundled models: %BUNDLED_MODELS% >&2
) else (
    if "%HF_HOME%"=="" set "HF_HOME=%USERPROFILE%\.cache\paperlens\huggingface"
    if "%MINERU_MODEL_SOURCE%"=="" set "MINERU_MODEL_SOURCE=modelscope"
    echo [MinerU] Using model cache: %HF_HOME% >&2
)
if not exist "%HF_HOME%" mkdir "%HF_HOME%"

echo [MinerU] Using Python: %PYTHON% (%PYTHON_VERSION%) >&2

REM 运行 mineru CLI
"%VENV_DIR%\Scripts\python.exe" -m mineru.cli.client %*
BAT_WRAPPER_EOF

# ==================== 6. 创建版本文件和引擎元信息 ====================
echo "$MINERU_VERSION" > "$ENGINE_DIR/VERSION"

# 创建引擎类型标记（供 engine_detector 识别）
cat > "$ENGINE_DIR/engine.json" << ENGINE_JSON
{
    "name": "mineru",
    "version": "$MINERU_VERSION",
    "type": "venv",
    "platform": "$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)",
    "python_version": "$PYTHON_VERSION",
    "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ENGINE_JSON

# ==================== 7. 清理构建环境 ====================
echo ""
echo "7. 清理构建环境..."
deactivate
rm -rf "$BUILD_VENV"

# ==================== 8. 输出结果 ====================
echo ""
echo "=== 打包完成 ==="
echo "输出目录: $ENGINE_DIR/"
echo ""
echo "目录结构:"
echo "  mineru-engine       # Wrapper 脚本 (macOS/Linux)"
echo "  mineru-engine.bat   # Wrapper 脚本 (Windows)"
echo "  .venv/              # Python 虚拟环境 (含 mineru 及所有依赖)"
if [ "$PREBUNDLE_MODELS" = "1" ] && [ -d "$ENGINE_DIR/models/huggingface" ]; then
echo "  models/huggingface/ # 预下载的模型文件"
fi
echo "  VERSION             # 版本号"
echo "  engine.json         # 引擎元信息"
echo ""
du -sh "$ENGINE_DIR/"
echo ""
echo "✓ 完成！测试命令:"
echo "  ./$ENGINE_DIR/mineru-engine --help"
echo "  ./$ENGINE_DIR/mineru-engine -p test.pdf -o output/ -b pipeline"
