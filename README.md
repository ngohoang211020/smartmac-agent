# SmartMac (`smartmac-agent`) — Open-Source Local Laptop Admin & AI Housework Agent

An open-source, cross-platform (**macOS, Linux, Windows**) local web dashboard and AI assistant to monitor and control your computer's **CPU, RAM, GPU, Battery, Disks, Applications (Launch / Quit / Uninstall), Processes, Files/Folders, Wi-Fi/Network, Screen Capture / Video & Audio Recorder, Remote VPS SSH**, and **Gmail OAuth 2.0** inbox.

---

## 🚀 Step-by-Step Installation Guide

### Prerequisites
- **Node.js v18+** and **Git** installed ([https://nodejs.org](https://nodejs.org)).

---

### Method 1: 1-Command Installer (Recommended — macOS, Linux, Windows)

#### On macOS & Linux:
Open **Terminal** and run this single command:
```bash
curl -fsSL https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.sh | bash
```
- It automatically clones `smartmac-agent` into `~/.smartmac-agent`, installs lightweight runtime dependencies (`--omit=dev`), links the global **`smartmac`** CLI command into your PATH, and opens **http://localhost:4000** in your browser.
- Next time, simply type:
  ```bash
  smartmac
  # or on a custom port:
  smartmac --port 4000
  ```

#### On Windows 10 / 11 (PowerShell):
Open **PowerShell** and run this single command:
```powershell
irm https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.ps1 | iex
```

---

### Method 2: Manual Step-by-Step Git Clone (All Platforms)

If you want to clone and run or customize the source code step by step:

```bash
# Step 1: Clone the repository
git clone https://github.com/ngohoang211020/smartmac-agent.git
cd smartmac-agent

# Step 2: Install dependencies
npm install --omit=dev

# Step 3: Start the SmartMac server & open the dashboard (http://localhost:4000)
npm start
```

*(For active development with hot-reload on port `5173` + backend on port `4000`, run `npm install` and `npm run dev`).*

---

## 🛠️ CLI Options

```bash
smartmac [options]

Options:
  --port, -p <number>   Port to run the web dashboard & WebSocket server (default: 4000)
  --no-open             Start the server without opening the browser automatically
  --help, -h            Display help information
```

---

## 🔒 Built-In 5-Layer Security Architecture

1. **Loopback-Only Binding (`127.0.0.1`)**: Blocks anyone else on your public Wi-Fi or LAN from accessing port `4000`.
2. **Anti-CSRF & Anti-DNS-Rebinding Guard**: Rejects any request from external browser tabs or untrusted `Origin`/`Host` headers.
3. **Dashboard Admin PIN Lock (`🛡️` Shield Icon)**: Set a salted SHA-256 Admin PIN in the top header to lock the dashboard with session-token authentication.
4. **Command-Injection Prevention (`execFile`)**: Uses safe argument arrays instead of shell string interpolation.
5. **Owner-Only File Permissions (`chmod 0600`)**: Local OAuth2 tokens (`.local-agent-config.json`), VPS profiles (`.local-vps-servers.json`), and PIN hashes (`.local-security.json`) are restricted to your OS user account and excluded from Git.

---

## ✨ Key Modules

- **Hardware Monitor**: Real-time WebSocket stream (every 2s) with multi-segment resource donut charts, circular uptime/battery gauges, and per-core CPU bars.
- **Apps & Process Manager**: View top CPU/RAM processes with real native app icons, end tasks, launch/quit apps, and **safely Uninstall apps** with `~/Library` leftover cache cleaning.
- **Capture & Record Studio (`REC`)**: Instant OS fullscreen/area screenshots, **30fps HD Screen Video Recorder** (with microphone narration), and **Audio Voice Recorder** with a built-in playback gallery.
- **File & Folder Explorer**: Browse directories, preview & edit text/code files in place, create folders, move files to Trash, or reveal in Finder / Windows Explorer.
- **Wi-Fi & Network Control Center**: Inspect current Wi-Fi SSID, signal, gateway, DNS servers, live RX/TX bandwidth, scan nearby Wi-Fi networks, toggle Wi-Fi power, and run ping diagnostics.
- **Gmail OAuth 2.0 & 3-Day Unread Bell (`🔔`)**: Connect via Google OAuth 2.0 to sync unread emails from the last 3 days in the top header Bell notification popover, click any email to open it directly in Gmail, or compose and send emails.
- **Advanced VPS & Remote SSH Manager (`PRO`)**: Save multiple VPS server profiles, launch native OS SSH Terminal windows in 1 click, or run remote health/Docker/Nginx checks.
- **English / Vietnamese (`🇺🇸 ENG` | `🇻🇳 VIE`) & App Dark/Light Theme (`🌙` / `☀️`)**: Instant language and app-only background switching in the top header bar.

---

## 📄 License
MIT License
