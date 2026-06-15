# -*- mode: python ; coding: utf-8 -*-
"""
PaperLens Windows 打包配置
"""

import os
import sys
from pathlib import Path

block_cipher = None

# 项目根目录
project_root = Path(SPECPATH).parent.parent

# 后端目录
backend_dir = project_root / 'backend'

# 前端构建输出目录
frontend_dist = project_root / 'frontend' / 'dist'

a = Analysis(
    [str(backend_dir / 'main.py')],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[
        # 前端静态文件
        (str(frontend_dist), 'static'),
        # 配置文件
        (str(backend_dir / 'config'), 'config'),
    ],
    hiddenimports=[
        # FastAPI 和 uvicorn
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        # Pydantic
        'pydantic.deprecated.decorator',
        'pydantic.deprecated.json',
        # 数据库
        'aiosqlite',
        'sqlite3',
        # 其他依赖
        'multipart',
        'python_multipart',
        'httpx',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        # API 模块
        'api.papers',
        'api.translate',
        'api.conversations',
        'api.models',
        'api.settings',
        'api.notes',
        'api.glossary',
        'api.system',
        'api.parse',
        'api.tags',
        # Services
        'services.db',
        'services.dependencies',
        'services.engine_detector',
        'services.engine_installer',
        'services.ai',
        # Engines
        'engines.pymupdf_engine',
        'engines.marker_engine',
        'engines.mineru_engine',
        # Config
        'config.paths',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # 排除不需要的模块
        'tkinter',
        'unittest',
        'pytest',
        'IPython',
        'jupyter',
        'notebook',
        'matplotlib',
        'scipy',
        'numpy.testing',
        # 排除大型 ML 库（用户会通过引擎安装器单独安装）
        'torch',
        'torchvision',
        'torchaudio',
        'transformers',
        'marker',
        'magic_pdf',
        'paddle',
        'paddleocr',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='PaperLens',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 显示控制台窗口（方便调试）
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # 可以添加图标文件路径
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='PaperLens',
)
