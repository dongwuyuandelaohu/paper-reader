#!/bin/bash
# Marker 引擎一键安装脚本
# 将打包好的引擎安装到用户目录，供后端使用

set -e

ENGINE_DIR="$HOME/.paperlens/engines"
SOURCE_DIR="dist/marker-engine"

echo "=== Marker 引擎安装脚本 ==="
echo ""

# 检查源目录是否存在
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ 错误: 找不到引擎目录 $SOURCE_DIR"
    echo "请确保您已经运行过 build-marker-onedir.sh"
    exit 1
fi

# 创建目标目录
echo "创建安装目录: $ENGINE_DIR"
mkdir -p "$ENGINE_DIR"

# 复制引擎
echo "复制引擎文件..."
if [ -d "$ENGINE_DIR/marker-engine" ]; then
    echo "⚠️  检测到已安装的引擎，正在更新..."
    rm -rf "$ENGINE_DIR/marker-engine"
fi

cp -r "$SOURCE_DIR" "$ENGINE_DIR/"

# 创建版本文件
echo "1.10.2" > "$ENGINE_DIR/marker-engine/VERSION"

# 验证安装
echo ""
echo "验证安装..."
if [ -f "$ENGINE_DIR/marker-engine/marker-engine" ]; then
    echo "✅ Marker 引擎已安装到: $ENGINE_DIR/marker-engine/"
    echo ""
    echo "引擎信息:"
    echo "  - 版本: $(cat $ENGINE_DIR/marker-engine/VERSION)"
    echo "  - 大小: $(du -sh $ENGINE_DIR/marker-engine | cut -f1)"
    echo "  - 模式: 单进程（自动禁用 multiprocessing）"
    echo ""
    echo "测试引擎..."
    if "$ENGINE_DIR/marker-engine/marker-engine" --help > /dev/null 2>&1; then
        echo "✅ 引擎可以正常运行"
    else
        echo "⚠️  引擎运行失败，请检查日志"
    fi
else
    echo "❌ 安装失败: 引擎文件不存在"
    exit 1
fi

echo ""
echo "安装完成！您现在可以在应用中使用 Marker 引擎了。"
