<#
.SYNOPSIS
  Upload a packaged engine zip to a GitHub Release (uses gh CLI).

.DESCRIPTION
  Wraps `gh release create` and `gh release upload` for PaperLens engine
  zips produced by package-engine.ps1. The zip must already exist in
  build-engines\dist.

.PARAMETER Engine
  marker or mineru

.PARAMETER Version
  Engine version. If omitted, read from dist\<engine>-engine\VERSION

.PARAMETER Repo
  GitHub repo in the form "owner/name". Default: paperlens/paper-reader

.PARAMETER Tag
  Release tag. Default: <engine>-<version>

.PARAMETER Title
  Release title. Default: "<Engine> v<Version>"

.PARAMETER Notes
  Release notes. Default: a short generic note.

.PARAMETER Draft
  If set, create the release as a draft (not published)

.PARAMETER Clobber
  If set, overwrite the existing asset when uploading (default: true)

.EXAMPLE
  .\upload-engine.ps1 -Engine marker
  .\upload-engine.ps1 -Engine mineru -Repo myname/paper-reader -Draft
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("marker", "mineru")]
    [string]$Engine,

    [string]$Version,

    [string]$Repo = "paperlens/paper-reader",

    [string]$Tag,

    [string]$Title,

    [string]$Notes,

    [switch]$Draft,

    [switch]$NoClobber
)

$ErrorActionPreference = "Stop"

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir   = Join-Path $ScriptDir "dist"
$EngineDir = Join-Path $DistDir "$Engine-engine"

# Detect version
if (-not $Version) {
    $VersionFile = Join-Path $EngineDir "VERSION"
    if (Test-Path $VersionFile) {
        $Version = (Get-Content $VersionFile -Raw).Trim()
    } else {
        throw "Cannot determine version: -Version not given and $VersionFile missing."
    }
}
if (-not $Tag)   { $Tag   = "$Engine-$Version" }
if (-not $Title) { $Title = "$Engine v$Version" }

$Platform = "windows-x86_64"
$ZipName  = "$Engine-engine-v$Version-$Platform.zip"
$ZipPath  = Join-Path $DistDir $ZipName

if (-not (Test-Path $ZipPath)) {
    throw "Zip not found: $ZipPath`nRun package-engine.ps1 first."
}

# Verify gh CLI
Write-Host "=== Upload $Engine v$Version to GitHub ===" -ForegroundColor Cyan
Write-Host "  Repo : $Repo"
Write-Host "  Tag  : $Tag"
Write-Host "  Asset: $ZipName ($([math]::Round((Get-Item $ZipPath).Length / 1MB, 2)) MB)"
Write-Host ""

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
    throw "gh CLI not found. Install with: winget install GitHub.cli"
}
Write-Host "gh CLI: $($gh.Source)" -ForegroundColor Gray

# Verify auth
& gh auth status --hostname github.com 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Not logged in to GitHub. Run: gh auth login"
}
Write-Host "GitHub auth: OK" -ForegroundColor Green
Write-Host ""

# Create release if needed
$createArgs = @(
    "release", "create", $Tag,
    "--repo", $Repo,
    "--title", $Title
)
if ($Draft)   { $createArgs += "--draft" }
if ($Notes)   { $createArgs += @("--notes", $Notes) }
else          { $createArgs += "--generate-notes" }

# Upload (also accepts --clobber)
$uploadArgs = @(
    "release", "upload", $Tag, $ZipPath,
    "--repo", $Repo
)
if (-not $NoClobber) { $uploadArgs += "--clobber" }

# Check if release already exists
$exists = $false
try {
    & gh release view $Tag --repo $Repo *> $null
    $exists = ($LASTEXITCODE -eq 0)
} catch {
    $exists = $false
}

if ($exists) {
    Write-Host "Release $Tag already exists, uploading asset..." -ForegroundColor Yellow
} else {
    Write-Host "Creating release $Tag ..." -ForegroundColor Yellow
    & gh @createArgs
    if ($LASTEXITCODE -ne 0) {
        throw "gh release create failed (exit $LASTEXITCODE)"
    }
    Write-Host "Release created." -ForegroundColor Green
}

Write-Host "Uploading $ZipName ..." -ForegroundColor Yellow
& gh @uploadArgs
if ($LASTEXITCODE -ne 0) {
    throw "gh release upload failed (exit $LASTEXITCODE)"
}

# Final URLs
$ReleaseUrl  = "https://github.com/$Repo/releases/tag/$Tag"
$DownloadUrl = "https://github.com/$Repo/releases/download/$Tag/$ZipName"

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "  Release page : $ReleaseUrl"
Write-Host "  Asset URL    : $DownloadUrl"
Write-Host ""
Write-Host "Update backend\config\engine_packages.json with the asset URL" -ForegroundColor Gray
