# package-ipa.ps1 - Trigger the iOS unsigned build on GitHub Actions,
# wait for it to finish, then download the IPA, name it by app version
# (from package.json) and copy it to a network share.
#
# Token: read from secrets\gh_token.txt (a fine-grained PAT with Actions
# read/write). If the file is missing you will be asked to paste the token
# once; it is then saved to that file (which is gitignored).
#
# Usage:  (double-click ci\package-ipa.bat, or run this file with -ExecutionPolicy Bypass)
#         [-SkipBuild]   reuse the latest successful run instead of a new one
#         [-CopyTo ""]   override the destination share ("" = skip the copy)
#         [-AllowStale]  build even if local commits are not pushed (not advised)
#
# IMPORTANT: the IPA is built on GitHub from origin/main. Local commits that are
# not pushed never make it into the package. Previously the file was still named
# after the local package.json version, so it was possible to install v0.7.11
# while the file said v0.7.13. Two guards now:
#   1. preflight refuses to run when origin/<branch> is behind local HEAD
#   2. the file is named after the version of the commit that was ACTUALLY built
#      (package.json at that sha), not after the local one
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads BOM-less scripts
# as ANSI (GBK on this machine), non-ASCII comments would garble.

param(
    [switch]$SkipBuild,
    [string]$CopyTo = "\\192.168.1.145\Download",
    [switch]$AllowStale
)

$ErrorActionPreference = "Stop"

$Repo   = "mlgdi/mlgdi-mobile"
$Root   = Split-Path -Parent $PSScriptRoot   # .app-mobile
$TokenFile = Join-Path $Root "secrets\gh_token.txt"
$OutDir = Join-Path $Root "dist-ipa"

# ---------- version (IPA is named by app version, single source: package.json) ----------
$Pkg = Get-Content (Join-Path $Root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$AppVersion = [string]$Pkg.version
Write-Host "App version: v$AppVersion" -ForegroundColor Cyan

# ---------- preflight: local commits must already be on origin ----------
function Invoke-Git([string[]]$GitArgs) {
    try { return (& git -C $Root @GitArgs 2>$null) } catch { return $null }
}

$Branch   = Invoke-Git @("rev-parse", "--abbrev-ref", "HEAD")
$LocalSha = Invoke-Git @("rev-parse", "HEAD")
if ($Branch)   { $Branch = ($Branch -join "").Trim() }
if ($LocalSha) { $LocalSha = ($LocalSha -join "").Trim() }

$Ahead = -1
if ($Branch -and -not $SkipBuild) {
    $Raw = Invoke-Git @("rev-list", "--count", "origin/$Branch..HEAD")
    if ($Raw) { $Ahead = [int](($Raw -join "").Trim()) }
}

if ($Ahead -gt 0) {
    if ($AllowStale) {
        Write-Host "WARNING: $Ahead local commit(s) not pushed - the IPA will NOT contain them." -ForegroundColor Yellow
    } else {
        throw "HEAD is $Ahead commit(s) ahead of origin/$Branch. The build runs on origin/$Branch, so the package would NOT contain your changes (that is exactly how v0.7.11 shipped under the v0.7.13 name). Push first: git push origin $Branch   ... or pass -AllowStale to build anyway."
    }
}

# ---------- token ----------
if (Test-Path $TokenFile) {
    $Token = (Get-Content $TokenFile -Raw).Trim()
} else {
    Write-Host "GitHub token not found. Paste your PAT (input is hidden):" -ForegroundColor Yellow
    $Secure = Read-Host "PAT" -AsSecureString
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)).Trim()
    if (-not $Token) { throw "empty token" }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TokenFile) | Out-Null
    Set-Content -Path $TokenFile -Value $Token -NoNewline -Encoding ascii
    Write-Host "Token saved to secrets\gh_token.txt" -ForegroundColor Green
}

$Headers = @{
    Authorization  = "Bearer $Token"
    "Accept"       = "application/vnd.github+json"
    "User-Agent"   = "mlgdi-packager"
}

function Invoke-GhApi([string]$Uri) {
    Invoke-RestMethod -Uri $Uri -Headers $Headers -Method Get
}

# ---------- trigger ----------
if ($SkipBuild) {
    Write-Host "[1/4] Reusing the latest successful run..." -ForegroundColor Cyan
    $Runs = Invoke-GhApi "https://api.github.com/repos/$Repo/actions/workflows/ios-unsigned.yml/runs?status=success&per_page=1"
    $Run = $Runs.workflow_runs[0]
    if (-not $Run) { throw "no successful run found" }
} else {
    Write-Host "[1/4] Triggering a new build (workflow_dispatch on main)..." -ForegroundColor Cyan
    Invoke-RestMethod -Method Post -Headers $Headers `
        -Uri "https://api.github.com/repos/$Repo/actions/workflows/ios-unsigned.yml/dispatches" `
        -Body '{"ref":"main","inputs":{"sdk_asset":"SDK.zip"}}' | Out-Null
    Start-Sleep -Seconds 10
    $Runs = Invoke-GhApi "https://api.github.com/repos/$Repo/actions/workflows/ios-unsigned.yml/runs?event=workflow_dispatch&per_page=1"
    $Run = $Runs.workflow_runs[0]
    if (-not $Run) { throw "dispatch accepted but no run appeared; check the Actions page" }
}
$RunId = $Run.id
Write-Host ("    run {0}  branch={1}  started {2}" -f $RunId, $Run.head_branch, $Run.created_at)

