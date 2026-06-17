@echo off
setlocal enabledelayedexpansion

REM MinerU Engine Windows 打包脚本 (venv 方案)
REM 在 Windows 机器上运行，生成 Windows 平台的引擎包

set "MINERU_VERSION=3.2.1"
echo === MinerU Engine Windows Build v%MINERU_VERSION% ===

REM ==================== 1. 检查 Python ====================
echo.
echo 1. Checking Python version...
set "PYTHON="
for %%P in (python3.13 python3.12 python3.11 python3.10 python) do (
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

REM ==================== 2. 创建构建 venv ====================
echo.
echo 2. Creating build virtual environment...
set "BUILD_VENV=venv-mineru-build-win"
if exist "%BUILD_VENV%" rmdir /s /q "%BUILD_VENV%"
%PYTHON% -m venv "%BUILD_VENV%"
call "%BUILD_VENV%\Scripts\activate.bat"

REM ==================== 3. 安装依赖 ====================
echo.
echo 3. Installing dependencies...
pip install --upgrade pip

echo    Installing PyTorch (CPU version)...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

echo    Installing MinerU %MINERU_VERSION%...
pip install "mineru[all]==%MINERU_VERSION%"

REM 验证
echo.
echo 4. Verifying MinerU installation...
mineru --version
echo    MinerU installed successfully
pip list | findstr /i "mineru torch transformers paddle"

REM ==================== 4. 构建引擎包 ====================
echo.
echo 5. Building engine package...
set "ENGINE_DIR=dist\mineru-engine"
if exist "%ENGINE_DIR%" rmdir /s /q "%ENGINE_DIR%"
mkdir "%ENGINE_DIR%"

echo    Creating distributable venv...
%PYTHON% -m venv "%ENGINE_DIR%\.venv" --copies

echo    Installing dependencies in engine venv (this may take several minutes)...
"%ENGINE_DIR%\.venv\Scripts\pip.exe" install --upgrade pip
"%ENGINE_DIR%\.venv\Scripts\pip.exe" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
"%ENGINE_DIR%\.venv\Scripts\pip.exe" install "mineru[all]==%MINERU_VERSION%"

echo    Verifying engine venv...
"%ENGINE_DIR%\.venv\Scripts\mineru.exe" --version
echo    Engine venv verified

REM ==================== 5. 创建 wrapper 脚本 ====================
echo.
echo 6. Creating wrapper scripts...

REM Windows .bat wrapper
(
echo @echo off
echo setlocal enabledelayedexpansion
echo.
echo REM MinerU Engine Wrapper for Windows
echo set "SCRIPT_DIR=%%~dp0"
echo set "VENV_DIR=%%SCRIPT_DIR%%.venv"
echo set "PYVENV_CFG=%%VENV_DIR%%\pyvenv.cfg"
echo.
echo REM Find Python 3.10+
echo set "PYTHON="
echo for %%%%P in ^(python3.13 python3.12 python3.11 python3.10 python py^) do ^(
echo     where %%%%P ^>nul 2^>^&1
echo     if !errorlevel! == 0 ^(
echo         for /f "tokens=*" %%%%V in ^('%%%%P -c "import sys; print^(f'^{sys.version_info.major^}.^{sys.version_info.minor^}'^)" 2^^^^>nul'^) do ^(
echo             for /f "tokens=2 delims=." %%%%M in ^("%%%%V"^) do ^(
echo                 if %%%%M GEQ 10 ^(
echo                     if "!PYTHON!"=="" ^(
echo                         set "PYTHON=%%%%P"
echo                         set "PYTHON_VERSION=%%%%V"
echo                     ^)
echo                 ^)
echo             ^)
echo         ^)
echo     ^)
echo ^)
echo.
echo if "%%PYTHON%%"=="" ^(
echo     echo Error: Python 3.10+ required. Please install from https://www.python.org/downloads/ ^>^&2
echo     exit /b 1
echo ^)
echo.
echo REM Fix pyvenv.cfg home path
echo for /f "tokens=*" %%%%H in ^('%%PYTHON%% -c "import sys, os; print^(os.path.dirname^(sys.executable^)^)"'^) do set "PYTHON_HOME=%%%%H"
echo if exist "%%PYVENV_CFG%%" ^(
echo     %%PYTHON%% -c "import sys; cfg='%%PYVENV_CFG%%'.replace^('\\','\\\\'^); lines=open^(cfg^).readlines^(^); f=open^(cfg,'w'^); [f.write^((^'home = ^'+sys.executable.rsplit^('\\',1^)[0]+'\\n'^) if l.startswith^(^'home = ^'^) else l^) for l in lines]; f.close^(^)"
echo ^)
echo.
echo REM Model cache
echo set "BUNDLED_MODELS=%%SCRIPT_DIR%%models\huggingface"
echo if exist "%%BUNDLED_MODELS%%\*" ^(
echo     set "HF_HOME=%%BUNDLED_MODELS%%"
echo     echo [MinerU] Using bundled models: %%BUNDLED_MODELS%% ^>^&2
echo ^) else ^(
echo     if "%%HF_HOME%%"=="" set "HF_HOME=%%USERPROFILE%%\.cache\paperlens\huggingface"
echo     if "%%MINERU_MODEL_SOURCE%%"=="" set "MINERU_MODEL_SOURCE=modelscope"
echo ^)
echo if not exist "%%HF_HOME%%" mkdir "%%HF_HOME%%"
echo.
echo echo [MinerU] Using Python: %%PYTHON%% ^(%%PYTHON_VERSION%%^) ^>^&2
echo.
echo REM Run mineru CLI
echo "%%VENV_DIR%%\Scripts\python.exe" -m mineru.cli.client %%*
) > "%ENGINE_DIR%\mineru-engine.bat"

REM ==================== 6. 版本和元信息 ====================
echo %MINERU_VERSION% > "%ENGINE_DIR%\VERSION"

REM engine.json
(
echo {
echo     "name": "mineru",
echo     "version": "%MINERU_VERSION%",
echo     "type": "venv",
echo     "platform": "windows-x86_64",
echo     "python_version": "%PYTHON_VERSION%",
echo     "built_at": "%DATE% %TIME%"
echo }
) > "%ENGINE_DIR%\engine.json"

REM ==================== 7. 清理 ====================
echo.
echo 7. Cleaning up...
deactivate
rmdir /s /q "%BUILD_VENV%"

REM ==================== 8. 结果 ====================
echo.
echo === Build complete ===
echo Output: %ENGINE_DIR%\
echo.
echo Directory structure:
echo   mineru-engine.bat    Wrapper script
echo   .venv\               Python venv with all dependencies
echo   VERSION              Version number
echo   engine.json          Engine metadata
echo.
dir /s "%ENGINE_DIR%" | findstr /c:"File(s)"
echo.
echo Done! Test command:
echo   %ENGINE_DIR%\mineru-engine.bat --help
echo   %ENGINE_DIR%\mineru-engine.bat -p test.pdf -o output\ -b pipeline

pause
