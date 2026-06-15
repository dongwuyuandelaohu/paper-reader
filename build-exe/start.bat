@echo off
REM PaperLens 启动器

echo ========================================
echo    PaperLens 论文双语阅读工具
echo ========================================
echo.
echo 正在启动服务...
echo.

REM 获取当前目录
set CURRENT_DIR=%~dp0

REM 启动后端服务
start /B "" "%CURRENT_DIR%PaperLens.exe"

REM 等待服务启动
echo 等待服务启动...
timeout /t 3 /nobreak >nul

REM 打开浏览器
echo 正在打开浏览器...
start http://localhost:8765

echo.
echo ========================================
echo 服务已启动！
echo 访问地址: http://localhost:8765
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

REM 保持窗口打开，显示日志
"%CURRENT_DIR%PaperLens.exe"
