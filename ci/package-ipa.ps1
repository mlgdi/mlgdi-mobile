# package-ipa.ps1 - Trigger the iOS unsigned build on GitHub Actions,
# wait for it to finish, then download the IPA to dist-ipa\.
#
# Token: read from secrets\gh_token.txt (a fine-grained PAT with Actions
# read/write). If the file is missing you will be asked to paste the token
# once; it is then saved to that file (which is gitignored).
#
# Usage:  powershell -ExecutionPolicy Bypass -File ci\package-ipa.ps1
#         [-SkipBuild]   reuse the latest successful run instead of a new one
#         [-CopyTo\\server\share]  also copy the IPA to a network share

param(
    [switch]$SkipBuild,
    [string]$CopyTo = "\\192.168.1.145\我的文件"
)

$ErrorActionPreference = "Stop"

$Repo   = "mlgdi/mlgdi-mobile"
$Root   = Split-Path -Parent $PSScriptRoot   # .app-mobile
$TokenFile = Join-Path $Root "secrets\gh_token.txt"
$OutDir = Join-Path $Root "dist-ipa"

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

$Dest = Join-Path $OutDir ("garden-{0}.ipa" -f (Get-Date -Format "yyyyMMdd-HHmm"))
Copy-Item $Ipa.FullName $Dest -Force
Remove-Item $Tmp -Recurse -Force
Remove-Item $ZipPath -Force
Write-Host "    saved: $Dest" -ForegroundColor Green

# ---------- optional network copy ----------
if ($CopyTo -ne "") {
    try {
        Copy-Item $Dest $CopyTo -Force
        Write-Host "    copied to $CopyTo" -ForegroundColor Green
    } catch {
        Write-Host "    copy to share failed: $_" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done. Install the IPA with TrollStore:" -ForegroundColor Green
Write-Host "  $Dest"
