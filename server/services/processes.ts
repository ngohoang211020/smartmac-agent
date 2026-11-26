import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface ProcessItem {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  memRss: number;
  user: string;
  state: string;
  command: string;
  appPath?: string;
}

export interface InstalledApp {
  name: string;
  path: string;
  isSystem: boolean;
}

const iconCacheDir = path.join(os.tmpdir(), 'smartmac-app-icons');
const resolvedIconMap = new Map<string, string | null>();
let cachedAppsList: InstalledApp[] | null = null;

function matchProcessToAppPath(procName: string, command: string, apps: InstalledApp[]): string | undefined {
  // 1. Check if command path directly contains `/something.app/`
  const match = (command || '').match(/(\/[^\n"]*?\.app)\b/i);
  if (match && match[1] && fsSync.existsSync(match[1])) {
    return match[1];
  }

  // 2. Match process name against installed apps
  const cleanName = procName
    .replace(/\s*(Helper|Renderer|GPU|Plugin|Networking|Audio|Service|\(Renderer\)).*$/i, '')
    .trim()
    .toLowerCase();

  for (const app of apps) {
    const appLow = app.name.toLowerCase();
    if (appLow === cleanName || cleanName.includes(appLow) || appLow.includes(cleanName)) {
      return app.path;
    }
  }
  return undefined;
}

export async function getTopProcesses(limit = 50): Promise<{
  all: number;
  running: number;
  sleeping: number;
  list: ProcessItem[];
}> {
  const [procs, apps] = await Promise.all([
    si.processes(),
    cachedAppsList ? Promise.resolve(cachedAppsList) : listInstalledApps(),
  ]);

  const sorted = procs.list
    .filter((p) => p.name && p.pid > 0)
    .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
    .slice(0, limit)
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: Math.round((p.cpu || 0) * 10) / 10,
      mem: Math.round((p.mem || 0) * 10) / 10,
      memRss: p.memRss || 0,
      user: p.user || 'system',
      state: p.state || 'running',
      command: p.command || p.name,
      appPath: matchProcessToAppPath(p.name, p.path || p.command || '', apps),
    }));

  return {
    all: procs.all,
    running: procs.running,
    sleeping: procs.sleeping,
    list: sorted,
  };
}

export async function listInstalledApps(): Promise<InstalledApp[]> {
  const apps: InstalledApp[] = [];
  const platform = os.platform();

  if (platform === 'darwin') {
    const dirs = [
      { dir: '/Applications', isSystem: false },
      { dir: '/System/Applications', isSystem: true },
      { dir: '/System/Applications/Utilities', isSystem: true },
    ];
    for (const { dir, isSystem } of dirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.endsWith('.app')) {
            apps.push({
              name: entry.name.replace(/\.app$/, ''),
              path: path.join(dir, entry.name),
              isSystem,
            });
          }
        }
      } catch {
        // Ignore
      }
    }
  } else if (platform === 'linux') {
    const dirs = ['/usr/share/applications', path.join(os.homedir(), '.local/share/applications')];
    for (const dir of dirs) {
      try {
        const entries = await fs.readdir(dir);
        for (const name of entries) {
          if (name.endsWith('.desktop')) {
            apps.push({
              name: name.replace(/\.desktop$/, ''),
              path: path.join(dir, name),
              isSystem: dir.startsWith('/usr'),
            });
          }
        }
      } catch {
        // Ignore
      }
    }
  } else if (platform === 'win32') {
    const dirs = [process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'];
    for (const dir of dirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            apps.push({
              name: e.name,
              path: path.join(dir, e.name),
              isSystem: false,
            });
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  cachedAppsList = apps.sort((a, b) => a.name.localeCompare(b.name));
  return cachedAppsList;
}

/**
 * Extracts and caches a 64x64 PNG icon for a macOS .app bundle using `sips`
 */
export async function getAppIconPngPath(appPath?: string, appName?: string): Promise<string | null> {
  if (os.platform() !== 'darwin') return null;

  let targetAppPath = appPath;
  if (!targetAppPath && appName) {
    const apps = cachedAppsList || (await listInstalledApps());
    targetAppPath = matchProcessToAppPath(appName, '', apps);
  }
  if (!targetAppPath || !targetAppPath.endsWith('.app')) return null;

  if (resolvedIconMap.has(targetAppPath)) {
    return resolvedIconMap.get(targetAppPath) || null;
  }

  try {
    await fs.mkdir(iconCacheDir, { recursive: true });
    const safeKey = Buffer.from(targetAppPath).toString('base64url');
    const outPng = path.join(iconCacheDir, `${safeKey}.png`);

    if (fsSync.existsSync(outPng)) {
      resolvedIconMap.set(targetAppPath, outPng);
      return outPng;
    }

    const resDir = path.join(targetAppPath, 'Contents', 'Resources');
    const files = await fs.readdir(resDir).catch(() => [] as string[]);
    const icnsFiles = files.filter((f) => f.toLowerCase().endsWith('.icns'));
    if (icnsFiles.length === 0) {
      resolvedIconMap.set(targetAppPath, null);
      return null;
    }

    // Prefer AppIcon.icns or the first .icns
    const preferred =
      icnsFiles.find((f) => f.toLowerCase().includes('appicon')) || icnsFiles[0];
    const icnsFullPath = path.join(resDir, preferred);

    await execAsync(`sips -s format png -Z 64 "${icnsFullPath}" --out "${outPng}" 2>/dev/null`);
    if (fsSync.existsSync(outPng)) {
      resolvedIconMap.set(targetAppPath, outPng);
      return outPng;
    }
  } catch {
    // ignore extraction error
  }

  resolvedIconMap.set(targetAppPath, null);
  return null;
}

export async function launchApplication(appNameOrPath: string): Promise<{ ok: boolean; message: string }> {
  const platform = os.platform();
  const safeName = appNameOrPath.replace(/["`$\\]/g, '');
  try {
    if (platform === 'darwin') {
      if (safeName.endsWith('.app') || safeName.startsWith('/')) {
        await execAsync(`open "${safeName}"`);
      } else {
        await execAsync(`open -a "${safeName}"`);
      }
    } else if (platform === 'win32') {
      await execAsync(`start "" "${safeName}"`);
    } else {
      await execAsync(`xdg-open "${safeName}" || "${safeName}" &`);
    }
    return { ok: true, message: `Launched "${safeName}"` };
  } catch (err: any) {
    return { ok: false, message: `Failed to launch "${appNameOrPath}": ${err.message}` };
  }
}

export async function quitApplication(appName: string): Promise<{ ok: boolean; message: string }> {
  const platform = os.platform();
  const safeName = appName.replace(/["`$\\]/g, '');
  try {
    if (platform === 'darwin') {
      await execAsync(`osascript -e 'quit app "${safeName}"'`);
    } else if (platform === 'win32') {
      await execAsync(`taskkill /IM "${safeName}.exe"`);
    } else {
      await execAsync(`pkill -f "${safeName}"`);
    }
    return { ok: true, message: `Sent quit command to "${safeName}"` };
  } catch (err: any) {
    return { ok: false, message: `Failed to quit "${appName}": ${err.message}` };
  }
}

export async function killProcessByPid(pid: number, force = false): Promise<{ ok: boolean; message: string }> {
  try {
    if (!Number.isInteger(pid) || pid <= 1) {
      return { ok: false, message: 'Invalid or protected PID' };
    }
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    return { ok: true, message: `Terminated PID ${pid} (${force ? 'SIGKILL' : 'SIGTERM'})` };
  } catch (err: any) {
    return { ok: false, message: `Failed to kill PID ${pid}: ${err.message}` };
  }
}
