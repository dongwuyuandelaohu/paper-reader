@echo off
REM PaperLens Windows 打包脚本

echo ========================================
echo PaperLens Windows 打包工具
echo ========================================

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python 未安装或不在 PATH 中
    echo 请安装 Python 3.8+ 并添加到 PATH
    pause
    exit /b 1
)

REM 获取项目根目录
set PROJECT_ROOT=%~dp0..
set BACKEND_DIR=%PROJECT_ROOT%\backend
set FRONTEND_DIR=%PROJECT_ROOT%\frontend
set BUILD_DIR=%~dp0

cd /d "%BUILD_DIR%"

echo.
echo [1/4] 检查前端构建...
if not exist "%FRONTEND_DIR%\dist\index.html" (
    echo [WARN] 前端未构建，正在构建...
    cd /d "%FRONTEND_DIR%"
    call npm install
    call npm run build
    if errorlevel 1 (
        echo [ERROR] 前端构建失败
        pause
        exit /b 1
    )
    cd /d "%BUILD_DIR%"
)
echo [OK] 前端已构建

echo.
echo [2/4] 安装 PyInstaller...
pip install pyinstaller==6.11.1 >nul 2>&1
echo [OK] PyInstaller 已安装

echo.
echo [3/4] 打包后端...
pyinstaller --clean PaperLens.spec
if errorlevel 1 (
    echo [ERROR] 打包失败
    pause
    exit /b 1
)
echo [OK] 后端打包完成

echo.
echo [4/4] 创建发布包...
set DIST_DIR=%BUILD_DIR%\dist\PaperLens
set OUTPUT_DIR=%BUILD_DIR%\release

REM 创建发布目录
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM 复制必要文件
copy "%BACKEND_DIR%\config\engine_packages.json" "%DIST_DIR%\config\" >nul
copy "%PROJECT_ROOT%\README.md" "%DIST_DIR%\" >nul

REM 创建压缩包
cd /d "%DIST_DIR%"
cd ..
tar -czf "%OUTPUT_DIR%\PaperLens-windows-x86_64.tar.gz" PaperLens

echo.
echo ========================================
echo 打包完成！
echo 输出文件: %OUTPUT_DIR%\PaperLens-windows-x86_64.tar.gz
echo 可执行文件: %DIST_DIR%\PaperLens.exe
echo ========================================
echo.
echo 运行测试:
echo   cd %DIST_DIR%
echo   PaperLens.exe
echo.
pause
