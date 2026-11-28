import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import { ensureMediaDir, MEDIA_CAPTURES_DIR } from './media.js';
const execFileAsync = promisify(execFile);
const CAMERAS_STORE_PATH = path.join(process.cwd(), '.local-cameras.json');
export function getFfmpegBinary() {
    if (typeof ffmpegStatic === 'string' && fsSync.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
    }
    return 'ffmpeg';
}
export function buildRtspUrl(cam) {
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
export async function listCameras() {
    try {
        const raw = await fs.readFile(CAMERAS_STORE_PATH, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
export async function saveCamera(input) {
    const existing = await listCameras();
    const id = input.id || `cam-${Date.now()}`;
    const entry = {
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
export async function deleteCamera(id) {
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
export async function discoverLanCameras() {
    const ifaces = os.networkInterfaces();
    let localIp = '';
    for (const list of Object.values(ifaces)) {
        if (!list)
            continue;
        for (const addr of list) {
            if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
                localIp = addr.address;
                break;
            }
        }
        if (localIp)
            break;
    }
    if (!localIp) {
        return { subnet: 'Unknown', devices: [] };
    }
    const parts = localIp.split('.');
    const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const found = [];
    const checkPort = (ip, port) => new Promise((resolve) => {
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
    const ips = [];
    for (let i = 1; i <= 254; i++) {
        ips.push(`${prefix}.${i}`);
    }
    for (let i = 0; i < ips.length; i += 32) {
        const batch = ips.slice(i, i + 32);
        const results = await Promise.all(batch.map(async (ip) => ({ ip, open: await checkPort(ip, 554) })));
        for (const r of results) {
            if (r.open)
                found.push({ ip: r.ip, port: 554 });
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
export async function streamCameraMjpeg(cameraId, req, res) {
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
    ff.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        let start = buffer.indexOf(SOI);
        let end = buffer.indexOf(EOI, start + 2);
        while (start !== -1 && end !== -1) {
            const frame = buffer.subarray(start, end + 2);
            buffer = buffer.subarray(end + 2);
            if (!res.writableEnded) {
                res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
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
        if (!res.writableEnded)
            res.end();
    });
    ff.on('error', () => {
        if (!res.writableEnded)
            res.end();
    });
    req.on('close', () => {
        try {
            ff.kill('SIGKILL');
        }
        catch {
            // ignore
        }
    });
}
/**
 * Captures a single HD JPEG snapshot from an Imou / Tapo camera and saves it to ~/Desktop/SmartMac-Captures
 */
export async function captureCameraSnapshot(cameraId) {
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
        await execFileAsync(ffmpegBin, [
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
        ], { timeout: 12000 });
        return {
            ok: true,
            message: `Saved camera snapshot: ${filename}`,
            filename,
            url: `/api/media/file/${encodeURIComponent(filename)}`,
        };
    }
    catch (err) {
        return {
            ok: false,
            message: `Failed to capture snapshot from ${cam.name}: ${err.message}`,
        };
    }
}
function findSmartMacAppBin() {
    if (os.platform() !== 'darwin')
        return null;
    const candidates = [
        process.env.SMARTMAC_APP_BIN || '',
        '/Applications/SmartMac.app/Contents/MacOS/SmartMac',
        `${os.homedir()}/Applications/SmartMac.app/Contents/MacOS/SmartMac`,
    ].filter(Boolean);
    for (const p of candidates) {
        if (fsSync.existsSync(p))
            return p;
    }
    return null;
}
export async function findNativeAppWindowId(appQuery) {
    const bin = findSmartMacAppBin();
    if (!bin)
        return { found: false };
    try {
        const { stdout } = await execFileAsync(bin, ['--find-window', appQuery], { timeout: 4000 });
        return JSON.parse(stdout);
    }
    catch {
        return { found: false };
    }
}
/**
 * Captures a single live JPEG frame of an installed macOS app window (ImouLife HD / Tapo)
 * Works reliably across macOS WKWebView, Safari, and Chrome without multipart MJPEG quirks.
 */
export async function captureNativeAppWindowFrame(appKey) {
    if (os.platform() !== 'darwin') {
        return { ok: false, error: 'Native window embed is supported on macOS' };
    }
    const queryMap = {
        imou: { query: 'Imou', appPath: '/Applications/ImouLife HD.app' },
        tapo: { query: 'Tapo', appPath: '/Applications/Tapo.app' },
    };
    const target = queryMap[appKey.toLowerCase()];
    if (!target) {
        return { ok: false, error: 'Unknown app key' };
    }
    let win = await findNativeAppWindowId(target.query);
    if (!win.found && fsSync.existsSync(target.appPath)) {
        await execFileAsync('open', ['-g', target.appPath]).catch(() => { });
        await new Promise((r) => setTimeout(r, 1500));
        win = await findNativeAppWindowId(target.query);
    }
    if (!win.found || !win.windowId) {
        return { ok: false, error: `${target.query} window not found. Please open ${target.appPath}.` };
    }
    const tmpFile = path.join(os.tmpdir(), `smartmac-frame-${appKey}-${process.pid}.jpg`);
    try {
        await execFileAsync('screencapture', ['-l', String(win.windowId), '-o', '-x', '-t', 'jpg', tmpFile], { timeout: 3000 });
        if (fsSync.existsSync(tmpFile)) {
            const buffer = await fs.readFile(tmpFile);
            await fs.unlink(tmpFile).catch(() => { });
            if (buffer.length > 0) {
                return { ok: true, buffer };
            }
        }
        return {
            ok: false,
            error: 'macOS blocked window capture — enable Screen Recording for SmartMac in System Settings.',
            needsScreenPermission: true,
        };
    }
    catch (err) {
        await fs.unlink(tmpFile).catch(() => { });
        return {
            ok: false,
            error: err.message || 'Window capture failed',
            needsScreenPermission: true,
        };
    }
}
export async function openMacScreenRecordingSettings() {
    if (os.platform() !== 'darwin')
        return { ok: false, message: 'macOS only' };
    try {
        await execFileAsync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);
        return { ok: true, message: 'Opened macOS Screen Recording Settings. Enable SmartMac and restart.' };
    }
    catch (err) {
        return { ok: false, message: err.message };
    }
}
/**
 * Zero-popup Live MJPEG stream of an installed macOS app window (e.g. "ImouLife" or "Tapo")
 * Automatically finds the CGWindowID and streams frames directly into an <img> tag in the web UI.
 */
export async function streamNativeAppWindowMjpeg(appKey, req, res) {
    if (os.platform() !== 'darwin') {
        return res.status(400).json({ error: 'Native window embed is supported on macOS' });
    }
    const queryMap = {
        imou: { query: 'Imou', appPath: '/Applications/ImouLife HD.app' },
        tapo: { query: 'Tapo', appPath: '/Applications/Tapo.app' },
    };
    const target = queryMap[appKey.toLowerCase()];
    if (!target) {
        return res.status(404).json({ error: 'Unknown native app key' });
    }
    // Ensure the app is launched so its window exists
    let win = await findNativeAppWindowId(target.query);
    if (!win.found && fsSync.existsSync(target.appPath)) {
        await execFileAsync('open', ['-g', target.appPath]).catch(() => { });
        await new Promise((r) => setTimeout(r, 1800));
        win = await findNativeAppWindowId(target.query);
    }
    if (!win.found || !win.windowId) {
        return res.status(404).json({
            error: `${target.query} window not found. Make sure ${target.appPath} is open.`,
        });
    }
    const boundary = 'smartmacwinframe';
    res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Connection: 'keep-alive',
    });
    let closed = false;
    req.on('close', () => {
        closed = true;
    });
    const tmpFile = path.join(os.tmpdir(), `smartmac-win-${appKey}-${Date.now()}.jpg`);
    const captureLoop = async () => {
        while (!closed && !res.writableEnded) {
            try {
                await execFileAsync('screencapture', ['-l', String(win.windowId), '-o', '-x', '-t', 'jpg', tmpFile], { timeout: 3000 });
                if (fsSync.existsSync(tmpFile)) {
                    const frame = await fs.readFile(tmpFile);
                    if (!closed && !res.writableEnded && frame.length > 0) {
                        res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
                        res.write(frame);
                        res.write('\r\n');
                    }
                }
            }
            catch {
                // Re-check windowId in case the app window was recreated
                const refreshed = await findNativeAppWindowId(target.query);
                if (refreshed.found && refreshed.windowId) {
                    win = refreshed;
                }
            }
            await new Promise((r) => setTimeout(r, 220)); // ~4-5 FPS smooth low-CPU live embed
        }
        await fs.unlink(tmpFile).catch(() => { });
        if (!res.writableEnded)
            res.end();
    };
    captureLoop();
}
