import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getSystemSnapshot, runQuickSystemAction } from './services/system.js';
import {
  getTopProcesses,
  listInstalledApps,
  launchApplication,
  quitApplication,
  killProcessByPid,
  getAppIconPngPath,
  uninstallApplication,
} from './services/processes.js';
import {
  getBookmarks,
  listDirectory,
  readFilePreview,
  saveTextFile,
  createFolder,
  renameEntry,
  moveToTrash,
  revealInFinder,
  searchFilesInDir,
} from './services/files.js';
import {
  getNetworkOverview,
  scanWifiNetworks,
  toggleWifiPower,
  runPingDiagnostic,
  openMacLocationSettings,
  connectToWifiNetwork,
} from './services/network.js';
import {
  loadConfig,
  saveConfig,
  resetGmailSession,
  getGmailOAuthUrl,
  handleGmailOAuthCallback,
  fetchGmailMessages,
  fetchUnreadGmail3Days,
  sendGmailMessage,
  openExternalWebApp,
} from './services/social.js';
import {
  listVpsServers,
  saveVpsServer,
  deleteVpsServer,
  launchNativeSshTerminal,
  executeRemoteVpsCommand,
  listLocalSshKeys,
} from './services/vps.js';
import {
  MEDIA_CAPTURES_DIR,
  listCapturedMedia,
  takeNativeOsScreenshot,
  saveBase64MediaFile,
  deleteMediaFile,
} from './services/media.js';
import {
  listCameras,
  saveCamera,
  deleteCamera,
  discoverLanCameras,
  streamCameraMjpeg,
  captureCameraSnapshot,
  streamNativeAppWindowMjpeg,
  findNativeAppWindowId,
  captureNativeAppWindowFrame,
  openMacScreenRecordingSettings,
} from './services/cameras.js';
import {
  nodeSecretAuthGuard,
  getLocalNodeTelemetry,
  listLocalDockerContainers,
  runLocalDockerAction,
  execLocalNodeCommand,
  listClusterNodes,
  saveClusterNode,
  deleteClusterNode,
  pollAllClusterNodes,
  getRemoteNodeDocker,
  runRemoteNodeDockerAction,
  broadcastCommandToNodes,
} from './services/cluster.js';
import { processAgentMessage } from './services/agent.js';
import {
  strictLocalOriginGuard,
  adminPinAuthGuard,
  getSecurityStatus,
  saveSecurityPin,
  verifySecurityPin,
} from './security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(strictLocalOriginGuard);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by strict localhost CORS policy'));
      }
    },
  })
);
// ---express.json({ limit: '50mb' }) for video/audio recording uploads ---
app.use(express.json({ limit: '50mb' }));
app.use('/api', adminPinAuthGuard);

