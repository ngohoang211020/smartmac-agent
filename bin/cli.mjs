#!/usr/bin/env node
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  SmartMac / Housework Agent — Cross-Platform Local System & Social Admin
  -----------------------------------------------------------------------
  Usage:
    smartmac [options]
    npx github:ngohoang211020/smartmac-agent [options]

  Options:
    --port, -p <number>   Port to run the dashboard on (default: 4000)
    --no-open             Do not automatically open the browser
    --help, -h            Show this help message
  `);
  process.exit(0);
}

let port = process.env.PORT || '4000';
const portIdx = args.findIndex((a) => a === '--port' || a === '-p');
if (portIdx !== -1 && args[portIdx + 1]) {
  port = args[portIdx + 1];
}
const autoOpen = !args.includes('--no-open');

function openBrowser(url) {
  const platform = os.platform();
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
      ? `cmd /c start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  const url = `http://localhost:${port}`;
  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  🚀 SmartMac Local System & Social Agent (v1.0.1)            │
│                                                              │
│  ➜ Dashboard URL : ${url.padEnd(40, ' ')} │
│  ➜ Hostname      : ${os.hostname().slice(0, 40).padEnd(40, ' ')} │
│  ➜ Platform      : ${(os.platform() + ' (' + os.arch() + ')').padEnd(40, ' ')} │
╰──────────────────────────────────────────────────────────────╯
`);

  const compiledEntry = path.join(rootDir, 'dist-server', 'index.js');

  const child = spawn(process.execPath, [compiledEntry], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  });

  if (autoOpen) {
    setTimeout(() => openBrowser(url), 1000);
  }

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
