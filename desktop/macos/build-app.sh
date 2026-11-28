#!/usr/bin/env bash
# Builds the native SmartMac.app (Swift + WebKit shell around the Node.js server),
# installs it into /Applications (or ~/Applications), and enables auto-start at login.
#
# Usage:
#   bash desktop/macos/build-app.sh               # build + install + auto-start + open
#   bash desktop/macos/build-app.sh --no-autostart
#   bash desktop/macos/build-app.sh --uninstall
set -e

if [ "$(uname)" != "Darwin" ]; then
  echo "❌ The SmartMac desktop app build is only supported on macOS."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_NAME="SmartMac"
BUNDLE_ID="com.smartmac.agent"
PORT="${SMARTMAC_APP_PORT:-4545}"
LAUNCH_AGENT="$HOME/Library/LaunchAgents/$BUNDLE_ID.plist"

if [ -w "/Applications" ]; then
  INSTALL_PARENT="/Applications"
else
  INSTALL_PARENT="$HOME/Applications"
  mkdir -p "$INSTALL_PARENT"
fi
APP_DIR="$INSTALL_PARENT/$APP_NAME.app"

# --- Uninstall ---
if [ "$1" == "--uninstall" ]; then
  echo "🧹 Uninstalling $APP_NAME.app..."
  pkill -f "$APP_DIR/Contents/MacOS/$APP_NAME" 2>/dev/null || true
  launchctl bootout "gui/$(id -u)/$BUNDLE_ID" 2>/dev/null || true
  rm -f "$LAUNCH_AGENT"
  rm -rf "$APP_DIR"
  echo "✅ Removed $APP_DIR and login item."
  exit 0
fi

# --- Requirements ---
if ! command -v swiftc >/dev/null 2>&1; then
  echo "❌ swiftc not found. Install Xcode Command Line Tools: xcode-select --install"
  exit 1
fi
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "❌ Node.js not found in PATH. Install Node.js v18+ first."
  exit 1
fi
NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"

if [ ! -f "$ROOT/dist-server/index.js" ] || [ ! -f "$ROOT/dist/index.html" ]; then
  echo "⚙️  Building dashboard & server bundle..."
  (cd "$ROOT" && npm install --no-audit --no-fund && npm run build)
fi
if [ ! -d "$ROOT/node_modules/express" ]; then
  echo "⚙️  Installing runtime dependencies..."
  (cd "$ROOT" && npm install --omit=dev --no-audit --no-fund)
fi

echo "╭────────────────────────────────────────────────────────╮"
echo "│  🖥️  Building SmartMac Desktop App for macOS            │"
echo "╰────────────────────────────────────────────────────────╯"
echo "  ➜ Project root : $ROOT"
echo "  ➜ Node.js      : $NODE_BIN"
echo "  ➜ Install to   : $APP_DIR"
echo "  ➜ App port     : $PORT"

# Stop any running instance before replacing the bundle
pkill -f "$APP_DIR/Contents/MacOS/$APP_NAME" 2>/dev/null || true
sleep 0.5

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

# 1. Compile native Swift shell (with CoreLocation + CoreWLAN for real Wi-Fi SSID scanning)
echo "🔨 Compiling native Swift app..."
swiftc -O -swift-version 5 \
  "$ROOT/desktop/macos/SmartMacApp.swift" \
  -o "$APP_DIR/Contents/MacOS/$APP_NAME" \
  -framework Cocoa -framework WebKit -framework CoreLocation -framework CoreWLAN

# 2. Generate .icns app icon from public/logo.png
echo "🎨 Generating app icon..."
ICONSET="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET"
SRC_ICON="$ROOT/public/logo.png"
for size in 16 32 128 256 512; do
  sips -z $size $size "$SRC_ICON" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null 2>&1
  double=$((size * 2))
  sips -z $double $double "$SRC_ICON" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null 2>&1
done
iconutil -c icns "$ICONSET" -o "$APP_DIR/Contents/Resources/AppIcon.icns"

# 3. Info.plist
cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$APP_NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSMicrophoneUsageDescription</key><string>SmartMac uses the microphone for the Audio Recorder and screen recording narration.</string>
  <key>NSCameraUsageDescription</key><string>SmartMac may access the camera for media capture features.</string>
  <key>NSLocationUsageDescription</key><string>SmartMac uses Location Services so macOS reveals real nearby Wi-Fi network names (SSIDs) instead of redacted.</string>
  <key>NSLocationWhenInUseUsageDescription</key><string>SmartMac uses Location Services so macOS reveals real nearby Wi-Fi network names (SSIDs) instead of redacted.</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
  </dict>
  <key>SMRootDir</key><string>$ROOT</string>
  <key>SMNodePath</key><string>$NODE_BIN</string>
  <key>SMPort</key><string>$PORT</string>
</dict>
</plist>
PLIST

# 4. Ad-hoc code sign so Gatekeeper / TCC treat it as a stable app identity
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

# 5. Auto-start at login (LaunchAgent)
if [ "$1" != "--no-autostart" ]; then
  echo "🔁 Enabling auto-start at login..."
  mkdir -p "$(dirname "$LAUNCH_AGENT")"
  cat > "$LAUNCH_AGENT" <<AGENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$BUNDLE_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-g</string>
    <string>-a</string>
    <string>$APP_DIR</string>
    <string>--args</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
AGENT
fi

echo "✅ Installed $APP_DIR"
echo "🚀 Launching SmartMac..."
open "$APP_DIR"