// --- TRANSPARENT MULTI-VM TARGET NODE PROXY MIDDLEWARE ---
// When the UI selects a remote VM in the top VM Switcher Bar, it sends `x-target-node: <nodeId>`.
// All standard system/files/processes/network/agent API calls are transparently proxied to that VM!
app.use('/api', async (req, res, next) => {
  const targetNodeId = String(req.headers['x-target-node'] || '').trim();
  if (
    !targetNodeId ||
    targetNodeId === 'local' ||
    req.path.startsWith('/cluster') ||
    req.path.startsWith('/security') ||
    req.path.startsWith('/node') ||
    req.path.startsWith('/social')
  ) {
    return next();
  }

  try {
    const nodes = await listClusterNodes();
    const node = nodes.find((n) => n.id === targetNodeId);
    if (!node) {
      return res.status(404).json({ error: `Target VM node not found: ${targetNodeId}` });
    }

    const forwardUrl = `${node.url}${req.originalUrl}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const fetchInit: RequestInit = {
        method: req.method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-node-secret': node.secret,
        },
      };
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
        fetchInit.body = JSON.stringify(req.body);
      }
      const upstream = await fetch(forwardUrl, fetchInit);
      const contentType = upstream.headers.get('content-type') || 'application/json';
      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.send(buf);
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    return res.status(502).json({
      error: `Failed to reach remote VM (${targetNodeId}): ${err.message}`,
    });
  }
});

// --- SECURITY & ADMIN PIN ROUTES ---
app.get('/api/security/status', (req, res) => {
  const token = String(req.headers['x-smartmac-token'] || '');
  res.json(getSecurityStatus(token));
});

app.post('/api/security/verify', (req, res) => {
  const { pin } = req.body;
  const result = verifySecurityPin(String(pin || ''));
  if (!result.ok) {
    return res.status(401).json({ ok: false, message: 'Invalid Admin PIN' });
  }
  res.json(result);
});

app.post('/api/security/set-pin', async (req, res) => {
  const { currentPin, newPin } = req.body;
  const status = getSecurityStatus();
  if (status.pinEnabled) {
    const check = verifySecurityPin(String(currentPin || ''));
    if (!check.ok) {
      return res.status(401).json({ ok: false, message: 'Current PIN is incorrect' });
    }
  }
  const result = await saveSecurityPin(newPin ? String(newPin) : null);
  res.json(result);
});

// --- SYSTEM & HARDWARE ROUTES ---
app.get('/api/system/snapshot', async (_req, res) => {
  try {
    const snap = await getSystemSnapshot();
    res.json(snap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/action', async (req, res) => {
  try {
    const { action } = req.body;
    const result = await runQuickSystemAction(action);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// --- PROCESSES & APPLICATIONS ROUTES ---
app.get('/api/processes', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const data = await getTopProcesses(limit);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/apps', async (_req, res) => {
  try {
    const apps = await listInstalledApps();
    res.json({ apps });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/apps/icon', async (req, res) => {
  try {
    const appPath = req.query.path ? String(req.query.path) : undefined;
    const appName = req.query.name ? String(req.query.name) : undefined;
    const pngPath = await getAppIconPngPath(appPath, appName);
    if (pngPath && fs.existsSync(pngPath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(pngPath);
    }
    res.status(404).end();
  } catch {
    res.status(404).end();
  }
});

app.post('/api/apps/launch', async (req, res) => {
  const { appNameOrPath } = req.body;
  const result = await launchApplication(appNameOrPath);
  res.json(result);
});

app.post('/api/apps/quit', async (req, res) => {
  const { appName } = req.body;
  const result = await quitApplication(appName);
  res.json(result);
});

app.post('/api/apps/uninstall', async (req, res) => {
  try {
    const { appPath, appName, cleanLeftovers } = req.body;
    const result = await uninstallApplication(
      String(appPath || ''),
      String(appName || ''),
      cleanLeftovers !== false
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post('/api/processes/kill', async (req, res) => {
  const { pid, force } = req.body;
  const result = await killProcessByPid(Number(pid), Boolean(force));
  res.json(result);
});

// --- FILES & FOLDERS ROUTES ---
app.get('/api/files/bookmarks', (_req, res) => {
  res.json({ bookmarks: getBookmarks() });
});

app.get('/api/files/list', async (req, res) => {
  try {
    const dirPath = req.query.path ? String(req.query.path) : undefined;
    const showHidden = req.query.hidden === 'true';
    const data = await listDirectory(dirPath, showHidden);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/files/preview', async (req, res) => {
  try {
    const filePath = String(req.query.path || '');
    const data = await readFilePreview(filePath);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/save', async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    const data = await saveTextFile(filePath, content);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/mkdir', async (req, res) => {
  try {
    const { path: folderPath } = req.body;
    const data = await createFolder(folderPath);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/rename', async (req, res) => {
  try {
    const { oldPath, newName } = req.body;
    const data = await renameEntry(oldPath, newName);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/trash', async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    const data = await moveToTrash(targetPath);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/files/reveal', async (req, res) => {
  try {
    const { path: targetPath } = req.body;
    const data = await revealInFinder(targetPath);
    res.json(data);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/files/search', async (req, res) => {
  try {
    const dirPath = String(req.query.path || '');
    const query = String(req.query.q || '');
    const results = await searchFilesInDir(dirPath, query);
    res.json({ results });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- WI-FI & NETWORK ROUTES ---
app.get('/api/network/overview', async (_req, res) => {
  try {
    const data = await getNetworkOverview();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/network/wifi-scan', async (_req, res) => {
  try {
    const result = await scanWifiNetworks();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/network/wifi-location-settings', async (_req, res) => {
  const result = await openMacLocationSettings();
  res.json(result);
});

app.post('/api/network/wifi-connect', async (req, res) => {
  const { ssid, password, iface } = req.body;
  const result = await connectToWifiNetwork(String(ssid || ''), password ? String(password) : undefined, iface || 'en0');
  res.json(result);
});

app.post('/api/network/wifi-toggle', async (req, res) => {
  const { enabled, iface } = req.body;
  const result = await toggleWifiPower(Boolean(enabled), iface || 'en0');
  res.json(result);
});

app.post('/api/network/ping', async (req, res) => {
  const { host, count } = req.body;
  const result = await runPingDiagnostic(host || '1.1.1.1', count || 3);
  res.json(result);
});

// --- GMAIL OAUTH2 & CONFIG ROUTES ---
app.get('/api/social/config', async (_req, res) => {
  const cfg = await loadConfig();
  res.json({
    hasGeminiKey: Boolean(cfg.geminiApiKey),
    gmailEmail: cfg.gmail?.email || '',
    gmailClientId: cfg.gmail?.clientId || '',
    hasGmailClientSecret: Boolean(cfg.gmail?.clientSecret),
    gmailRedirectUri: cfg.gmail?.redirectUri || 'http://localhost:4000/api/social/gmail/oauth/callback',
    hasGmailAppPassword: Boolean(cfg.gmail?.appPassword),
    hasGmailAccessToken: Boolean(cfg.gmail?.accessToken),
    hasGmailRefreshToken: Boolean(cfg.gmail?.refreshToken),
  });
});

app.post('/api/social/config', async (req, res) => {
  try {
    const updated = await saveConfig(req.body);
    res.json({
      ok: true,
      hasGeminiKey: Boolean(updated.geminiApiKey),
      gmailEmail: updated.gmail?.email || '',
      gmailClientId: updated.gmail?.clientId || '',
      hasGmailClientSecret: Boolean(updated.gmail?.clientSecret),
      gmailRedirectUri: updated.gmail?.redirectUri || 'http://localhost:4000/api/social/gmail/oauth/callback',
      hasGmailAppPassword: Boolean(updated.gmail?.appPassword),
      hasGmailAccessToken: Boolean(updated.gmail?.accessToken),
      hasGmailRefreshToken: Boolean(updated.gmail?.refreshToken),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.post('/api/social/gmail/reset', async (_req, res) => {
  try {
    const result = await resetGmailSession();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get('/api/social/gmail/oauth/url', async (_req, res) => {
  const result = await getGmailOAuthUrl();
  res.json(result);
});

app.get('/api/social/gmail/oauth/callback', async (req, res) => {
  const code = String(req.query.code || '');
  if (!code) {
    return res.status(400).send('Missing OAuth2 code parameter.');
  }
  const result = await handleGmailOAuthCallback(code);
  if (result.ok) {
    res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Gmail OAuth2 Connected</title>
          <style>
            body { font-family: -apple-system, sans-serif; background: #f8f9fa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: white; padding: 32px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: center; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
            .badge { display: inline-block; background: #ecfdf5; color: #059669; font-weight: 700; padding: 6px 12px; border-radius: 999px; font-size: 12px; margin-bottom: 12px; }
            h2 { margin: 0 0 8px; color: #0f172a; }
            p { color: #64748b; font-size: 14px; margin-bottom: 20px; }
            a { display: inline-block; background: #f26522; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">✓ OAUTH2 CONNECTED</div>
            <h2>Signed in as ${result.email}</h2>
            <p>Your Gmail account is now linked to SmartMac via Google OAuth 2.0. You can close this window or return to the dashboard.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GMAIL_OAUTH_SUCCESS', email: '${result.email}' }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
            <a href="http://localhost:5173">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `);
  } else {
    res.status(400).send(`OAuth2 Error: ${result.error}`);
  }
});

