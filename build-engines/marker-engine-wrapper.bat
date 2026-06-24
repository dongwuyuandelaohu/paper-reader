@echo off
setlocal

REM ===============================================================
REM Marker Engine Wrapper for Windows (simplified)
REM  - Calls the venv's marker_single.exe directly
REM  - No Python version detection needed (venv was built with 3.10+)
REM  - Sets HF_HOME for model cache
REM ===============================================================

set "SCRIPT_DIR=%~dp0"
set "VENV_DIR=%SCRIPT_DIR%.venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"

REM Sanity check - use python.exe instead of marker_single.exe to avoid hardcoded path issues
if not exist "%PYTHON_EXE%" (
    echo [Marker] ERROR: python.exe not found at:
    echo   %PYTHON_EXE%
    echo Please reinstall this engine.
    exit /b 1
)

REM Model cache location (skip the unreliable `if exist path\*` check)
set "BUNDLED_MODELS=%SCRIPT_DIR%models\huggingface"
set "MODELS_DIR=%SCRIPT_DIR%models"
if exist "%MODELS_DIR%" (
    set "HF_HOME=%BUNDLED_MODELS%"
) else (
    if "%HF_PROFILE%"=="" set "HF_PROFILE=%USERPROFILE%\.cache\paperlens"
    set "HF_HOME=%HF_PROFILE%\huggingface"
)
if not exist "%HF_HOME%" mkdir "%HF_HOME%" 2>nul

REM Surya/datalab uses its own cache (not HF_HOME) and its own S3 endpoint
REM Override these with env vars BEFORE running marker:
REM   set S3_BASE_URL=https://your-mirror    <- change model download source
REM   set MODEL_CACHE_DIR=...                  <- change model cache dir
REM Default: keep paperlens-friendly cache location
if not defined MODEL_CACHE_DIR set "MODEL_CACHE_DIR=%HF_PROFILE%\datalab-models"
if not exist "%MODEL_CACHE_DIR%" mkdir "%MODEL_CACHE_DIR%" 2>nul

REM Mirror endpoint for HuggingFace transformers (surya uses S3, but transformers uses HF)
REM To use a Chinese mirror, set HF_ENDPOINT before calling this script:
REM   set HF_ENDPOINT=https://hf-mirror.com
if not defined HF_ENDPOINT set "HF_ENDPOINT=https://hf-mirror.com"

echo [Marker] Engine dir:    %SCRIPT_DIR%
echo [Marker] HF_HOME:       %HF_HOME%
echo [Marker] DATALAB cache: %MODEL_CACHE_DIR%
echo [Marker] HF_ENDPOINT:   %HF_ENDPOINT%

REM Run marker CLI via python.exe (avoids hardcoded path issues in marker_single.exe)
"%PYTHON_EXE%" -c "from marker.scripts.convert_single import convert_single_cli; convert_single_cli()" %*
