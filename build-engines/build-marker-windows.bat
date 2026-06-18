@echo off
setlocal enabledelayedexpansion

REM Marker Engine Windows Build Script (PyInstaller --onedir)
REM Marker requires transformers 4.x, MinerU requires 5.x, so they MUST be built separately

set "MARKER_VERSION=1.10.2"
set "TRANSFORMERS_VERSION=4.46.3"
echo === Marker Engine Windows Build v%MARKER_VERSION% ===
echo    transformers: %TRANSFORMERS_VERSION%

REM ==================== 1. Check Python ====================
echo.
echo 1. Checking Python version...
set "PYTHON="
for %%P in (python3.11 python3.10 python3 python) do (
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
    echo    ERROR: Python 3.10+ required
    echo    Download from: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo    Found Python %PYTHON_VERSION% (%PYTHON%)

REM ==================== 2. Create build venv ====================
echo.
echo 2. Creating build virtual environment...
set "BUILD_VENV=venv-marker-build-win"
if exist "%BUILD_VENV%" rmdir /s /q "%BUILD_VENV%"
%PYTHON% -m venv "%BUILD_VENV%"
call "%BUILD_VENV%\Scripts\activate.bat"

REM ==================== 3. Install dependencies ====================
echo.
echo 3. Installing dependencies...
pip install --upgrade pip

echo    Installing PyTorch (CPU version)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

echo    Installing marker-pdf %MARKER_VERSION%...
pip install marker-pdf==%MARKER_VERSION%

echo    Pinning transformers to %TRANSFORMERS_VERSION%...
pip install transformers==%TRANSFORMERS_VERSION%

echo    Installing PyInstaller...
pip install pyinstaller

REM Verify
echo.
echo 4. Verifying marker installation...
marker_single --version
echo    Marker installed successfully
pip list | findstr /i "marker transformers torch"

REM ==================== 4. PyInstaller build ====================
echo.
echo 5. Running PyInstaller (--onedir mode)...

pyinstaller ^
  --name marker-engine ^
  --onedir ^
  --noconfirm ^
  --clean ^
  --hidden-import=scipy ^
  --hidden-import=scipy.optimize ^
  --hidden-import=scipy.optimize._linprog_ip ^
  --hidden-import=scipy.sparse ^
  --hidden-import=scipy.sparse.csgraph ^
  --hidden-import=scipy.linalg ^
  --hidden-import=scipy.special ^
  --hidden-import=numpy ^
  --hidden-import=numpy.core ^
  --hidden-import=numpy.linalg ^
  --hidden-import=torch ^
  --hidden-import=torch.nn ^
  --hidden-import=torch.nn.functional ^
  --hidden-import=torch.optim ^
  --hidden-import=PIL ^
  --hidden-import=PIL.Image ^
  --hidden-import=fitz ^
  --hidden-import=pdfplumber ^
  --hidden-import=marker ^
  --hidden-import=marker.scripts ^
  --hidden-import=marker.scripts.convert_single ^
  --hidden-import=marker.converters ^
  --hidden-import=marker.models ^
  --hidden-import=marker.config ^
  --hidden-import=marker.config.parser ^
  --hidden-import=marker.schema ^
  --hidden-import=marker.schema.text ^
  --hidden-import=marker.renderers ^
  --hidden-import=marker.renderers.markdown ^
  --hidden-import=marker.providers ^
  --hidden-import=marker.providers.pdf ^
  --hidden-import=marker.processors ^
  --hidden-import=marker.processors.base ^
  --hidden-import=marker.processors.llm ^
  --hidden-import=marker.processors.document ^
  --hidden-import=marker.processors.text ^
  --hidden-import=marker.processors.table ^
  --hidden-import=marker.processors.equation ^
  --hidden-import=marker.processors.code ^
  --hidden-import=marker.processors.list ^
  --hidden-import=marker.processors.headings ^
  --hidden-import=marker.processors.ignoretext ^
  --hidden-import=marker.processors.line_numbers ^
  --hidden-import=marker.processors.line_merge ^
  --hidden-import=marker.processors.line_numbers_processor ^
  --hidden-import=marker.processors.list_processor ^
  --hidden-import=marker.processors.table_processor ^
  --hidden-import=marker.processors.equation_processor ^
  --hidden-import=marker.processors.code_processor ^
  --hidden-import=marker.processors.document_processor ^
  --hidden-import=marker.processors.text_processor ^
  --hidden-import=marker.processors.heading_processor ^
  --hidden-import=marker.processors.ignoretext_processor ^
  --hidden-import=marker.processors.line_merge_processor ^
  --collect-all=marker ^
  --collect-all=scipy ^
  --collect-all=numpy ^
  --collect-all=torch ^
  --collect-all=PIL ^
  --collect-all=fitz ^
  marker-entry.py

REM ==================== 5. Post-build setup ====================
echo.
echo 6. Post-build setup...

set "ENGINE_DIR=dist\marker-engine"

REM Create VERSION file
echo %MARKER_VERSION% > "%ENGINE_DIR%\VERSION"

REM Create engine.json
(
echo {
echo     "name": "marker",
echo     "version": "%MARKER_VERSION%",
echo     "type": "pyinstaller",
echo     "platform": "windows-x86_64",
echo     "python_version": "%PYTHON_VERSION%",
echo     "transformers_version": "%TRANSFORMERS_VERSION%",
echo     "built_at": "%DATE% %TIME%"
echo }
) > "%ENGINE_DIR%\engine.json"

REM ==================== 6. Cleanup ====================
echo.
echo 7. Cleaning up...
deactivate
rmdir /s /q "%BUILD_VENV%"
rmdir /s /q build
del /q *.spec 2>nul

REM ==================== 7. Results ====================
echo.
echo === Build complete ===
echo Output: %ENGINE_DIR%\
echo.
echo Directory structure:
echo   marker-engine.exe    PyInstaller executable
echo   _internal\           Dependencies
echo   VERSION              Version number
echo   engine.json          Engine metadata
echo.
dir /s "%ENGINE_DIR%" | findstr /c:"File(s)"
echo.
echo Done! Test command:
echo   %ENGINE_DIR%\marker-engine.exe --help
echo   %ENGINE_DIR%\marker-engine.exe test.pdf --output_dir output\

pause
