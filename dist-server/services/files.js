import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
export function getBookmarks() {
    const home = os.homedir();
    return [
        { label: 'Home', path: home, icon: 'Home' },
        { label: 'Desktop', path: path.join(home, 'Desktop'), icon: 'Monitor' },
        { label: 'Downloads', path: path.join(home, 'Downloads'), icon: 'Download' },
        { label: 'Documents', path: path.join(home, 'Documents'), icon: 'FileText' },
        { label: 'Applications', path: '/Applications', icon: 'Grid' },
        { label: 'Workspace', path: process.cwd(), icon: 'FolderGit2' },
    ];
}
export async function listDirectory(dirPath, showHidden = false) {
    const resolved = dirPath ? path.resolve(dirPath.replace(/^~/, os.homedir())) : os.homedir();
    const dirEntries = await fs.readdir(resolved, { withFileTypes: true });
    const entries = [];
    for (const d of dirEntries) {
        if (!showHidden && d.name.startsWith('.'))
            continue;
        const fullPath = path.join(resolved, d.name);
        try {
            const stat = await fs.stat(fullPath);
            entries.push({
                name: d.name,
                path: fullPath,
                isDirectory: d.isDirectory(),
                size: stat.size,
                modifiedAt: stat.mtimeMs,
                extension: d.isDirectory() ? '' : path.extname(d.name).toLowerCase(),
            });
        }
        catch {
            // Broken symlink or permission denied
            entries.push({
                name: d.name,
                path: fullPath,
                isDirectory: d.isDirectory(),
                size: 0,
                modifiedAt: 0,
                extension: '',
            });
        }
    }
    entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory)
            return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return {
        currentPath: resolved,
        parentPath: path.dirname(resolved),
        entries,
    };
}
export async function readFilePreview(filePath) {
    const resolved = path.resolve(filePath.replace(/^~/, os.homedir()));
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
        throw new Error('Cannot preview a directory');
    }
    const maxBytes = 64 * 1024; // 64 KB preview
    const handle = await fs.open(resolved, 'r');
    try {
        const buf = Buffer.alloc(Math.min(stat.size, maxBytes));
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
        const slice = buf.subarray(0, bytesRead);
        // Check for null bytes to detect binary
        const isBinary = slice.includes(0);
        return {
            path: resolved,
            name: path.basename(resolved),
            size: stat.size,
            content: isBinary ? '[Binary file - open in Finder or native app to view]' : slice.toString('utf-8'),
            truncated: stat.size > maxBytes,
            isBinary,
        };
    }
    finally {
        await handle.close();
    }
}
export async function saveTextFile(filePath, content) {
    const resolved = path.resolve(filePath.replace(/^~/, os.homedir()));
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
    return { ok: true, path: resolved };
}
export async function createFolder(folderPath) {
    const resolved = path.resolve(folderPath.replace(/^~/, os.homedir()));
    await fs.mkdir(resolved, { recursive: true });
    return { ok: true, path: resolved };
}
export async function renameEntry(oldPath, newName) {
    const resolvedOld = path.resolve(oldPath.replace(/^~/, os.homedir()));
    const resolvedNew = path.join(path.dirname(resolvedOld), path.basename(newName));
    await fs.rename(resolvedOld, resolvedNew);
    return { ok: true, newPath: resolvedNew };
}
export async function moveToTrash(targetPath) {
    const resolved = path.resolve(targetPath.replace(/^~/, os.homedir()));
    const trashDir = os.platform() === 'darwin'
        ? path.join(os.homedir(), '.Trash')
        : path.join(os.homedir(), '.SmartMac-Trash');
    await fs.mkdir(trashDir, { recursive: true });
    const trashPath = path.join(trashDir, `${Date.now()}_${path.basename(resolved)}`);
    await fs.rename(resolved, trashPath);
    return { ok: true, message: `Moved ${path.basename(resolved)} to Trash` };
}
export async function revealInFinder(targetPath) {
    const resolved = path.resolve(targetPath.replace(/^~/, os.homedir()));
    const platform = os.platform();
    if (platform === 'darwin') {
        await execFileAsync('open', ['-R', resolved]);
        return { ok: true, message: `Revealed ${path.basename(resolved)} in Finder` };
    }
    else if (platform === 'win32') {
        await execFileAsync('explorer.exe', [`/select,${resolved}`]).catch(() => { });
        return { ok: true, message: `Revealed ${path.basename(resolved)} in Windows Explorer` };
    }
    else {
        await execFileAsync('xdg-open', [path.dirname(resolved)]);
        return { ok: true, message: `Opened folder in File Manager` };
    }
}
export async function searchFilesInDir(dirPath, query) {
    const resolved = path.resolve(dirPath.replace(/^~/, os.homedir()));
    const q = query.toLowerCase();
    const results = [];
    async function walk(current, depth) {
        if (depth > 2 || results.length >= 60)
            return;
        let items;
        try {
            items = await fs.readdir(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules')
                continue;
            const full = path.join(current, item.name);
            if (item.name.toLowerCase().includes(q)) {
                try {
                    const st = await fs.stat(full);
                    results.push({
                        name: item.name,
                        path: full,
                        isDirectory: item.isDirectory(),
                        size: st.size,
                        modifiedAt: st.mtimeMs,
                        extension: item.isDirectory() ? '' : path.extname(item.name).toLowerCase(),
                    });
                }
                catch {
                    // ignore
                }
            }
            if (item.isDirectory() && results.length < 60) {
                await walk(full, depth + 1);
            }
        }
    }
    await walk(resolved, 0);
    return results;
}
