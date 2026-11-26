import si from 'systeminformation';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
const execFileAsync = promisify(execFile);
const iconCacheDir = path.join(os.tmpdir(), 'smartmac-app-icons');
const resolvedIconMap = new Map();
let cachedAppsList = null;
function matchProcessToAppPath(procName, command, apps) {
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
export async function getTopProcesses(limit = 50) {
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
export async function listInstalledApps() {
    const apps = [];
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
            }
            catch {
                // Ignore
            }
        }
    }
    else if (platform === 'linux') {
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
            }
            catch {
                // Ignore
            }
        }
    }
    else if (platform === 'win32') {
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
            }
            catch {
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
export async function getAppIconPngPath(appPath, appName) {
    if (os.platform() !== 'darwin')
        return null;
    let targetAppPath = appPath;
    if (!targetAppPath && appName) {
        const apps = cachedAppsList || (await listInstalledApps());
        targetAppPath = matchProcessToAppPath(appName, '', apps);
    }
    if (!targetAppPath || !targetAppPath.endsWith('.app'))
        return null;
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
        const files = await fs.readdir(resDir).catch(() => []);
        const icnsFiles = files.filter((f) => f.toLowerCase().endsWith('.icns'));
        if (icnsFiles.length === 0) {
            resolvedIconMap.set(targetAppPath, null);
            return null;
        }
        // Prefer AppIcon.icns or the first .icns
        const preferred = icnsFiles.find((f) => f.toLowerCase().includes('appicon')) || icnsFiles[0];
        const icnsFullPath = path.join(resDir, preferred);
        await execFileAsync('sips', ['-s', 'format', 'png', '-Z', '64', icnsFullPath, '--out', outPng]);
        if (fsSync.existsSync(outPng)) {
            resolvedIconMap.set(targetAppPath, outPng);
            return outPng;
        }
    }
    catch {
        // ignore extraction error
    }
    resolvedIconMap.set(targetAppPath, null);
    return null;
}
export async function launchApplication(appNameOrPath) {
    const platform = os.platform();
    const safeName = (appNameOrPath || '').trim();
    if (!safeName || /[;&|`$]/.test(safeName)) {
        return { ok: false, message: 'Blocked unsafe application name/path' };
    }
    try {
        if (platform === 'darwin') {
            if (safeName.endsWith('.app') || safeName.startsWith('/')) {
                await execFileAsync('open', [safeName]);
            }
            else {
                await execFileAsync('open', ['-a', safeName]);
            }
        }
        else if (platform === 'win32') {
            await execFileAsync('cmd.exe', ['/c', 'start', '', safeName]);
        }
        else {
            await execFileAsync('xdg-open', [safeName]);
        }
        return { ok: true, message: `Launched "${safeName}"` };
    }
    catch (err) {
        return { ok: false, message: `Failed to launch "${appNameOrPath}": ${err.message}` };
    }
}
export async function quitApplication(appName) {
    const platform = os.platform();
    const safeName = (appName || '').replace(/[^a-zA-Z0-9 ._-]/g, '');
    if (!safeName) {
        return { ok: false, message: 'Invalid application name' };
    }
    try {
        if (platform === 'darwin') {
            await execFileAsync('osascript', ['-e', `quit app "${safeName}"`]);
        }
        else if (platform === 'win32') {
            await execFileAsync('taskkill', ['/IM', `${safeName}.exe`]);
        }
        else {
            await execFileAsync('pkill', ['-f', safeName]);
        }
        return { ok: true, message: `Sent quit command to "${safeName}"` };
    }
    catch (err) {
        return { ok: false, message: `Failed to quit "${appName}": ${err.message}` };
    }
}
export async function killProcessByPid(pid, force = false) {
    try {
        if (!Number.isInteger(pid) || pid <= 1) {
            return { ok: false, message: 'Invalid or protected PID' };
        }
        process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
        return { ok: true, message: `Terminated PID ${pid} (${force ? 'SIGKILL' : 'SIGTERM'})` };
    }
    catch (err) {
        return { ok: false, message: `Failed to kill PID ${pid}: ${err.message}` };
    }
}
/**
 * Safely uninstalls an application across macOS, Windows, and Linux:
 * - Protects core OS / Apple System applications (/System/Applications)
 * - Gracefully quits the running app first
 * - On macOS: moves the .app bundle + optional ~/Library user caches/preferences to ~/.Trash
 *   (falls back to Finder AppleScript delete prompt if the app is owned by root)
 * - On Windows: triggers winget uninstall or opens Windows Apps & Features
 */
export async function uninstallApplication(appPath, appName, cleanLeftovers = true) {
    const platform = os.platform();
    const resolved = path.resolve(appPath || '');
    // Block uninstalling protected macOS / System apps
    if (resolved.startsWith('/System/') ||
        resolved === '/Applications/Safari.app' ||
        !resolved ||
        resolved === '/') {
        return {
            ok: false,
            message: `Cannot uninstall protected system application: ${appName}`,
        };
    }
    // 1. Try quitting the application first so files aren't locked
    await quitApplication(appName).catch(() => { });
    if (platform === 'darwin') {
        if (!resolved.endsWith('.app') || !fsSync.existsSync(resolved)) {
            return { ok: false, message: `Application bundle not found: ${resolved}` };
        }
        const trashDir = path.join(os.homedir(), '.Trash');
        const trashTarget = path.join(trashDir, `${Date.now()}_${path.basename(resolved)}`);
        const cleanedPaths = [];
        try {
            // Try direct move to user's ~/.Trash
            await fs.rename(resolved, trashTarget);
            cleanedPaths.push(resolved);
        }
        catch {
            // Fallback: use macOS Finder via AppleScript (prompts native macOS TouchID / Password dialog if app is root-owned)
            try {
                const safePosix = resolved.replace(/"/g, '\\"');
                await execFileAsync('osascript', [
                    '-e',
                    `tell application "Finder" to delete POSIX file "${safePosix}"`,
                ]);
                cleanedPaths.push(resolved);
            }
            catch (err) {
                return {
                    ok: false,
                    message: `Could not move ${appName} to Trash (${err.message}). Check permissions in Finder.`,
                };
            }
        }
        // Optional: Clean leftover caches & application support in ~/Library
        if (cleanLeftovers && appName) {
            const home = os.homedir();
            const candidates = [
                path.join(home, 'Library', 'Application Support', appName),
                path.join(home, 'Library', 'Caches', appName),
                path.join(home, 'Library', 'Logs', appName),
            ];
            for (const item of candidates) {
                if (fsSync.existsSync(item)) {
                    try {
                        const dest = path.join(trashDir, `${Date.now()}_${path.basename(item)}_leftover`);
                        await fs.rename(item, dest);
                        cleanedPaths.push(item);
                    }
                    catch {
                        // ignore inaccessible cache
                    }
                }
            }
        }
        cachedAppsList = null;
        return {
            ok: true,
            message: `Uninstalled "${appName}" and moved ${cleanedPaths.length} item(s) to macOS Trash.`,
            cleanedPaths,
        };
    }
    else if (platform === 'win32') {
        try {
            await execFileAsync('winget', ['uninstall', '--name', appName, '--silent']);
            cachedAppsList = null;
            return { ok: true, message: `Uninstalled "${appName}" via Windows Winget.` };
        }
        catch {
            await execFileAsync('cmd.exe', ['/c', 'start', 'ms-settings:appsfeatures']).catch(() => { });
            return {
                ok: true,
                message: `Opened Windows Installed Apps settings to complete uninstall for "${appName}".`,
            };
        }
    }
    else {
        if (resolved.startsWith(os.homedir()) && fsSync.existsSync(resolved)) {
            await fs.unlink(resolved);
            cachedAppsList = null;
            return { ok: true, message: `Removed user application shortcut: ${resolved}` };
        }
        return {
            ok: false,
            message: `System package "${appName}" must be removed via apt/dnf/flatpak.`,
        };
    }
}
