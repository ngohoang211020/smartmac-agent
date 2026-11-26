import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const MEDIA_CAPTURES_DIR = path.join(os.homedir(), 'Desktop', 'SmartMac-Captures');

export interface MediaFileItem {
  name: string;
  path: string;
  type: 'screenshot' | 'video' | 'audio';
  size: number;
  createdAt: number;
  url: string;
}

export async function ensureMediaDir(): Promise<string> {
  await fs.mkdir(MEDIA_CAPTURES_DIR, { recursive: true });
  return MEDIA_CAPTURES_DIR;
}

export async function listCapturedMedia(): Promise<MediaFileItem[]> {
  await ensureMediaDir();
  const entries = await fs.readdir(MEDIA_CAPTURES_DIR, { withFileTypes: true });
  const items: MediaFileItem[] = [];

  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const full = path.join(MEDIA_CAPTURES_DIR, e.name);
    try {
      const st = await fs.stat(full);
      const ext = path.extname(e.name).toLowerCase();
      let type: 'screenshot' | 'video' | 'audio' = 'screenshot';
      if (['.webm', '.mp4', '.mov', '.mkv'].includes(ext)) type = 'video';
      else if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) type = 'audio';

      items.push({
        name: e.name,
        path: full,
        type,
        size: st.size,
        createdAt: st.mtimeMs,
        url: `/api/media/file/${encodeURIComponent(e.name)}`,
      });
    } catch {
      // ignore
    }
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Takes an OS-level native screenshot and saves it to ~/Desktop/SmartMac-Captures
 */
export async function takeNativeOsScreenshot(
  mode: 'fullscreen' | 'interactive' = 'fullscreen'
): Promise<{ ok: boolean; message: string; item?: MediaFileItem }> {
  await ensureMediaDir();
  const platform = os.platform();
  const filename = `Screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const outPath = path.join(MEDIA_CAPTURES_DIR, filename);

  try {
    if (platform === 'darwin') {
      const args = mode === 'interactive' ? ['-i', outPath] : ['-x', outPath];
      await execFileAsync('screencapture', args);
    } else if (platform === 'win32') {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;
        $graphics = [System.Drawing.Graphics]::FromImage($bmp);
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);
        $bmp.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);
        $graphics.Dispose();
        $bmp.Dispose();
      `;
      await execFileAsync('powershell', ['-NoProfile', '-Command', psScript]);
    } else {
      await execFileAsync('gnome-screenshot', ['-f', outPath]).catch(async () => {
        await execFileAsync('scrot', [outPath]);
      });
    }

    if (!fsSync.existsSync(outPath)) {
      return { ok: false, message: 'Screenshot cancelled or permission not granted.' };
    }

    const st = await fs.stat(outPath);
    const item: MediaFileItem = {
      name: filename,
      path: outPath,
      type: 'screenshot',
      size: st.size,
      createdAt: st.mtimeMs,
      url: `/api/media/file/${encodeURIComponent(filename)}`,
    };
    return { ok: true, message: `Saved screenshot: ${filename}`, item };
  } catch (err: any) {
    return {
      ok: false,
      message: `Screenshot failed (${err.message}). You can also use Browser Screen Capture below.`,
    };
  }
}

/**
 * Saves a base64-encoded screenshot, screen recording (.webm/.mp4), or audio recording (.webm/.wav)
 * captured from the Web Media Studio directly into ~/Desktop/SmartMac-Captures
 */
export async function saveBase64MediaFile(
  filename: string,
  base64Data: string,
  type: 'screenshot' | 'video' | 'audio'
): Promise<{ ok: boolean; message: string; item?: MediaFileItem }> {
  await ensureMediaDir();
  const safeBase = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const outPath = path.join(MEDIA_CAPTURES_DIR, safeBase);

  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  await fs.writeFile(outPath, buf);

  const st = await fs.stat(outPath);
  return {
    ok: true,
    message: `Saved ${type} to ${outPath}`,
    item: {
      name: safeBase,
      path: outPath,
      type,
      size: st.size,
      createdAt: st.mtimeMs,
      url: `/api/media/file/${encodeURIComponent(safeBase)}`,
    },
  };
}

export async function deleteMediaFile(filename: string): Promise<{ ok: boolean; message: string }> {
  const safeBase = path.basename(filename);
  const fullPath = path.join(MEDIA_CAPTURES_DIR, safeBase);
  await fs.unlink(fullPath);
  return { ok: true, message: `Deleted ${safeBase}` };
}
