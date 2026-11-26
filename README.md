# SmartMac (`smartmac-agent`) — Open-Source Local Laptop Admin & AI Housework Agent

<p align="center">
  <img src="public/logo.svg" alt="SmartMac Logo" width="88" height="88" />
</p>

An open-source, cross-platform (**macOS, Linux, Windows**) local web dashboard and AI assistant to monitor and control your computer's **CPU, RAM, GPU, Battery, Disks, Applications (Launch / Quit / Uninstall), Processes, Files/Folders, Wi-Fi/Network, Screen Capture / Video & Audio Recorder, Remote VPS SSH**, and **Gmail OAuth 2.0** inbox.

---

## 📋 Table of Contents
1. [Prerequisites](#-1-prerequisites)
2. [Option 1: 1-Command Automatic Install (Recommended)](#-2-option-1-1-command-automatic-install-recommended)
3. [Option 2: Manual Step-by-Step Installation (Git Clone)](#-3-option-2-manual-step-by-step-installation-git-clone)
4. [Option 3: Developer Mode (Editing UI & Backend)](#-4-option-3-developer-mode-editing-ui--backend)
5. [Step-by-Step: Setting Up Google OAuth 2.0 for Gmail](#-5-step-by-step-setting-up-google-oauth-20-for-gmail)
6. [CLI Options & Commands](#️-6-cli-options--commands)
7. [Built-In 5-Layer Security Architecture](#-7-built-in-5-layer-security-architecture)
8. [Key Features & Modules](#-8-key-features--modules)

---

## 🔧 1. Prerequisites

Before installing, make sure your computer has:
- **Node.js v18 or newer** (supports Node v18, v20, v22, v24+): [Download Node.js](https://nodejs.org)
- **Git**: [Download Git](https://git-scm.com)

Verify in your terminal:
```bash
node -v
git --version
```

---

## ⚡ 2. Option 1: 1-Command Automatic Install (Recommended)

### On macOS & Linux:
1. Open **Terminal** and run this single command:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.sh | bash
   ```
2. **What it does automatically:**
   - Clones the latest release into `~/.smartmac-agent`
   - Installs lightweight runtime dependencies (`npm install --omit=dev` — takes ~2 seconds, zero `esbuild` compilation errors)
   - Registers the global **`smartmac`** command in your terminal `PATH`
   - Starts the local server and opens **`http://localhost:4000`** in your browser.
3. **Anytime after installation**, open any terminal window and simply run:
   ```bash
   smartmac
   # Or run on a custom port:
   smartmac --port 4050
   ```

### On Windows 10 / 11 (PowerShell):
1. Open **PowerShell** and run this single command:
   ```powershell
   irm https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.ps1 | iex
   ```
2. Or if you cloned/downloaded the folder onto Windows, simply double-click **`start-windows.bat`**.

---

## 🖥️ Native macOS Desktop App (Auto-Start at Login)

Turn SmartMac into a **native macOS Desktop Application** (`/Applications/SmartMac.app`) with a **Menu Bar icon** (`CPU` icon), native window (`WKWebView`), and **automatic launch when your Mac boots**:

```bash
# Build, install to /Applications/SmartMac.app, enable Launch at Login, and open:
npm run desktop:install
# (or: bash desktop/macos/build-app.sh)

# Uninstall /Applications/SmartMac.app and remove the LaunchAgent:
npm run desktop:uninstall
```

**Desktop App Highlights:**
- **Auto-starts at macOS login** silently in the Menu Bar (`~/Library/LaunchAgents/com.smartmac.agent.plist`), with a **"Launch at Login"** checkbox right inside the Menu Bar dropdown to toggle it anytime.
- **Runs on dedicated port `4545`** (`127.0.0.1:4545`) so it never conflicts with your dev servers on port `3000`/`4000`.
- Closing the window keeps the agent alive in the Menu Bar; click the Menu Bar CPU icon → **Open SmartMac Dashboard** (or **Quit SmartMac** to shut down both the window and background server).

---

## 📦 3. Option 2: Manual Step-by-Step Installation (Git Clone)

If you prefer to install and run it step-by-step in any directory:

```bash
# Step 1: Clone the repository from GitHub
git clone https://github.com/ngohoang211020/smartmac-agent.git
cd smartmac-agent

# Step 2: Install runtime dependencies (fast, pre-compiled dist & dist-server included)
npm install --omit=dev

# Step 3: Start SmartMac Agent (automatically opens http://localhost:4000)
npm start
```

> **Note:** If port `4000` is already in use by another process, SmartMac automatically switches to the next available port (`4001`, `4002`, etc.) or you can pass `node ./bin/cli.mjs --port 4050`.

---

## 💻 4. Option 3: Developer Mode (Editing UI & Backend)

If you want to customize the React UI (`src/`) or TypeScript backend (`server/`):

```bash
# Step 1: Clone the repository
git clone https://github.com/ngohoang211020/smartmac-agent.git
cd smartmac-agent

# Step 2: Install all dependencies (including Vite & TypeScript devDependencies)
npm install

# Step 3: Start hot-reload development servers
# - Frontend (Vite HMR): http://localhost:5173
# - Backend API & WebSocket: http://localhost:4000
npm run dev

# Step 4: Build production frontend (dist/) & backend (dist-server/) before pushing
npm run build
```

---

## 📧 5. Step-by-Step: Setting Up Google OAuth 2.0 for Gmail

To connect your live Gmail inbox and the **3-Day Unread Bell (`🔔`)** notification dropdown via Google OAuth 2.0:

1. **Enable Gmail API in Google Cloud Console:**
   - Go to [Google Cloud Console → APIs & Services](https://console.cloud.google.com/apis/library/gmail.googleapis.com) and click **Enable** on **Gmail API**.
2. **Create OAuth 2.0 Client ID:**
   - Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → click **+ Create Credentials** → **OAuth client ID**.
   - **Application type:** `Web application`
   - **Name:** `SmartMac`
   - **Authorized redirect URIs:**
     ```text
     http://localhost:4000/api/social/gmail/oauth/callback
     ```
   - Click **Create** and copy your **Client ID** (`xxxx.apps.googleusercontent.com`) and **Client Secret** (`GOCSPX-...`).
3. **Add Test User (If your OAuth Consent Screen is in "Testing" mode):**
   - Go to **Google Auth Platform → Audience** → under **Test users**, click **+ Add users** and add your Gmail address.
4. **Sign In from SmartMac Dashboard:**
   - Open SmartMac → click **Cloud, Gmail & VPS → Gmail OAuth2**.
   - Paste your **Client ID** and **Client Secret** → click **Save Credentials** → click **Sign in with Google OAuth 2.0**.

---

## 🛠️ 6. CLI Options & Commands

```bash
smartmac [options]

Options:
  --port, -p <number>   Port to run the web dashboard & WebSocket server (default: 4000)
  --no-open             Start the server without opening the browser automatically
  --help, -h            Display help information
```

---

## 🔒 7. Built-In 5-Layer Security Architecture

1. **Loopback-Only Binding (`127.0.0.1`)**: Binds strictly to `127.0.0.1` by default, preventing anyone else on public Wi-Fi or LAN from accessing your dashboard.
2. **Anti-CSRF & Anti-DNS-Rebinding Guard**: Rejects any HTTP or WebSocket request from external browser tabs or untrusted `Origin`/`Host` headers.
3. **Dashboard Admin PIN Lock (`🛡️` Shield Icon)**: Set a salted SHA-256 Admin PIN in the top header to lock the dashboard with session-token authentication (`x-smartmac-token`).
4. **Command-Injection Prevention (`execFile`)**: Uses safe argument arrays instead of shell string interpolation.
5. **Owner-Only File Permissions (`chmod 0600`)**: Local OAuth2 tokens (`.local-agent-config.json`), VPS profiles (`.local-vps-servers.json`), and PIN hashes (`.local-security.json`) are restricted to your OS user account and excluded from Git.

---

## ✨ 8. Key Features & Modules

- **Hardware Monitor**: Real-time WebSocket stream (every 2s) with multi-segment resource donut charts, circular uptime/battery gauges, and per-core CPU bars.
- **Apps & Process Manager**: View top CPU/RAM processes with real native app icons, end tasks, launch/quit apps, and **safely Uninstall apps** with `~/Library` leftover cache cleaning.
- **Capture & Record Studio (`REC`)**: Instant OS fullscreen/area screenshots, **30fps HD Screen Video Recorder** (with microphone narration), and **Audio Voice Recorder** with a built-in playback gallery (`~/Desktop/SmartMac-Captures`).
- **File & Folder Explorer**: Browse directories, preview & edit text/code files in place, create folders, move files to Trash, or reveal in Finder / Windows Explorer.
- **Wi-Fi & Network Control Center**: Inspect current Wi-Fi SSID, signal, gateway, DNS servers, live RX/TX bandwidth, scan nearby Wi-Fi networks, toggle Wi-Fi power, and run ping diagnostics.
- **Gmail OAuth 2.0 & 3-Day Unread Bell (`🔔`)**: Connect via Google OAuth 2.0 to sync unread emails from the last 3 days (`is:unread newer_than:3d`) in the top header Bell notification popover, click any email to open it directly in Gmail, or compose and send emails.
- **Advanced VPS & Remote SSH Manager (`PRO`)**: Save multiple VPS server profiles, launch native OS SSH Terminal windows in 1 click, or run remote health/Docker/Nginx checks.
- **English / Vietnamese (`🇺🇸 ENG` | `🇻🇳 VIE`) & App Dark/Light Theme (`🌙` / `☀️`)**: Instant language and app-only background switching in the top header bar.

---

## 📄 License
MIT License
