# -*- mode: python ; coding: utf-8 -*-
"""
PaperLens Backend - PyInstaller spec for Tauri desktop app
Run from backend/ directory: pyinstaller main.spec --clean --noconfirm
Output: dist/main/main.exe (onedir mode)
"""

import sys
from pathlib import Path

block_cipher = None

# SPECPATH is the directory containing this .spec file (i.e., backend/)
# When running `pyinstaller main.spec` from backend/, SPECPATH == backend/
backend_dir = Path(SPECPATH)
project_root = backend_dir.parent

a = Analysis(
    ['main.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=[
        # Config files needed at runtime
        ('config', 'config'),
    ],
    hiddenimports=[
        # uvicorn internals
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.wsproto_impl',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # FastAPI
        'fastapi',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'fastapi.responses',
        'fastapi.routing',
        # Pydantic v2
        'pydantic',
        'pydantic.deprecated',
        'pydantic.deprecated.decorator',
        'pydantic.deprecated.json',
        'pydantic.networks',
        'pydantic.types',
        # Async / database
        'aiosqlite',
        'sqlite3',
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        'anyio.streams',
        'anyio.streams.memory',
        # HTTP / multipart
        'httpx',
        'httpx._transports',
        'httpx._transports.default',
        'multipart',
        'python_multipart',
        'starlette',
        'starlette.middleware',
        'starlette.responses',
        'starlette.routing',
        'starlette.staticfiles',
        # OpenAI client
        'openai',
        'openai._client',
        'openai._streaming',
        # PyMuPDF
        'fitz',
        'fitz.fitz',
        # Pillow
        'PIL',
        'PIL.Image',
        # Config
        'config',
        'config.paths',
        # Services
        'services',
        'services.db',
        'services.dependencies',
        'services.engine_detector',
        'services.engine_installer',
        'services.ai',
        # API routers
        'api',
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
        # Engines
        'engines',
        'engines.pymupdf_engine',
        'engines.marker_engine',
        'engines.mineru_engine',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Standard library modules not needed
        'tkinter',
        'unittest',
        'pytest',
        'xmlrpc',
        'pydoc',
        # Large optional packages
        'IPython',
        'jupyter',
        'notebook',
        'matplotlib',
        'scipy',
        'numpy.testing',
        # Exclude heavy ML libraries (installed separately as engine plugins)
        'torch',
        'torchvision',
        'torchaudio',
        'transformers',
        'marker',
        'magic_pdf',
        'paddle',
        'paddleocr',
        # Exclude unused timezone data (reduces file count by 1200+)
        'pytz',
        'tzdata',
        'dateutil',
        'pandas',
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
    exclude_binaries=True,  # onedir mode
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Show console for debugging; set False for release
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='main',
)
