#!/bin/bash

# 压缩引擎为 zip 文件
# 用法: ./zip-engines.sh [marker|mineru|all]

set -e

ENGINE_TYPE="${1:-all}"
MARKER_VERSION="${MARKER_VERSION:-1.10.2}"
MINERU_VERSION="${MINERU_VERSION:-3.2.1}"

echo "=== 压缩引擎文件 ==="

cd dist

# 压缩 Marker 引擎
if [[ "$ENGINE_TYPE" == "marker" || "$ENGINE_TYPE" == "all" ]]; then
    if [ -d "marker-engine" ]; then
        echo "压缩 Marker 引擎..."
        ZIP_NAME="marker-engine-v${MARKER_VERSION}.zip"
        rm -f "$ZIP_NAME"
        zip -r "$ZIP_NAME" marker-engine/
        echo "✓ Marker 压缩完成: $ZIP_NAME"
        ls -lh "$ZIP_NAME"

        # 计算 SHA256
        echo "SHA256:"
        shasum -a 256 "$ZIP_NAME"
    else
        echo "⚠ marker-engine 目录不存在，跳过"
    fi
fi

# 压缩 MinerU 引擎
if [[ "$ENGINE_TYPE" == "mineru" || "$ENGINE_TYPE" == "all" ]]; then
    if [ -d "mineru-engine" ]; then
        echo "压缩 MinerU 引擎..."
        ZIP_NAME="mineru-engine-v${MINERU_VERSION}.zip"
        rm -f "$ZIP_NAME"
        zip -r "$ZIP_NAME" mineru-engine/
        echo "✓ MinerU 压缩完成: $ZIP_NAME"
        ls -lh "$ZIP_NAME"

        # 计算 SHA256
        echo "SHA256:"
        shasum -a 256 "$ZIP_NAME"
    else
        echo "⚠ mineru-engine 目录不存在，跳过"
    fi
fi

echo ""
echo "=== 压缩完成 ==="
echo "请上传以下文件到 GitHub Release:"
ls -lh *.zip 2>/dev/null || echo "  (无 zip 文件)"
echo ""
echo "上传后请将 SHA256 更新到 backend/config/engine_packages.json"
