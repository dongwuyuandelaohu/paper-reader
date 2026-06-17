#!/bin/bash

# Marker 引擎打包脚本 (--onedir 模式)
# 解决依赖问题，添加所有必要的隐藏导入

set -e

echo "=== Marker 引擎打包开始 ==="

# 创建虚拟环境
VENV_DIR="venv-marker-build"
echo "创建虚拟环境: $VENV_DIR"
python3 -m venv $VENV_DIR
source $VENV_DIR/bin/activate

# 安装依赖
echo "安装 marker-pdf 和依赖..."
pip install --upgrade pip
pip install marker-pdf==1.10.2
pip install transformers==4.46.3
pip install pyinstaller

# 验证安装
echo "验证 marker 安装..."
marker_single --version

# 打包
echo "开始打包 (--onedir 模式)..."
pyinstaller \
  --name marker-engine \
  --onedir \
  --noconfirm \
  --clean \
  --hidden-import=scipy \
  --hidden-import=scipy.optimize \
  --hidden-import=scipy.optimize._linprog_ip \
  --hidden-import=scipy.sparse \
  --hidden-import=scipy.sparse.csgraph \
  --hidden-import=scipy.linalg \
  --hidden-import=scipy.special \
  --hidden-import=numpy \
  --hidden-import=numpy.core \
  --hidden-import=numpy.linalg \
  --hidden-import=torch \
  --hidden-import=torch.nn \
  --hidden-import=torch.nn.functional \
  --hidden-import=torch.optim \
  --hidden-import=PIL \
  --hidden-import=PIL.Image \
  --hidden-import=fitz \
  --hidden-import=pdfplumber \
  --hidden-import=marker \
  --hidden-import=marker.scripts \
  --hidden-import=marker.scripts.convert_single \
  --hidden-import=marker.converters \
  --hidden-import=marker.models \
  --hidden-import=marker.config \
  --hidden-import=marker.config.parser \
  --hidden-import=marker.schema \
  --hidden-import=marker.schema.text \
  --hidden-import=marker.renderers \
  --hidden-import=marker.renderers.markdown \
  --hidden-import=marker.providers \
  --hidden-import=marker.providers.pdf \
  --hidden-import=marker.processors \
  --hidden-import=marker.processors.base \
  --hidden-import=marker.processors.llm \
  --hidden-import=marker.processors.document \
  --hidden-import=marker.processors.text \
  --hidden-import=marker.processors.table \
  --hidden-import=marker.processors.equation \
  --hidden-import=marker.processors.code \
  --hidden-import=marker.processors.list \
  --hidden-import=marker.processors.headings \
  --hidden-import=marker.processors.ignoretext \
  --hidden-import=marker.processors.line_numbers \
  --hidden-import=marker.processors.line_merge \
  --hidden-import=marker.processors.line_numbers_processor \
  --hidden-import=marker.processors.list_processor \
  --hidden-import=marker.processors.table_processor \
  --hidden-import=marker.processors.equation_processor \
  --hidden-import=marker.processors.code_processor \
  --hidden-import=marker.processors.document_processor \
  --hidden-import=marker.processors.text_processor \
  --hidden-import=marker.processors.heading_processor \
  --hidden-import=marker.processors.ignoretext_processor \
  --hidden-import=marker.processors.line_merge_processor \
  --hidden-import=marker.processors.line_numbers_processor \
  --hidden-import=marker.processors.list_processor \
  --hidden-import=marker.processors.table_processor \
  --hidden-import=marker.processors.equation_processor \
  --hidden-import=marker.processors.code_processor \
  --hidden-import=marker.processors.document_processor \
  --hidden-import=marker.processors.text_processor \
  --hidden-import=marker.processors.heading_processor \
  --hidden-import=marker.processors.ignoretext_processor \
  --hidden-import=marker.processors.line_merge_processor \
  --collect-all=marker \
  --collect-all=scipy \
  --collect-all=numpy \
  --collect-all=torch \
  --collect-all=PIL \
  --collect-all=fitz \
  marker-entry.py

# 创建版本文件
echo "1.10.2" > dist/marker-engine/VERSION

# 查看结果
echo ""
echo "=== 打包完成 ==="
echo "输出目录: dist/marker-engine/"
ls -lh dist/marker-engine/ | head -5
echo ""
du -sh dist/marker-engine/

# 清理
echo ""
echo "清理虚拟环境..."
deactivate
rm -rf $VENV_DIR build *.spec

echo ""
echo "✓ 完成！可以测试: ./dist/marker-engine/marker-engine --help"
