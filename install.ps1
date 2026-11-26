# PowerShell One-Line Installer for Windows
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
    git -C $InstallDir pull --ff-only
} else {
    Write-Host "📦 Cloning SmartMac Agent into $InstallDir..."
    git clone --depth 1 $RepoUrl $InstallDir
}

Set-Location $InstallDir
npm install --no-audit --no-fund
npm run build

Write-Host "✅ Launching SmartMac on http://localhost:$Port ..." -ForegroundColor Green
$env:PORT = $Port
node .\bin\cli.mjs
