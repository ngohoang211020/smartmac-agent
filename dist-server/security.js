import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
const SECURITY_CONFIG_PATH = path.join(process.cwd(), '.local-security.json');
const activeSessions = new Set();
function loadSecurityStateSync() {
    try {
        if (fsSync.existsSync(SECURITY_CONFIG_PATH)) {
            const raw = fsSync.readFileSync(SECURITY_CONFIG_PATH, 'utf-8');
            return JSON.parse(raw);
        }
    }
    catch {
        // ignore
    }
    return { pinHash: null, salt: crypto.randomBytes(16).toString('hex') };
}
let secState = loadSecurityStateSync();
export async function saveSecurityPin(newPin) {
    const salt = secState.salt || crypto.randomBytes(16).toString('hex');
    if (!newPin || !newPin.trim()) {
        secState = { pinHash: null, salt };
        activeSessions.clear();
        await fs.writeFile(SECURITY_CONFIG_PATH, JSON.stringify(secState, null, 2), { mode: 0o600 });
        return { ok: true, pinEnabled: false };
    }
    const pinHash = crypto.createHash('sha256').update(`${salt}:${newPin.trim()}`).digest('hex');
    secState = { pinHash, salt };
    await fs.writeFile(SECURITY_CONFIG_PATH, JSON.stringify(secState, null, 2), { mode: 0o600 });
    const sessionToken = crypto.randomBytes(32).toString('hex');
    activeSessions.add(sessionToken);
    return { ok: true, pinEnabled: true, token: sessionToken };
}
export function verifySecurityPin(pin) {
    if (!secState.pinHash) {
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.add(token);
        return { ok: true, token };
    }
    const candidate = crypto.createHash('sha256').update(`${secState.salt}:${(pin || '').trim()}`).digest('hex');
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(secState.pinHash))) {
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.add(token);
        return { ok: true, token };
    }
    return { ok: false };
}
export function getSecurityStatus(clientToken) {
    const pinEnabled = Boolean(secState.pinHash);
    const authenticated = !pinEnabled || (Boolean(clientToken) && activeSessions.has(clientToken));
    return {
        pinEnabled,
        authenticated,
        bindHost: process.env.HOST || '127.0.0.1',
    };
}
/**
 * 1. Anti-CSRF & Anti-DNS-Rebinding Middleware:
 * Blocks any browser request coming from an external website Origin (e.g. evil.com trying to call localhost:4000)
 */
export function strictLocalOriginGuard(req, res, next) {
    const origin = req.headers.origin;
    const host = req.headers.host || '';
    // Allow authenticated remote Master -> Agent VM calls when SMARTMAC_NODE_SECRET is set
    const hasNodeSecret = Boolean(process.env.SMARTMAC_NODE_SECRET && req.headers['x-node-secret']);
    // Verify Host header is localhost or 127.0.0.1 (unless running in Docker/Server HOST=0.0.0.0 or authenticated node call)
    const isLocalHostHeader = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
    if (!isLocalHostHeader && process.env.HOST !== '0.0.0.0' && !hasNodeSecret) {
        return res.status(403).json({ error: 'Blocked by DNS Rebinding Protection (Host must be localhost/127.0.0.1)' });
    }
    // If Origin header is present, it MUST be from localhost or 127.0.0.1 (unless HOST=0.0.0.0 explicitly configured)
    if (origin && process.env.HOST !== '0.0.0.0') {
        const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin);
        if (!isLocalOrigin) {
            return res.status(403).json({ error: `Blocked cross-origin request from untrusted origin: ${origin}` });
        }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
}
export function adminPinAuthGuard(req, res, next) {
    // Allow Master -> Agent VM calls authenticated via x-node-secret
    if (process.env.SMARTMAC_NODE_SECRET && req.headers['x-node-secret']) {
        const a = Buffer.from(String(req.headers['x-node-secret']));
        const b = Buffer.from(process.env.SMARTMAC_NODE_SECRET);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            return next();
        }
        return res.status(401).json({ error: 'Invalid x-node-secret token' });
    }
    if (!secState.pinHash)
        return next();
    if (req.path.startsWith('/api/security/') ||
        req.path.startsWith('/api/social/gmail/oauth/callback') ||
        req.path.startsWith('/api/node/')) {
        return next();
    }
    const token = String(req.headers['x-smartmac-token'] || req.query.token || '');
    if (!token || !activeSessions.has(token)) {
        return res.status(401).json({ error: 'LOCKED: Admin PIN authentication required', locked: true });
    }
    next();
}
