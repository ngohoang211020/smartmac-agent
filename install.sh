#!/usr/bin/env bash
set -e

REPO_URL="${SMARTMAC_REPO_URL:-https://github.com/hoangngo/smartmac-agent.git}"
INSTALL_DIR="${SMARTMAC_INSTALL_DIR:-$HOME/.smartmac-agent}"
PORT="${PORT:-4000}"

echo "╭────────────────────────────────────────────────────────╮"
echo "│  🚀 Installing SmartMac Local System & Social Agent    │"
echo "╰────────────────────────────────────────────────────────╯"

# 1. Verify Node.js >= 18
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Please install Node.js (v18+): https://nodejs.org"
  exit 1
fi

# 2. Clone or update repository
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "🔄 Updating existing installation in $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "📦 Cloning SmartMac Agent into $INSTALL_DIR..."
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Install dependencies & build static UI bundle
echo "⚙️  Installing dependencies & building production dashboard..."
npm install --no-audit --no-fund
npm run build

# 4. Link global `smartmac` CLI command if writable
npm link >/dev/null 2>&1 || true

echo "✅ Installation complete! Launching SmartMac on http://localhost:$PORT ..."
PORT="$PORT" node ./bin/cli.mjs
