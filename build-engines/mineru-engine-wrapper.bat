@echo off
setlocal

REM ===============================================================
REM MinerU Engine Wrapper for Windows (simplified)
REM  - Calls the venv's mineru CLI via python -m
REM  - No Python version detection needed (venv was built with 3.10+)
REM  - Sets HF_HOME and MINERU_MODEL_SOURCE for downloads
REM ===============================================================

set "SCRIPT_DIR=%~dp0"
set "VENV_PY=%SCRIPT_DIR%.venv\Scripts\python.exe"

REM Sanity check
if not exist "%VENV_PY%" (
    echo [MinerU] ERROR: python.exe not found in venv at:
    echo   %VENV_PY%
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

echo [MinerU] Engine dir:      %SCRIPT_DIR%
echo [MinerU] HF_HOME:         %HF_HOME%
echo [MinerU] MinerU cache:     %MINERU_CACHE_DIR%
echo [MinerU] Model source:    %MINERU_MODEL_SOURCE%
echo [MinerU] HF endpoint:     %HF_ENDPOINT%

REM Run mineru CLI via the venv's Python (MinerU 3.x has python -m mineru entry)
"%VENV_PY%" -m mineru %*