# ---------- wait ----------
Write-Host "[2/4] Waiting for the build to finish (usually ~12 min)..." -ForegroundColor Cyan
while ($true) {
    $Run = Invoke-GhApi "https://api.github.com/repos/$Repo/actions/runs/$RunId"
    if ($Run.status -eq "completed") { break }
    Write-Host ("    {0}  {1}" -f (Get-Date -Format HH:mm:ss), $Run.status)
    Start-Sleep -Seconds 30
}
if ($Run.conclusion -ne "success") {
    throw "run $RunId finished with: $($Run.conclusion). Details: $($Run.html_url)"
}
Write-Host "    build OK  $($Run.html_url)" -ForegroundColor Green

# ---------- download ----------
Write-Host "[3/4] Downloading artifact garden-unsigned-ipa..." -ForegroundColor Cyan
$Arts = Invoke-GhApi "https://api.github.com/repos/$Repo/actions/runs/$RunId/artifacts"
$Art = $Arts.artifacts | Where-Object { $_.name -eq "garden-unsigned-ipa" } | Select-Object -First 1
if (-not $Art) { throw "artifact garden-unsigned-ipa not found in run $RunId" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$ZipPath = Join-Path $OutDir "ipa-$RunId.zip"

# The archive endpoint 302-redirects to a pre-signed URL. Following the
# redirect WITH the Authorization header returns 401, so we fetch the
# redirect target first and download it without credentials.
$Req = [System.Net.HttpWebRequest]::Create($Art.archive_download_url)
$Req.Method = "GET"
$Req.UserAgent = "mlgdi-packager"
$Req.Accept = "application/vnd.github+json"
$Req.Headers.Add("Authorization", "Bearer $Token")
$Req.AllowAutoRedirect = $false
$Resp = $Req.GetResponse()
$Redirect = $Resp.Headers["Location"]
$Resp.Close()
if (-not $Redirect) { throw "no redirect URL returned by the archive endpoint" }

Invoke-WebRequest -Uri $Redirect -OutFile $ZipPath -UserAgent "mlgdi-packager"
Write-Host ("    zip {0:N1} MB" -f ((Get-Item $ZipPath).Length / 1MB))

# ---------- extract ----------
Write-Host "[4/4] Extracting the IPA..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Tmp = Join-Path $OutDir "_unzip-$RunId"
if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force }
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Tmp)
$Ipa = Get-ChildItem -Path $Tmp -Recurse -Filter *.ipa | Select-Object -First 1
if (-not $Ipa) { throw "no .ipa inside the artifact zip" }

# The build runs on origin/<branch>, not on the local working tree. Name the
# file after what was actually compiled, so the filename can never lie again.
$BuiltSha = [string]$Run.head_sha
$BuiltVersion = $AppVersion
if ($BuiltSha) {
    try {
        $Cfg = Invoke-GhApi "https://api.github.com/repos/$Repo/contents/package.json?ref=$BuiltSha"
        $B64 = ($Cfg.content -replace "\s", "")
        $Txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($B64))
        $BuiltVersion = [string](($Txt | ConvertFrom-Json).version)
    } catch {
        Write-Host "    (could not read the built commit's version; falling back to local)" -ForegroundColor Yellow
    }
    Write-Host ("    built commit {0}  ->  v{1}" -f $BuiltSha.Substring(0, 7), $BuiltVersion)
    if ($LocalSha -and $BuiltSha -ne $LocalSha) {
        Write-Host ("    WARNING: local HEAD is {0}; this package is NOT your working tree" -f $LocalSha.Substring(0, 7)) -ForegroundColor Yellow
    }
    if ($BuiltVersion -ne $AppVersion) {
        Write-Host ("    WARNING: local package.json says v{0}, the built package is v{1}" -f $AppVersion, $BuiltVersion) -ForegroundColor Yellow
    }
}

$Dest = Join-Path $OutDir ("garden-v{0}.ipa" -f $BuiltVersion)
Copy-Item $Ipa.FullName $Dest -Force
Remove-Item $Tmp -Recurse -Force
Remove-Item $ZipPath -Force
Write-Host "    saved: $Dest" -ForegroundColor Green

# ---------- network copy ----------
if ($CopyTo -ne "") {
    try {
        Copy-Item $Dest $CopyTo -Force
        Write-Host "    copied to $CopyTo" -ForegroundColor Green
    } catch {
        Write-Host "    copy to share failed: $_" -ForegroundColor Yellow
        Write-Host "    IPA is still local: $Dest" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done. Install the IPA with TrollStore:" -ForegroundColor Green
Write-Host "  $Dest"
if ($CopyTo -ne "") { Write-Host "  $CopyTo\garden-v$BuiltVersion.ipa" }
