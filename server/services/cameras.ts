import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import type { Request, Response } from 'express';
import ffmpegStatic from 'ffmpeg-static';
import { ensureMediaDir, MEDIA_CAPTURES_DIR } from './media.js';

const execFileAsync = promisify(execFile);
const CAMERAS_STORE_PATH = path.join(process.cwd(), '.local-cameras.json');

export type CameraBrand = 'tapo' | 'imou' | 'custom';

export interface CameraProfile {
  id: string;
  name: string;
  brand: CameraBrand;
  host: string;
  port: number;
  username: string;
  password: string;
  quality: 'hd' | 'sd';
  customRtspUrl?: string;
  location?: string;
}

export function getFfmpegBinary(): string | null {
  if (typeof ffmpegStatic === 'string' && fsSync.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return 'ffmpeg';
}

export function buildRtspUrl(cam: CameraProfile): string {
  if (cam.brand === 'custom' && cam.customRtspUrl) {
    return cam.customRtspUrl.trim();
  }
  const user = encodeURIComponent(cam.username || 'admin');
  const pass = encodeURIComponent(cam.password || '');
  const host = (cam.host || '').trim();
  const port = Number(cam.port) || 554;

  if (cam.brand === 'tapo') {
    // TP-Link Tapo standard RTSP paths: /stream1 (HD) or /stream2 (SD)
    const streamPath = cam.quality === 'sd' ? 'stream2' : 'stream1';
    return `rtsp://${user}:${pass}@${host}:${port}/${streamPath}`;
  }

  // Imou Life (Dahua/Imou) standard RTSP path:
  // subtype=0 (Main HD stream) | subtype=1 (Sub SD stream)
  const subtype = cam.quality === 'sd' ? '1' : '0';
  return `rtsp://${user}:${pass}@${host}:${port}/cam/realmonitor?channel=1&subtype=${subtype}`;
}

export async function listCameras(): Promise<CameraProfile[]> {
  try {
    const raw = await fs.readFile(CAMERAS_STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveCamera(
  input: Omit<CameraProfile, 'id'> & { id?: string }
): Promise<CameraProfile[]> {
  const existing = await listCameras();
  const id = input.id || `cam-${Date.now()}`;
  const entry: CameraProfile = {
    id,
    name: (input.name || '').trim() || `${input.brand.toUpperCase()} Camera`,
    brand: input.brand || 'tapo',
    host: (input.host || '').trim(),
    port: Number(input.port) || 554,
    username: (input.username || (input.brand === 'imou' ? 'admin' : '')).trim(),
    password: input.password || '',
    quality: input.quality === 'sd' ? 'sd' : 'hd',
    customRtspUrl: input.customRtspUrl ? input.customRtspUrl.trim() : undefined,
    location: (input.location || '').trim(),
  };

  const updated = [entry, ...existing.filter((c) => c.id !== id)];
  await fs.writeFile(CAMERAS_STORE_PATH, JSON.stringify(updated, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return updated;
}

export async function deleteCamera(id: string): Promise<CameraProfile[]> {
  const existing = await listCameras();
  const updated = existing.filter((c) => c.id !== id);
  await fs.writeFile(CAMERAS_STORE_PATH, JSON.stringify(updated, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return updated;
}

/**
 * Scans the local Wi-Fi /24 subnet for devices with port 554 (RTSP) open (Tapo, Imou, ONVIF IP cameras)
 */
export async function discoverLanCameras(): Promise<{
  subnet: string;
  devices: Array<{ ip: string; port: number }>;
}> {
  const ifaces = os.networkInterfaces();
  let localIp = '';
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const addr of list) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        localIp = addr.address;
        break;
      }
    }
    if (localIp) break;
  }

  if (!localIp) {
    return { subnet: 'Unknown', devices: [] };
  }

  const parts = localIp.split('.');
  const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const found: Array<{ ip: string; port: number }> = [];

  const checkPort = (ip: string, port: number): Promise<boolean> =>
    new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(350);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, ip);
    });

  // Scan in batches of 32 IPs to keep network fast & clean
  const ips: string[] = [];
  for (let i = 1; i <= 254; i++) {
    ips.push(`${prefix}.${i}`);
  }

  for (let i = 0; i < ips.length; i += 32) {
    const batch = ips.slice(i, i + 32);
    const results = await Promise.all(
      batch.map(async (ip) => ({ ip, open: await checkPort(ip, 554) }))
    );
    for (const r of results) {
      if (r.open) found.push({ ip: r.ip, port: 554 });
    }
  }

  return {
    subnet: `${prefix}.0/24`,
    devices: found,
  };
}

/**
 * Streams an Imou / Tapo RTSP camera as live multipart MJPEG over HTTP so any browser / WKWebView can display it directly in an <img> tag
 */
export async function streamCameraMjpeg(cameraId: string, req: Request, res: Response) {
  const cams = await listCameras();
  const cam = cams.find((c) => c.id === cameraId);
  if (!cam) {
    return res.status(404).json({ error: 'Camera not found' });
  }

  const ffmpegBin = getFfmpegBinary();
  if (!ffmpegBin) {
    return res.status(500).json({ error: 'ffmpeg binary not available' });
  }

  const rtspUrl = buildRtspUrl(cam);
  const boundary = 'smartmacframe';

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Connection: 'keep-alive',
  });

  const ff = spawn(ffmpegBin, [
    '-rtsp_transport',
    'tcp',
    '-stimeout',
    '8000000',
    '-i',
    rtspUrl,
    '-f',
    'mjpeg',
    '-q:v',
    '6',
    '-r',
    '10',
    '-vf',
    'scale=960:-2',
    'pipe:1',
  ]);

  let buffer = Buffer.alloc(0);
  const SOI = Buffer.from([0xff, 0xd8]);
  const EOI = Buffer.from([0xff, 0xd9]);

  ff.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    let start = buffer.indexOf(SOI);
    let end = buffer.indexOf(EOI, start + 2);

    while (start !== -1 && end !== -1) {
      const frame = buffer.subarray(start, end + 2);
      buffer = buffer.subarray(end + 2);

      if (!res.writableEnded) {
        res.write(
          `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
        );
        res.write(frame);
        res.write('\r\n');
      }

      start = buffer.indexOf(SOI);
      end = buffer.indexOf(EOI, start + 2);
    }

    // Safety cap to prevent unbounded memory growth
    if (buffer.length > 2 * 1024 * 1024) {
      buffer = Buffer.alloc(0);
    }
  });

  ff.on('close', () => {
    if (!res.writableEnded) res.end();
  });

  ff.on('error', () => {
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => {
    try {
      ff.kill('SIGKILL');
    } catch {
      // ignore
    }
  });
}

/**
 * Captures a single HD JPEG snapshot from an Imou / Tapo camera and saves it to ~/Desktop/SmartMac-Captures
 */
export async function captureCameraSnapshot(
  cameraId: string
): Promise<{ ok: boolean; message: string; filename?: string; url?: string }> {
  const cams = await listCameras();
  const cam = cams.find((c) => c.id === cameraId);
  if (!cam) {
    return { ok: false, message: 'Camera not found' };
  }

  const ffmpegBin = getFfmpegBinary();
  if (!ffmpegBin) {
    return { ok: false, message: 'ffmpeg binary not available' };
  }

  await ensureMediaDir();
  const safeName = cam.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Cam_${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
  const outPath = path.join(MEDIA_CAPTURES_DIR, filename);
  const rtspUrl = buildRtspUrl(cam);

  try {
    await execFileAsync(
      ffmpegBin,
      [
        '-rtsp_transport',
        'tcp',
        '-y',
        '-i',
        rtspUrl,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        outPath,
      ],
      { timeout: 12000 }
    );
    return {
      ok: true,
      message: `Saved camera snapshot: ${filename}`,
      filename,
      url: `/api/media/file/${encodeURIComponent(filename)}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Failed to capture snapshot from ${cam.name}: ${err.message}`,
    };
  }
}
