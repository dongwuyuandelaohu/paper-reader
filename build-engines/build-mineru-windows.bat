@echo off
setlocal enabledelayedexpansion

REM ===============================================================
REM MinerU Engine Windows Build (venv + wrapper, pinned torch)
REM ===============================================================
REM Mirrors build-marker-venv-windows.bat structure.
REM Notes for MinerU 3.2.0:
REM   - Entry point: mineru.exe (console_scripts)
REM   - Defaults model source to ModelScope (China-friendly)
REM ===============================================================

set "MINERU_VERSION=3.2.0"
set "TORCH_VERSION=2.7.1"

echo === MinerU Engine Windows Build ===
echo     mineru:        %MINERU_VERSION%
echo     torch:         %TORCH_VERSION%  (pinned for stability)
echo.

REM ==================== 0. Clean leftover junk ====================
echo [0/6] Cleaning leftover artifacts...
cd /d "%~dp0"
if exist "dist\mineru-engine\nul')" del /F /Q "dist\mineru-engine\nul')" >nul 2>&1
if exist "dist\mineru-engine" rmdir /s /q "dist\mineru-engine"
if exist "venv-mineru-build-win" rmdir /s /q "venv-mineru-build-win"

REM ==================== 1. Find Python 3.10+ ====================
echo.
echo [1/6] Looking for Python 3.10+...
set "PYTHON="
for %%P in (python py python3.13 python3.12 python3.11 python3.10 python3) do (
    if not defined PYTHON (
        where %%P >nul 2>&1
        if !errorlevel! == 0 (
            REM Compute version as single integer: 3.10 -> 310
            for /f "tokens=*" %%V in ('%%P -c "import sys;v=sys.version_info;print(v[0]*100+v[1])" 2^>nul') do (
                if %%V GEQ 310 (
                    if %%V LSS 320 (
                        set "PYTHON=%%P"
                    )
                )
            )
        )
    )
)

if not defined PYTHON (
    echo     ERROR: Python 3.10 or 3.11 not found on PATH.
    echo     Download Python 3.11 from https://www.python.org/downloads/
    echo     ^(Make sure to check "Add Python to PATH" during install^)
    exit /b 1
)
echo     Found: !PYTHON!

REM ==================== 2. Create engine venv ====================
echo.
echo [2/6] Creating engine virtual environment...
set "ENGINE_DIR=%~dp0dist\mineru-engine"
mkdir "!ENGINE_DIR!"
"!PYTHON!" -m venv "!ENGINE_DIR!\.venv" --copies
if errorlevel 1 (
    echo     ERROR: failed to create venv
    exit /b 1
)
echo     Created: !ENGINE_DIR!\.venv

REM ==================== 3. Install dependencies ====================
echo.
echo [3/6] Installing dependencies (this may take several minutes)...
set "PIP=!ENGINE_DIR!\.venv\Scripts\pip.exe"
set "PYTHON_EXE=!ENGINE_DIR!\.venv\Scripts\python.exe"

REM Upgrade pip first (venv's bundled pip 23.0.1 is too old to resolve
REM newer package metadata; use python -m pip to avoid the "can't
REM modify pip directly" error).
echo     - upgrading pip (via python -m pip)...
"!PYTHON_EXE!" -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo     ERROR: pip upgrade failed
    exit /b 1
)
echo     - using pip: !PIP!

echo     - torch==%TORCH_VERSION% (CPU build from PyPI)
"!PIP!" install torch==%TORCH_VERSION%
if errorlevel 1 (
    echo     ERROR: torch install failed
    exit /b 1
)

echo     - mineru[all]==%MINERU_VERSION% (pip will resolve paddlepaddle + others)
echo       NOTE: forcing torch==%TORCH_VERSION% to avoid pip re-downloading 2.8.0
"!PIP!" install "mineru[all]==%MINERU_VERSION%" torch==%TORCH_VERSION% scipy
if errorlevel 1 (
    echo     ERROR: mineru install failed
    exit /b 1
)

REM ==================== 4. Verify mineru ====================
echo.
echo [4/6] Verifying mineru works...
"!ENGINE_DIR!\.venv\Scripts\mineru.exe" --version >nul 2>&1
if errorlevel 1 (
    echo     ERROR: mineru.exe failed to start. Check the error above.
    exit /b 1
)
echo     mineru.exe is working

REM Show installed versions
echo.
echo     Installed package versions:
"!PIP!" list 2>nul | findstr /i /C:"mineru " /C:"torch " /C:"transformers " /C:"paddlepaddle " /C:"paddleocr "

REM ==================== 5. Copy wrapper ====================
echo.
echo [5/6] Copying wrapper script...
copy /Y "%~dp0mineru-engine-wrapper.bat" "!ENGINE_DIR!\mineru-engine.bat" >nul
if errorlevel 1 (
    echo     ERROR: failed to copy wrapper
    exit /b 1
)
echo     mineru-engine.bat copied

REM ==================== 6. Write metadata ====================
echo.
echo [6/6] Writing metadata...

> "!ENGINE_DIR!\VERSION" echo %MINERU_VERSION%

(
    echo {
    echo     "name": "mineru",
    echo     "version": "%MINERU_VERSION%",
    echo     "type": "venv",
    echo     "platform": "windows-x86_64",
    echo     "torch_version": "%TORCH_VERSION%",
    echo     "model_source": "modelscope"
    echo }
) > "!ENGINE_DIR!\engine.json"

echo     VERSION and engine.json written

REM ==================== Done ====================
echo.
echo === Build complete ===
echo.
echo Output: !ENGINE_DIR!\
echo.
echo Test commands:
echo   "!ENGINE_DIR!\mineru-engine.bat" --help
echo   "!ENGINE_DIR!\mineru-engine.bat" -p your.pdf -o output\ -b pipeline
echo.
echo Next: zip the dist\mineru-engine folder for distribution
echo.
pause
