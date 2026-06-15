# PaperLens Windows 构建脚本
# 此脚本在 Windows 上自动构建完整的桌面应用

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$SkipTauri,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PaperLens Windows 构建工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查必要的工具
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Host "检查构建工具..." -ForegroundColor Yellow

$tools = @{
    "node" = "Node.js"
    "npm" = "npm"
    "rustc" = "Rust"
    "cargo" = "Cargo"
    "python" = "Python"
    "pip" = "pip"
}

$allToolsInstalled = $true
foreach ($tool in $tools.GetEnumerator()) {
    if (Test-Command $tool.Key) {
        $version = & $tool.Key --version 2>$null
        Write-Host "  ✓ $($tool.Value): $version" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($tool.Value): 未安装" -ForegroundColor Red
        $allToolsInstalled = $false
    }
}

if (-not $allToolsInstalled) {
    Write-Host ""
    Write-Host "错误：缺少必要的构建工具，请安装后重试" -ForegroundColor Red
    Write-Host "参考文档：WINDOWS_BUILD.md" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 清理旧的构建文件
if ($Clean) {
    Write-Host "清理旧的构建文件..." -ForegroundColor Yellow
    if (Test-Path "frontend/dist") { Remove-Item -Recurse -Force "frontend/dist" }
    if (Test-Path "backend/dist") { Remove-Item -Recurse -Force "backend/dist" }
    if (Test-Path "backend/build") { Remove-Item -Recurse -Force "backend/build" }
    if (Test-Path "src-tauri/target") { Remove-Item -Recurse -Force "src-tauri/target" }
    Write-Host "  ✓ 清理完成" -ForegroundColor Green
    Write-Host ""
}

# 构建前端
if (-not $SkipFrontend) {
    Write-Host "构建前端..." -ForegroundColor Yellow
    Set-Location frontend
    
    Write-Host "  安装依赖..." -ForegroundColor Gray
    npm install --silent
    
    Write-Host "  构建生产版本..." -ForegroundColor Gray
    npm run build
    
    Set-Location ..
    Write-Host "  ✓ 前端构建完成" -ForegroundColor Green
    Write-Host ""
}

# 构建后端
if (-not $SkipBackend) {
    Write-Host "构建后端..." -ForegroundColor Yellow
    Set-Location backend
    
    Write-Host "  安装依赖..." -ForegroundColor Gray
    pip install -r requirements.txt --quiet
    pip install pyinstaller --quiet
    
    Write-Host "  使用 PyInstaller 打包..." -ForegroundColor Gray
    pyinstaller main.spec --clean --noconfirm
    
    Set-Location ..
    
    # 复制后端到 Tauri 资源目录
    Write-Host "  复制到 Tauri 资源目录..." -ForegroundColor Gray
    if (-not (Test-Path "src-tauri/resources/backend")) {
        New-Item -ItemType Directory -Path "src-tauri/resources/backend" -Force | Out-Null
    }
    
    Copy-Item -Path "backend/dist/main/main.exe" -Destination "src-tauri/resources/backend/" -Force
    
    # 复制 _internal 目录（如果存在）
    if (Test-Path "backend/dist/main/_internal") {
        Copy-Item -Path "backend/dist/main/_internal" -Destination "src-tauri/resources/backend/" -Recurse -Force
    }
    
    # 复制配置文件
    if (Test-Path "backend/config") {
        Copy-Item -Path "backend/config" -Destination "src-tauri/resources/backend/" -Recurse -Force
    }
    
    Write-Host "  ✓ 后端构建完成" -ForegroundColor Green
    Write-Host ""
}

# 构建 Tauri 应用
if (-not $SkipTauri) {
    Write-Host "构建 Tauri 应用..." -ForegroundColor Yellow
    
    Write-Host "  编译 Rust 代码..." -ForegroundColor Gray
    npx tauri build --bundles msi,nsis
    
    Write-Host "  ✓ Tauri 构建完成" -ForegroundColor Green
    Write-Host ""
}

# 显示结果
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  构建完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$msiFiles = Get-ChildItem -Path "src-tauri/target/release/bundle/msi" -Filter "*.msi" -ErrorAction SilentlyContinue
$nsisFiles = Get-ChildItem -Path "src-tauri/target/release/bundle/nsis" -Filter "*.exe" -ErrorAction SilentlyContinue

if ($msiFiles) {
    Write-Host "MSI 安装包:" -ForegroundColor Yellow
    foreach ($file in $msiFiles) {
        $size = [math]::Round($file.Length / 1MB, 2)
        Write-Host "  📦 $($file.Name) ($size MB)" -ForegroundColor White
        Write-Host "     $($file.FullName)" -ForegroundColor Gray
    }
    Write-Host ""
}

if ($nsisFiles) {
    Write-Host "NSIS 安装包:" -ForegroundColor Yellow
    foreach ($file in $nsisFiles) {
        $size = [math]::Round($file.Length / 1MB, 2)
        Write-Host "  📦 $($file.Name) ($size MB)" -ForegroundColor White
        Write-Host "     $($file.FullName)" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "下一步:" -ForegroundColor Cyan
Write-Host "  1. 测试安装包是否正常工作" -ForegroundColor White
Write-Host "  2. 创建 Git tag 并推送触发自动构建:" -ForegroundColor White
Write-Host "     git tag v0.1.0" -ForegroundColor Gray
Write-Host "     git push origin v0.1.0" -ForegroundColor Gray
Write-Host ""
