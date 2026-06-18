# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = []
binaries = []
hiddenimports = ['scipy', 'scipy.optimize', 'scipy.optimize._linprog_ip', 'scipy.sparse', 'scipy.sparse.csgraph', 'scipy.linalg', 'scipy.special', 'numpy', 'numpy.core', 'numpy.linalg', 'torch', 'torch.nn', 'torch.nn.functional', 'torch.optim', 'PIL', 'PIL.Image', 'fitz', 'pdfplumber', 'marker', 'marker.scripts', 'marker.scripts.convert_single', 'marker.converters', 'marker.models', 'marker.config', 'marker.config.parser', 'marker.schema', 'marker.schema.text', 'marker.renderers', 'marker.renderers.markdown', 'marker.providers', 'marker.providers.pdf', 'marker.processors', 'marker.processors.base', 'marker.processors.llm', 'marker.processors.document', 'marker.processors.text', 'marker.processors.table', 'marker.processors.equation', 'marker.processors.code', 'marker.processors.list', 'marker.processors.headings', 'marker.processors.ignoretext', 'marker.processors.line_numbers', 'marker.processors.line_merge', 'marker.processors.line_numbers_processor', 'marker.processors.list_processor', 'marker.processors.table_processor', 'marker.processors.equation_processor', 'marker.processors.code_processor', 'marker.processors.document_processor', 'marker.processors.text_processor', 'marker.processors.heading_processor', 'marker.processors.ignoretext_processor', 'marker.processors.line_merge_processor']
tmp_ret = collect_all('marker')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('scipy')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('numpy')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('torch')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('PIL')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('fitz')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['marker-entry.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='marker-engine',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='marker-engine',
)
