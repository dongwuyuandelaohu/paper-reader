# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('config', 'config'),
    ],
    hiddenimports=[
        # uvicorn
        'uvicorn',
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
        # fastapi
        'fastapi',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'fastapi.responses',
        # aiosqlite
        'aiosqlite',
        # pydantic
        'pydantic',
        'pydantic.deprecated.decorator',
        'pydantic.deprecated.json',
        # multipart
        'multipart',
        'python_multipart',
        # httpx
        'httpx',
        # anyio
        'anyio',
        'anyio._backends',
        'anyio._backends._asyncio',
        # config
        'config',
        'config.paths',
        # services
        'services',
        'services.db',
        'services.dependencies',
        'services.engine_detector',
        'services.engine_installer',
        'services.ai',
        # api
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
        # engines
        'engines',
        'engines.pymupdf_engine',
        # fitz (PyMuPDF)
        'fitz',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
