# SmartMac (`smartmac-agent`) — Open-Source Local Laptop Admin & AI Housework Agent

An open-source, cross-platform (**macOS, Linux, Windows**) local web dashboard and AI assistant to monitor and control your computer's **CPU, RAM, GPU, Battery, Disks, Applications, Processes, Files/Folders, Wi-Fi/Network**, and **Gmail & Facebook** accounts.

---

## ⚡ Run on Any Computer with 1 Command

### Option 1: Zero-Install via `npx` (Recommended)
Once published to npm (or directly from your GitHub repo), run on any Mac, Linux, or Windows machine with a single command:

```bash
# Directly from npm:
npx smartmac-agent

# Or directly from GitHub without publishing to npm:
npx github:YOUR_GITHUB_USERNAME/smartmac-agent
```

### Option 2: Global CLI Install (`smartmac`)
Install globally once and type `smartmac` anytime in your terminal:

```bash
npm install -g smartmac-agent
smartmac --port 4000
```

### Option 3: One-Line `curl` Installer (macOS & Linux)
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/smartmac-agent/main/install.sh | bash
```

### Option 4: One-Line PowerShell Installer (Windows)
```powershell
irm https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/smartmac-agent/main/install.ps1 | iex
```

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

## ✨ Key Features

- **SmartHR-Inspired Clean Light Dashboard**: Real-time WebSocket stream (every 2s) with multi-segment resource donut charts, circular uptime/battery gauges, and per-core CPU bars.
- **Process & Application Manager**: View top CPU/RAM processes, kill unresponsive PIDs, and launch or quit installed applications.
- **File & Folder Explorer**: Browse directories, preview & edit text/code files in place, create folders, move files to Trash, or reveal in Finder.
- **Wi-Fi & Network Control Center**: Inspect current Wi-Fi SSID, signal, gateway, DNS servers, live RX/TX bandwidth, scan nearby Wi-Fi networks, toggle Wi-Fi power, and run ping diagnostics.
- **Gmail & Facebook Integration Hub**: Connect via Gmail OAuth2 / App Password (IMAP/SMTP) and Facebook Graph API, or use one-click native browser launchers.
- **Built-in AI Super Agent**: Control your computer using natural language (`"open Calculator"`, `"ping 1.1.1.1"`, `"flush dns"`, `"check system health"`), with optional **Gemini 2.5 Flash** integration.

---

## 📦 How to Publish Your Open-Source Package

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: initial open-source release of smartmac-agent"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/smartmac-agent.git
   git push -u origin main
   ```
   *(As soon as it's on GitHub, anyone can run `npx github:YOUR_GITHUB_USERNAME/smartmac-agent`!)*

2. **Publish to npm** (optional, so anyone can run `npx smartmac-agent`):
   ```bash
   npm login
   npm publish --access public
   ```

---

## 📄 License
MIT License
