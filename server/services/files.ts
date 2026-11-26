import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  extension: string;
}

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

export async function listDirectory(dirPath?: string, showHidden = false): Promise<{
  currentPath: string;
  parentPath: string;
  entries: FileEntry[];
}> {
  const resolved = dirPath ? path.resolve(dirPath.replace(/^~/, os.homedir())) : os.homedir();
  const dirEntries = await fs.readdir(resolved, { withFileTypes: true });
  const entries: FileEntry[] = [];

  for (const d of dirEntries) {
    if (!showHidden && d.name.startsWith('.')) continue;
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
    } catch {
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
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    currentPath: resolved,
    parentPath: path.dirname(resolved),
    entries,
  };
}

export async function readFilePreview(filePath: string): Promise<{
  path: string;
  name: string;
  size: number;
  content: string;
  truncated: boolean;
  isBinary: boolean;
}> {
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
  } finally {
    await handle.close();
  }
}

export async function saveTextFile(filePath: string, content: string): Promise<{ ok: boolean; path: string }> {
  const resolved = path.resolve(filePath.replace(/^~/, os.homedir()));
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf-8');
  return { ok: true, path: resolved };
}

export async function createFolder(folderPath: string): Promise<{ ok: boolean; path: string }> {
  const resolved = path.resolve(folderPath.replace(/^~/, os.homedir()));
  await fs.mkdir(resolved, { recursive: true });
  return { ok: true, path: resolved };
}

export async function renameEntry(oldPath: string, newName: string): Promise<{ ok: boolean; newPath: string }> {
  const resolvedOld = path.resolve(oldPath.replace(/^~/, os.homedir()));
  const resolvedNew = path.join(path.dirname(resolvedOld), path.basename(newName));
  await fs.rename(resolvedOld, resolvedNew);
  return { ok: true, newPath: resolvedNew };
}

export async function moveToTrash(targetPath: string): Promise<{ ok: boolean; message: string }> {
  const resolved = path.resolve(targetPath.replace(/^~/, os.homedir()));
  const trashPath = path.join(os.homedir(), '.Trash', `${Date.now()}_${path.basename(resolved)}`);
  await fs.rename(resolved, trashPath);
  return { ok: true, message: `Moved ${path.basename(resolved)} to Trash` };
}

export async function revealInFinder(targetPath: string): Promise<{ ok: boolean; message: string }> {
  const resolved = path.resolve(targetPath.replace(/^~/, os.homedir()));
  const safePath = resolved.replace(/"/g, '\\"');
  await execAsync(`open -R "${safePath}"`);
  return { ok: true, message: `Revealed ${path.basename(resolved)} in Finder` };
}

export async function searchFilesInDir(dirPath: string, query: string): Promise<FileEntry[]> {
  const resolved = path.resolve(dirPath.replace(/^~/, os.homedir()));
  const q = query.toLowerCase();
  const results: FileEntry[] = [];

  async function walk(current: string, depth: number) {
    if (depth > 2 || results.length >= 60) return;
    let items;
    try {
      items = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
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
        } catch {
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
