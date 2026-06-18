@echo off
setlocal enabledelayedexpansion

REM ===============================================================
REM Marker Engine Windows Build (venv + wrapper, pinned torch)
REM ===============================================================
REM Key fix: pin torch to a version within marker-pdf's allowed range
REM   marker-pdf 1.10.2 requires torch>=2.7.0,<3.0.0
REM   pip's default --index-url pytorch.org picks latest (2.12.x) which
REM   breaks torchvision::nms registration. We pin torch==2.7.1 to be safe.
REM ===============================================================

set "MARKER_VERSION=1.10.2"
set "TORCH_VERSION=2.7.1"

echo === Marker Engine Windows Build ===
echo     marker-pdf:    %MARKER_VERSION%
echo     torch:         %TORCH_VERSION%  (pinned for stability)
echo     transformers:  auto-resolved by pip
echo.

REM ==================== 0. Clean leftover junk ====================
echo [0/6] Cleaning leftover artifacts...
cd /d "%~dp0"
if exist "dist\marker-engine\nul')" del /F /Q "dist\marker-engine\nul')" >nul 2>&1
if exist "dist\marker-engine" rmdir /s /q "dist\marker-engine"
if exist "venv-marker-build-win" rmdir /s /q "venv-marker-build-win"

REM ==================== 1. Find Python 3.10+ ====================
echo.
echo [1/6] Looking for Python 3.10+...
set "PYTHON="
for %%P in (python py python3.11 python3.10 python3) do (
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
set "ENGINE_DIR=%~dp0dist\marker-engine"
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

REM Skip pip self-upgrade (modern pip refuses direct pip.exe upgrade;
REM venv's bundled pip 23.0.1 is already good enough for installs).
echo     - using venv pip: !PIP!

echo     - torch==%TORCH_VERSION% (CPU build from PyPI)
"!PIP!" install torch==%TORCH_VERSION%
if errorlevel 1 (
    echo     ERROR: torch install failed
    exit /b 1
)

echo     - marker-pdf==%MARKER_VERSION% (pip will resolve transformers + surya-ocr automatically)
"!PIP!" install marker-pdf==%MARKER_VERSION%
if errorlevel 1 (
    echo     ERROR: marker-pdf install failed
    exit /b 1
)

REM ==================== 4. Verify marker ====================
echo.
echo [4/6] Verifying marker_single works...
"!ENGINE_DIR!\.venv\Scripts\marker_single.exe" --help >nul 2>&1
if errorlevel 1 (
    echo     ERROR: marker_single.exe failed to start.
    echo     The build is broken. Check the error above.
    exit /b 1
)
echo     marker_single.exe is working

REM Show installed versions
echo.
echo     Installed package versions:
"!PIP!" list 2>nul | findstr /i /C:"torch " /C:"marker-pdf" /C:"transformers " /C:"surya-ocr"

REM ==================== 5. Copy wrapper ====================
echo.
echo [5/6] Copying wrapper script...
copy /Y "%~dp0marker-engine-wrapper.bat" "!ENGINE_DIR!\marker-engine.bat" >nul
if errorlevel 1 (
    echo     ERROR: failed to copy wrapper
    exit /b 1
)
echo     marker-engine.bat copied

REM ==================== 6. Write metadata ====================
echo.
echo [6/6] Writing metadata...

> "!ENGINE_DIR!\VERSION" echo %MARKER_VERSION%

(
    echo {
    echo     "name": "marker",
    echo     "version": "%MARKER_VERSION%",
    echo     "type": "venv",
    echo     "platform": "windows-x86_64",
    echo     "torch_version": "%TORCH_VERSION%"
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
echo   "!ENGINE_DIR!\marker-engine.bat" --help
echo   "!ENGINE_DIR!\marker-engine.bat" your.pdf --output_dir output\
echo.
echo Next: zip the dist\marker-engine folder for distribution
echo.
pause
