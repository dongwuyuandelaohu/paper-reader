# PaperLens Windows 构建脚本
# 此脚本在 Windows 上自动构建完整的桌面应用
#
# 使用方法:
#   .\build-windows.ps1              # 完整构建
#   .\build-windows.ps1 -SkipFrontend  # 跳过前端构建
#   .\build-windows.ps1 -SkipBackend   # 跳过后端构建
#   .\build-windows.ps1 -Clean         # 清理后重新构建

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

# Check required tools
function Test-Command($command) {
    try {
        Get-Command $command -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

Write-Host "Checking build tools..." -ForegroundColor Yellow

$tools = @{
    "node"   = "Node.js"
    "npm"    = "npm"
    "rustc"  = "Rust"
    "cargo"  = "Cargo"
    "python" = "Python"
    "pip"    = "pip"
}

$allToolsInstalled = $true
foreach ($tool in $tools.GetEnumerator()) {
    if (Test-Command $tool.Key) {
        $version = & $tool.Key --version 2>$null
        Write-Host "  OK $($tool.Value): $version" -ForegroundColor Green
    } else {
        Write-Host "  !! $($tool.Value): NOT INSTALLED" -ForegroundColor Red
        $allToolsInstalled = $false
    }
}

if (-not $allToolsInstalled) {
    Write-Host ""
    Write-Host "Error: missing build tools. Please install them first." -ForegroundColor Red
    Write-Host "See WINDOWS_BUILD.md for details." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Clean old build artifacts
if ($Clean) {
    Write-Host "Cleaning old build artifacts..." -ForegroundColor Yellow
    if (Test-Path "frontend/dist")         { Remove-Item -Recurse -Force "frontend/dist" }
    if (Test-Path "backend/dist")          { Remove-Item -Recurse -Force "backend/dist" }
    if (Test-Path "backend/build")         { Remove-Item -Recurse -Force "backend/build" }
    if (Test-Path "src-tauri/target")      { Remove-Item -Recurse -Force "src-tauri/target" }
    if (Test-Path "src-tauri/resources/backend") { Remove-Item -Recurse -Force "src-tauri/resources/backend" }
    Write-Host "  OK Cleaned" -ForegroundColor Green
    Write-Host ""
}

# ---- Step 1: Build Frontend ----
if (-not $SkipFrontend) {
    Write-Host "[1/3] Building frontend..." -ForegroundColor Yellow
    Set-Location frontend

    Write-Host "  Installing dependencies..." -ForegroundColor Gray
    npm install --silent

    Write-Host "  Building production bundle..." -ForegroundColor Gray
    npm run build

    Set-Location ..
    Write-Host "  OK Frontend built -> frontend/dist" -ForegroundColor Green
    Write-Host ""
}

# ---- Step 2: Build Backend (PyInstaller) ----
if (-not $SkipBackend) {
    Write-Host "[2/3] Building backend with PyInstaller..." -ForegroundColor Yellow
    Set-Location backend

    Write-Host "  Installing Python dependencies..." -ForegroundColor Gray
    pip install -r requirements.txt --quiet
    pip install pyinstaller --quiet

    Write-Host "  Running PyInstaller..." -ForegroundColor Gray
    pyinstaller main.spec --clean --noconfirm

    Set-Location ..

    # Verify output
    $backendExe = "backend/dist/main/main.exe"
    if (-not (Test-Path $backendExe)) {
        Write-Host "  ERROR: $backendExe was not created!" -ForegroundColor Red
        Write-Host "  PyInstaller may have failed. Check backend/dist/ for details." -ForegroundColor Yellow
        exit 1
    }

    # Copy backend to Tauri resources directory
    Write-Host "  Copying backend to Tauri resources..." -ForegroundColor Gray
    $tauriBackend = "src-tauri/resources/backend"
    if (Test-Path $tauriBackend) {
        Remove-Item -Recurse -Force $tauriBackend
    }
    # Copy the entire onedir output (main.exe + _internal/ + config/)
    Copy-Item -Path "backend/dist/main" -Destination $tauriBackend -Recurse -Force

    Write-Host "  OK Backend built -> $tauriBackend" -ForegroundColor Green
    Write-Host ""
}

# ---- Step 3: Build Tauri App ----
if (-not $SkipTauri) {
    Write-Host "[3/3] Building Tauri app..." -ForegroundColor Yellow

    Write-Host "  Compiling Rust + bundling..." -ForegroundColor Gray
    npx tauri build --bundles msi,nsis

    Write-Host "  OK Tauri build complete" -ForegroundColor Green
    Write-Host ""
}

# ---- Results ----
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$msiFiles  = Get-ChildItem -Path "src-tauri/target/release/bundle/msi"  -Filter "*.msi" -ErrorAction SilentlyContinue
$nsisFiles = Get-ChildItem -Path "src-tauri/target/release/bundle/nsis" -Filter "*.exe" -ErrorAction SilentlyContinue

if ($msiFiles) {
    Write-Host "MSI installer:" -ForegroundColor Yellow
    foreach ($file in $msiFiles) {
        $size = [math]::Round($file.Length / 1MB, 2)
        Write-Host "  $([char]0x1F4E6) $($file.Name) ($size MB)" -ForegroundColor White
        Write-Host "     $($file.FullName)" -ForegroundColor Gray
    }
    Write-Host ""
}

if ($nsisFiles) {
    Write-Host "NSIS installer:" -ForegroundColor Yellow
    foreach ($file in $nsisFiles) {
        $size = [math]::Round($file.Length / 1MB, 2)
        Write-Host "  $([char]0x1F4E6) $($file.Name) ($size MB)" -ForegroundColor White
        Write-Host "     $($file.FullName)" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test the installer on a Windows machine" -ForegroundColor White
Write-Host "  2. Create a git tag to trigger CI build:" -ForegroundColor White
Write-Host "     git tag v0.1.0 && git push origin v0.1.0" -ForegroundColor Gray
Write-Host ""
