# PowerShell One-Line Installer for Windows 10 / 11
$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:SMARTMAC_REPO_URL) { $env:SMARTMAC_REPO_URL } else { "https://github.com/ngohoang211020/smartmac-agent.git" }
$InstallDir = if ($env:SMARTMAC_INSTALL_DIR) { $env:SMARTMAC_INSTALL_DIR } else { "$HOME\.smartmac-agent" }
$Port = if ($env:PORT) { $env:PORT } else { "4000" }

Write-Host "🚀 Installing SmartMac Local System & Social Agent..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Node.js is required (v18+). Install from https://nodejs.org"
    exit 1
}

if (Test-Path "$InstallDir\.git") {
    Write-Host "🔄 Updating existing installation in $InstallDir..."
    git -C $InstallDir fetch --depth 1 origin main
    git -C $InstallDir reset --hard origin/main
} else {
    Write-Host "📦 Cloning SmartMac Agent into $InstallDir..."
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    git clone --depth 1 $RepoUrl $InstallDir
}

Set-Location $InstallDir
Write-Host "⚙️  Installing runtime dependencies..."
npm install --omit=dev --no-audit --no-fund

Write-Host "✅ Launching SmartMac on http://localhost:$Port ..." -ForegroundColor Green
$env:PORT = $Port
node .\bin\cli.mjs
