<#
.SYNOPSIS
  Package a PaperLens engine (marker or mineru) into a distributable zip.

.DESCRIPTION
  - Compresses dist\<engine>-engine\ to a versioned zip
  - Computes SHA256 for the zip
  - Optionally updates backend\config\engine_packages.json with the new
    URL and SHA256 so the in-app downloader uses the new asset
  - Prints the final GitHub Release download URL template

.PARAMETER Engine
  marker or mineru (case-insensitive)

.PARAMETER Version
  Override the version string (otherwise read from dist\<engine>-engine\VERSION)

.PARAMETER Repo
  GitHub repo in the form "owner/name". Default: paperlens/paper-reader

.PARAMETER Tag
  Release tag. Default: <engine>-<version>

.PARAMETER OutDir
  Where the zip is written. Default: build-engines\dist

.EXAMPLE
  .\package-engine.ps1 -Engine marker
  .\package-engine.ps1 -Engine mineru -Version 3.2.1
  .\package-engine.ps1 -Engine marker -Repo myname/paper-reader
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("marker", "mineru")]
    [string]$Engine,

    [string]$Version,

    [string]$Repo = "paperlens/paper-reader",

    [string]$Tag,

    [string]$OutDir
)

$ErrorActionPreference = "Stop"

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutDir) { $OutDir = Join-Path $ScriptDir "dist" }
$EngineDir = Join-Path $OutDir "$Engine-engine"

if (-not (Test-Path $EngineDir)) {
    throw "Engine directory not found: $EngineDir`nRun build-$Engine-windows.bat first."
}

# Read version from VERSION file if not provided
if (-not $Version) {
    $VersionFile = Join-Path $EngineDir "VERSION"
    if (Test-Path $VersionFile) {
        $Version = (Get-Content $VersionFile -Raw).Trim()
    } else {
        throw "Cannot determine version: -Version not given and $VersionFile missing."
    }
}
if (-not $Tag) { $Tag = "$Engine-$Version" }

$Platform = "windows-x86_64"
$ZipName = "$Engine-engine-v$Version-$Platform.zip"
$ZipPath = Join-Path $OutDir $ZipName

Write-Host "=== Packaging $Engine engine ===" -ForegroundColor Cyan
Write-Host "  Engine dir : $EngineDir"
Write-Host "  Version    : $Version"
Write-Host "  Output zip : $ZipPath"
Write-Host ""

# 1. Remove old zip if present
if (Test-Path $ZipPath) {
    Write-Host "Removing old zip..." -ForegroundColor Yellow
    Remove-Item $ZipPath -Force
}

# 2. Compress
Write-Host "Compressing (this can take a while for .venv bundles)..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Compress-Archive -Path $EngineDir -DestinationPath $ZipPath -CompressionLevel Optimal
$sw.Stop()
Write-Host ("  Done in {0:N1}s" -f $sw.Elapsed.TotalSeconds) -ForegroundColor Green

$SizeBytes = (Get-Item $ZipPath).Length
$SizeMB = [math]::Round($SizeBytes / 1MB, 2)
Write-Host "  Size       : $SizeMB MB" -ForegroundColor Gray

# 3. SHA256
$Sha = (Get-FileHash $ZipPath -Algorithm SHA256).Hash
Write-Host "  SHA256     : $Sha" -ForegroundColor Gray
Write-Host ""

# 4. Compute download URL (template)
$DownloadUrl = "https://github.com/$Repo/releases/download/$Tag/$ZipName"
$ReleaseUrl = "https://github.com/$Repo/releases/tag/$Tag"
Write-Host "=== Release info ===" -ForegroundColor Cyan
Write-Host "  Repo       : $Repo"
Write-Host "  Tag        : $Tag"
Write-Host "  Asset      : $ZipName"
Write-Host "  Download   : $DownloadUrl"
Write-Host "  Release    : $ReleaseUrl"
Write-Host ""

# 5. Optionally update backend\config\engine_packages.json
$ConfigFile = Join-Path $ScriptDir "..\backend\config\engine_packages.json"
$ConfigFile = [System.IO.Path]::GetFullPath($ConfigFile)
if (Test-Path $ConfigFile) {
    Write-Host "Updating $ConfigFile ..." -ForegroundColor Yellow
    try {
        $json = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        $engineNode = $json.$Engine
        if ($engineNode -and $engineNode.packages."$Platform") {
            $engineNode.packages."$Platform".url     = $DownloadUrl
            $engineNode.packages."$Platform".sha256   = $Sha
            $engineNode.packages."$Platform".size_mb  = $SizeMB
            $json.$Engine = $engineNode
            ($json | ConvertTo-Json -Depth 10) | Set-Content $ConfigFile -Encoding UTF8
            Write-Host "  Config updated." -ForegroundColor Green
        } else {
            Write-Host "  Skipped: no entry for $Engine / $Platform in config" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Failed to update config: $_" -ForegroundColor Red
    }
} else {
    Write-Host "Skipped config update: $ConfigFile not found." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Next: upload to GitHub Release" -ForegroundColor Yellow
Write-Host "  gh release create $Tag --repo $Repo --title `"$Engine v$Version`" --generate-notes" -ForegroundColor White
Write-Host "  gh release upload $Tag $ZipPath --repo $Repo --clobber" -ForegroundColor White
Write-Host ""
Write-Host "Or run upload-engine.ps1 -Engine $Engine -Version $Version to do it automatically." -ForegroundColor Gray
