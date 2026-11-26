#!/usr/bin/env node
import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse CLI flags: --port 4000, --no-open, --help
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  SmartMac / Housework Agent — Cross-Platform Local System & Social Admin
  -----------------------------------------------------------------------
  Usage:
    npx smartmac-agent [options]
    smartmac [options]

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

const distIndex = path.join(rootDir, 'dist', 'index.html');

async function runBuildIfNeeded() {
  if (fs.existsSync(distIndex)) return;
  console.log('⚙️  Building production dashboard bundle (first run)...');
  await new Promise((resolve, reject) => {
    const buildProc = spawn('npm', ['run', 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });
    buildProc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Build exited with code ${code}`));
    });
  });
}

function openBrowser(url) {
  const platform = os.platform();
  const cmd =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main() {
  try {
    await runBuildIfNeeded();
  } catch (err) {
    console.warn('⚠️  Could not pre-build dist, continuing with API server:', err.message);
  }

  const url = `http://localhost:${port}`;
  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  🚀 SmartMac Local System & Social Agent                     │
│                                                              │
│  ➜ Dashboard URL : ${url.padEnd(40, ' ')} │
│  ➜ Hostname      : ${os.hostname().slice(0, 40).padEnd(40, ' ')} │
│  ➜ Platform      : ${(os.platform() + ' (' + os.arch() + ')').padEnd(40, ' ')} │
╰──────────────────────────────────────────────────────────────╯
`);

  const tsxBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    os.platform() === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const serverEntry = path.join(rootDir, 'server', 'index.ts');

  const child = spawn(tsxBin, [serverEntry], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
    shell: os.platform() === 'win32',
  });

  if (autoOpen) {
    setTimeout(() => openBrowser(url), 1200);
  }

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