app.get('/api/social/gmail', async (_req, res) => {
  const data = await fetchGmailMessages(12);
  res.json(data);
});

app.get('/api/social/gmail/unread-3d', async (_req, res) => {
  const data = await fetchUnreadGmail3Days(15);
  res.json(data);
});

app.post('/api/social/gmail/send', async (req, res) => {
  const { to, subject, body } = req.body;
  const result = await sendGmailMessage(to, subject, body);
  res.json(result);
});

app.post('/api/social/open-web', async (req, res) => {
  const { target } = req.body;
  const result = await openExternalWebApp(target);
  res.json(result);
});

// --- ADVANCED VPS & SSH MANAGER ROUTES ---
app.get('/api/vps/servers', async (_req, res) => {
  const servers = await listVpsServers();
  const keys = await listLocalSshKeys();
  res.json({ servers, keys });
});

app.post('/api/vps/servers', async (req, res) => {
  try {
    const servers = await saveVpsServer(req.body);
    res.json({ ok: true, servers });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.delete('/api/vps/servers/:id', async (req, res) => {
  const servers = await deleteVpsServer(req.params.id);
  res.json({ ok: true, servers });
});

app.post('/api/vps/terminal', async (req, res) => {
  const result = await launchNativeSshTerminal(req.body);
  res.json(result);
});

app.post('/api/vps/exec', async (req, res) => {
  const { server, command } = req.body;
  const result = await executeRemoteVpsCommand(server, command);
  res.json(result);
});

// --- SCREEN CAPTURE, SCREEN RECORDER & AUDIO RECORDER ROUTES ---
app.get('/api/media/list', async (_req, res) => {
  try {
    const items = await listCapturedMedia();
    res.json({ dir: MEDIA_CAPTURES_DIR, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/media/screenshot-os', async (req, res) => {
  const { mode } = req.body;
  const result = await takeNativeOsScreenshot(mode === 'interactive' ? 'interactive' : 'fullscreen');
  res.json(result);
});

app.post('/api/media/save', async (req, res) => {
  try {
    const { filename, base64Data, type } = req.body;
    const result = await saveBase64MediaFile(filename, base64Data, type || 'screenshot');
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.delete('/api/media/file/:name', async (req, res) => {
  try {
    const result = await deleteMediaFile(req.params.name);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.get('/api/media/file/:name', (req, res) => {
  const safeBase = path.basename(req.params.name);
  const fullPath = path.join(MEDIA_CAPTURES_DIR, safeBase);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).end();
  }
  res.sendFile(fullPath);
});

// --- SECURITY CAMERAS (IMOU LIFE & TP-LINK TAPO RTSP) ROUTES ---
app.get('/api/cameras', async (_req, res) => {
  const cameras = await listCameras();
  // Mask passwords in API list response while keeping brand/host/username visible
  res.json({
    cameras: cameras.map((c) => ({
      ...c,
      password: c.password ? '••••••••' : '',
      hasPassword: Boolean(c.password),
    })),
  });
});

app.post('/api/cameras', async (req, res) => {
  try {
    const cameras = await saveCamera(req.body);
    res.json({ ok: true, cameras });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.delete('/api/cameras/:id', async (req, res) => {
  const cameras = await deleteCamera(req.params.id);
  res.json({ ok: true, cameras });
});

app.get('/api/cameras/discover', async (_req, res) => {
  try {
    const result = await discoverLanCameras();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cameras/:id/stream', (req, res) => {
  streamCameraMjpeg(req.params.id, req, res);
});

app.post('/api/cameras/:id/snapshot', async (req, res) => {
  const result = await captureCameraSnapshot(req.params.id);
  res.json(result);
});

// Zero-popup native macOS app window live embed (ImouLife HD & Tapo)
app.get('/api/cameras/native/:appKey/status', async (req, res) => {
  const key = req.params.appKey.toLowerCase();
  const query = key === 'imou' ? 'Imou' : 'Tapo';
  const result = await findNativeAppWindowId(query);
  res.json(result);
});

app.get('/api/cameras/native/:appKey/stream', (req, res) => {
  streamNativeAppWindowMjpeg(req.params.appKey, req, res);
});

app.get('/api/cameras/native/:appKey/frame', async (req, res) => {
  const result = await captureNativeAppWindowFrame(req.params.appKey);
  if (result.ok && result.buffer) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(result.buffer);
  }
  res.status(result.needsScreenPermission ? 403 : 404).json({
    error: result.error || 'Frame unavailable',
    needsScreenPermission: Boolean(result.needsScreenPermission),
  });
});

app.post('/api/cameras/screen-permission-settings', async (_req, res) => {
  const result = await openMacScreenRecordingSettings();
  res.json(result);
});

// --- AGENT NODE API ROUTES (called by Master Orchestrator on each VM) ---
app.get('/api/node/telemetry', nodeSecretAuthGuard, async (_req, res) => {
  try {
    const data = await getLocalNodeTelemetry();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/node/docker', nodeSecretAuthGuard, async (_req, res) => {
  const data = await listLocalDockerContainers();
  res.json(data);
});

app.post('/api/node/docker/action', nodeSecretAuthGuard, async (req, res) => {
  const { containerId, action } = req.body;
  const result = await runLocalDockerAction(String(containerId || ''), action);
  res.json(result);
});

app.post('/api/node/exec', nodeSecretAuthGuard, async (req, res) => {
  const { command } = req.body;
  const result = await execLocalNodeCommand(String(command || ''));
  res.json(result);
});

// --- MASTER CLUSTER ORCHESTRATOR ROUTES (manage N remote VMs from 1 web UI) ---
app.get('/api/cluster/nodes', async (_req, res) => {
  const nodes = await listClusterNodes();
  res.json({
    nodes: nodes.map((n) => ({
      ...n,
      secret: n.secret ? '••••••••' : '',
      hasSecret: Boolean(n.secret),
    })),
  });
});

app.post('/api/cluster/nodes', async (req, res) => {
  try {
    const nodes = await saveClusterNode(req.body);
    res.json({ ok: true, nodes });
  } catch (err: any) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

app.delete('/api/cluster/nodes/:id', async (req, res) => {
  const nodes = await deleteClusterNode(req.params.id);
  res.json({ ok: true, nodes });
});

app.get('/api/cluster/fleet', async (_req, res) => {
  try {
    const fleet = await pollAllClusterNodes();
    res.json({ fleet, checkedAt: Date.now() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cluster/nodes/:id/docker', async (req, res) => {
  const data =
    req.params.id === 'local'
      ? await listLocalDockerContainers()
      : await getRemoteNodeDocker(req.params.id);
  res.json(data);
});

app.post('/api/cluster/nodes/:id/docker/action', async (req, res) => {
  const { containerId, action } = req.body;
  const result =
    req.params.id === 'local'
      ? await runLocalDockerAction(String(containerId || ''), action)
      : await runRemoteNodeDockerAction(req.params.id, String(containerId || ''), action);
  res.json(result);
});

app.post('/api/cluster/broadcast', async (req, res) => {
  const { nodeIds, command } = req.body;
  const results = await broadcastCommandToNodes(Array.isArray(nodeIds) ? nodeIds : [], String(command || ''));
  res.json({ ok: true, results });
});

// --- AI AGENT CHAT ROUTE ---
app.post('/api/agent/chat', async (req, res) => {
  try {
    const { message, history, lang } = req.body;
    const result = await processAgentMessage(message || '', history || [], lang || 'vi');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SERVE BUNDLED PRODUCTION FRONTEND FOR SINGLE-COMMAND CLI ---
const distDir = path.resolve(__dirname, '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// --- HTTP & WEBSOCKET SERVER FOR REAL-TIME TELEMETRY ---
let currentPort = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set<WebSocket>();

wss.on('connection', async (ws, req) => {
  // Block external origin WebSocket hijacking
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
    ws.close(1008, 'Untrusted origin');
    return;
  }
  clients.add(ws);
  try {
    const initial = await getSystemSnapshot();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'snapshot', data: initial }));
    }
  } catch {
    // ignore
  }
  ws.on('close', () => {
    clients.delete(ws);
  });
});

setInterval(async () => {
  if (clients.size === 0) return;
  try {
    const snapshot = await getSystemSnapshot();
    const payload = JSON.stringify({ type: 'snapshot', data: snapshot });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  } catch {
    // ignore
  }
}, 2000);

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${currentPort} is already in use — switching to port ${currentPort + 1}...`);
    currentPort += 1;
    setTimeout(() => {
      server.listen(currentPort, HOST);
    }, 250);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(currentPort, HOST, () => {
  console.log(`SmartMac Agent Server listening securely on http://${HOST}:${currentPort} (Loopback Protected)`);
});
