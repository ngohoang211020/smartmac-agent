#!/usr/bin/env bash
set -e

REPO_URL="${SMARTMAC_REPO_URL:-https://github.com/ngohoang211020/smartmac-agent.git}"
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
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# 3. Install runtime dependencies (dist & dist-server are already pre-compiled!)
echo "⚙️  Installing runtime dependencies..."
npm install --omit=dev --no-audit --no-fund

# 4. Link global `smartmac` CLI command into the active Node bin folder
NODE_BIN_DIR="$(dirname "$(command -v node)")"
chmod +x "$INSTALL_DIR/bin/cli.mjs"
ln -sf "$INSTALL_DIR/bin/cli.mjs" "$NODE_BIN_DIR/smartmac" 2>/dev/null || true
ln -sf "$INSTALL_DIR/bin/cli.mjs" "$NODE_BIN_DIR/smartmac-agent" 2>/dev/null || true

echo "✅ Installation complete! You can now run 'smartmac' from any terminal."
echo "🚀 Launching SmartMac on http://localhost:$PORT ..."
PORT="$PORT" node ./bin/cli.mjs "$@"
