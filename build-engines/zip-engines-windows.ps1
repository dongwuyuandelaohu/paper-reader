# 压缩引擎为 zip 文件 (Windows PowerShell)
# 用法: .\zip-engines-windows.ps1 [-EngineType marker|mineru|all]

param(
    [string]$EngineType = "all"
)

$ErrorActionPreference = "Stop"

$MARKER_VERSION = if ($env:MARKER_VERSION) { $env:MARKER_VERSION } else { "1.10.2" }
$MINERU_VERSION = if ($env:MINERU_VERSION) { $env:MINERU_VERSION } else { "3.2.1" }

Write-Host "=== Compressing engine files ===" -ForegroundColor Cyan

Set-Location dist

# Compress Marker engine
if ($EngineType -eq "marker" -or $EngineType -eq "all") {
    if (Test-Path "marker-engine") {
        Write-Host "Compressing Marker engine..." -ForegroundColor Yellow
        $ZIP_NAME = "marker-engine-v${MARKER_VERSION}-windows-x86_64.zip"
        if (Test-Path $ZIP_NAME) { Remove-Item $ZIP_NAME }
        Compress-Archive -Path "marker-engine" -DestinationPath $ZIP_NAME -Force
        Write-Host "OK Marker compressed: $ZIP_NAME" -ForegroundColor Green
        $size = [math]::Round((Get-Item $ZIP_NAME).Length / 1MB, 2)
        Write-Host "   Size: ${size} MB" -ForegroundColor Gray

        # Calculate SHA256
        $sha = (Get-FileHash $ZIP_NAME -Algorithm SHA256).Hash
        Write-Host "SHA256: $sha" -ForegroundColor Gray
    } else {
        Write-Host "WARN: marker-engine directory not found, skipping" -ForegroundColor Yellow
    }
}

# Compress MinerU engine
if ($EngineType -eq "mineru" -or $EngineType -eq "all") {
    if (Test-Path "mineru-engine") {
        Write-Host "Compressing MinerU engine..." -ForegroundColor Yellow
        $ZIP_NAME = "mineru-engine-v${MINERU_VERSION}-windows-x86_64.zip"
        if (Test-Path $ZIP_NAME) { Remove-Item $ZIP_NAME }
        Compress-Archive -Path "mineru-engine" -DestinationPath $ZIP_NAME -Force
        Write-Host "OK MinerU compressed: $ZIP_NAME" -ForegroundColor Green
        $size = [math]::Round((Get-Item $ZIP_NAME).Length / 1MB, 2)
        Write-Host "   Size: ${size} MB" -ForegroundColor Gray

        # Calculate SHA256
        $sha = (Get-FileHash $ZIP_NAME -Algorithm SHA256).Hash
        Write-Host "SHA256: $sha" -ForegroundColor Gray
    } else {
        Write-Host "WARN: mineru-engine directory not found, skipping" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Compression complete ===" -ForegroundColor Cyan
Write-Host "Upload these files to GitHub Release:" -ForegroundColor Yellow
Get-ChildItem *.zip -ErrorAction SilentlyContinue | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  $($_.Name) (${size} MB)" -ForegroundColor White
}
Write-Host ""
Write-Host "After uploading, update SHA256 in backend/config/engine_packages.json" -ForegroundColor Yellow
