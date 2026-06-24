@echo off
setlocal

REM ===============================================================
REM MinerU Engine Wrapper for Windows (simplified)
REM  - Calls the venv's mineru.exe directly
REM  - No Python version detection needed (venv was built with 3.10+)
REM  - Sets HF_HOME and MINERU_MODEL_SOURCE for downloads
REM ===============================================================

set "SCRIPT_DIR=%~dp0"
set "PYTHON_EXE=%SCRIPT_DIR%.venv\Scripts\python.exe"

REM Sanity check - use python.exe instead of mineru.exe to avoid hardcoded path issues
if not exist "%PYTHON_EXE%" (
    echo [MinerU] ERROR: python.exe not found in venv at:
    echo   %PYTHON_EXE%
    echo Please reinstall this engine.
    exit /b 1
)

REM Default cache locations (user can override before calling)
if "%HF_PROFILE%"=="" set "HF_PROFILE=%USERPROFILE%\.cache\paperlens"
if not exist "%HF_PROFILE%" mkdir "%HF_PROFILE%" 2>nul

set "HF_HOME=%HF_PROFILE%\huggingface"
set "MINERU_CACHE_DIR=%HF_PROFILE%\mineru-models"
if not exist "%HF_HOME%" mkdir "%HF_HOME%" 2>nul
if not exist "%MINERU_CACHE_DIR%" mkdir "%MINERU_CACHE_DIR%" 2>nul

REM Default to ModelScope for China users (mineru[all] reads this)
REM To use HuggingFace instead, set MINERU_MODEL_SOURCE=huggingface before calling
if not defined MINERU_MODEL_SOURCE set "MINERU_MODEL_SOURCE=modelscope"

REM HuggingFace mirror (used by transformers/paddle etc.)
if not defined HF_ENDPOINT set "HF_ENDPOINT=https://hf-mirror.com"

REM Force CPU mode if no CUDA available (MinerU 3.x uses hybrid backend by default)
REM Check if CUDA is available via Python, and switch to pipeline backend if not
set "MINERU_ARGS=%*"
"%PYTHON_EXE%" -c "import torch; exit(0 if torch.cuda.is_available() else 1)" 2>nul
if errorlevel 1 (
    echo [MinerU] CUDA not available, using pipeline backend for CPU mode
    set "MINERU_ARGS=-b pipeline %*"
) else (
    echo [MinerU] CUDA available, using default hybrid-auto-engine backend
)

echo [MinerU] Engine dir:      %SCRIPT_DIR%
echo [MinerU] HF_HOME:         %HF_HOME%
echo [MinerU] MinerU cache:     %MINERU_CACHE_DIR%
echo [MinerU] Model source:    %MINERU_MODEL_SOURCE%
echo [MinerU] HF endpoint:     %HF_ENDPOINT%

REM Run mineru CLI via python.exe (avoids hardcoded path issues in mineru.exe)
"%PYTHON_EXE%" -c "from mineru.cli.client import main; main()" %MINERU_ARGS%
