import si from 'systeminformation';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import dns from 'dns';
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
function isRedactedSsid(ssid) {
    if (!ssid)
        return true;
    const s = ssid.trim().toLowerCase();
    return s === '' || s === '<redacted>' || s === 'redacted';
}
function findSmartMacAppBinary() {
    if (os.platform() !== 'darwin')
        return null;
    const candidates = [
        process.env.SMARTMAC_APP_BIN || '',
        '/Applications/SmartMac.app/Contents/MacOS/SmartMac',
        `${os.homedir()}/Applications/SmartMac.app/Contents/MacOS/SmartMac`,
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
async function runCoreWlanHelper() {
    const bin = findSmartMacAppBinary();
    if (!bin)
        return null;
    try {
        const { stdout } = await execFileAsync(bin, ['--wifi-json'], { timeout: 10000 });
        return JSON.parse(stdout);
    }
    catch {
        return null;
    }
}
export async function getSavedWifiNetworks(iface = 'en0') {
    if (os.platform() !== 'darwin')
        return [];
    try {
        const { stdout } = await execFileAsync('networksetup', ['-listpreferredwirelessnetworks', iface], { timeout: 5000 });
        return stdout
            .split('\n')
            .slice(1)
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !isRedactedSsid(line));
    }
    catch {
        return [];
    }
}
export async function getPlatformWifiSSID(iface = 'en0') {
    const platform = os.platform();
    try {
        if (platform === 'darwin') {
            const { stdout: pwrOut } = await execAsync(`networksetup -getairportpower ${iface} 2>/dev/null || echo ""`);
            const enabled = !pwrOut.toLowerCase().includes('off');
            // 1. Try CoreWLAN via SmartMac.app first (returns real SSID if Location Services is enabled)
            const cw = await runCoreWlanHelper();
            if (cw?.current?.ssid && !isRedactedSsid(cw.current.ssid)) {
                return { ssid: cw.current.ssid, enabled, redacted: false };
            }
            // 2. Try networksetup
            const { stdout } = await execAsync(`networksetup -getairportnetwork ${iface} 2>/dev/null || echo ""`);
            const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/i);
            if (match && match[1] && !isRedactedSsid(match[1])) {
                return { ssid: match[1].trim(), enabled, redacted: false };
            }
            // 3. Fallback to ipconfig getsummary
            const { stdout: summary } = await execAsync(`ipconfig getsummary ${iface} 2>/dev/null || echo ""`);
            const ssidMatch = summary.match(/\bSSID\s*:\s*(.+)/);
            const rawSsid = ssidMatch ? ssidMatch[1].trim() : null;
            if (rawSsid && !isRedactedSsid(rawSsid)) {
                return { ssid: rawSsid, enabled, redacted: false };
            }
            return { ssid: null, enabled, redacted: enabled };
        }
        else if (platform === 'win32') {
            const { stdout } = await execAsync('netsh wlan show interfaces');
            const stateMatch = stdout.match(/State\s*:\s*(.+)/i);
            const ssidMatch = stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
            const connected = stateMatch ? stateMatch[1].toLowerCase().includes('connected') : true;
            return {
                ssid: ssidMatch ? ssidMatch[1].trim() : null,
                enabled: connected,
            };
        }
        else {
            const { stdout } = await execAsync('iwgetid -r 2>/dev/null || nmcli -t -f active,ssid dev wifi | grep "^yes" | cut -d: -f2');
            return {
                ssid: stdout.trim() || null,
                enabled: true,
            };
        }
    }
    catch {
        return { ssid: null, enabled: true };
    }
}
export async function getDnsServers() {
    try {
        const nodeDns = dns.getServers();
        if (nodeDns && nodeDns.length > 0) {
            return nodeDns.slice(0, 6);
        }
        if (os.platform() === 'darwin') {
            const { stdout } = await execAsync(`scutil --dns | grep 'nameserver\\[[0-9]*\\]' | awk '{print $3}' | head -n 6`);
            const list = stdout
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
            return Array.from(new Set(list));
        }
        return [];
    }
    catch {
        return [];
    }
}
export async function getNetworkOverview() {
    const [ifaces, wifiConnections, gateway, connections, platformWifi, dnsServers, savedWifiNetworks] = await Promise.all([
        si.networkInterfaces().catch(() => []),
        si.wifiConnections().catch(() => []),
        si.networkGatewayDefault().catch(() => ''),
        si.networkConnections().catch(() => []),
        getPlatformWifiSSID('en0'),
        getDnsServers(),
        getSavedWifiNetworks('en0'),
    ]);
    const ifaceList = Array.isArray(ifaces) ? ifaces : [ifaces];
    const primaryWifi = wifiConnections[0];
    const activeConnections = connections
        .filter((c) => c.state === 'ESTABLISHED' || c.state === 'LISTEN')
        .slice(0, 40)
        .map((c) => ({
        protocol: c.protocol,
        localAddress: c.localAddress,
        localPort: String(c.localPort),
        peerAddress: c.peerAddress,
        peerPort: String(c.peerPort),
        state: c.state,
        pid: c.pid,
        process: c.process || '',
    }));
    const rawPrimarySsid = primaryWifi?.ssid;
    const resolvedSsid = (!isRedactedSsid(platformWifi.ssid) ? platformWifi.ssid : null) ||
        (!isRedactedSsid(rawPrimarySsid) ? rawPrimarySsid : null) ||
        (platformWifi.enabled ? (savedWifiNetworks[0] ? `${savedWifiNetworks[0]} (Saved)` : 'Connected (SSID hidden by macOS)') : null);
    const redacted = os.platform() === 'darwin' &&
        platformWifi.enabled &&
        isRedactedSsid(platformWifi.ssid) &&
        isRedactedSsid(rawPrimarySsid);
    return {
        wifi: {
            enabled: platformWifi.enabled,
            ssid: resolvedSsid,
            bssid: !isRedactedSsid(primaryWifi?.bssid) ? primaryWifi?.bssid || null : null,
            channel: primaryWifi?.channel || null,
            frequency: primaryWifi?.frequency || null,
            signalLevel: primaryWifi?.signalLevel || null,
            quality: primaryWifi?.quality || null,
            security: primaryWifi?.security ? String(primaryWifi.security) : 'WPA2/WPA3',
            txRate: primaryWifi?.txRate || null,
            interfaceName: primaryWifi?.iface || (os.platform() === 'win32' ? 'Wi-Fi' : 'en0'),
            redacted,
        },
        savedWifiNetworks,
        interfaces: ifaceList
            .filter((i) => i.ip4 || i.ip6 || !i.internal)
            .map((i) => ({
            iface: i.iface,
            ifaceName: i.ifaceName,
            ip4: i.ip4,
            ip6: i.ip6,
            mac: i.mac,
            internal: i.internal,
            operstate: i.operstate,
            type: i.type,
            speed: i.speed,
        })),
        defaultGateway: gateway || null,
        dnsServers,
        publicIp: null,
        activeConnections,
    };
}
export async function scanWifiNetworks() {
    const savedNetworks = await getSavedWifiNetworks('en0');
    // 1. On macOS, prefer CoreWLAN via SmartMac.app (returns real SSIDs when Location Services is enabled)
    if (os.platform() === 'darwin') {
        const cw = await runCoreWlanHelper();
        if (cw && cw.networks.length > 0 && cw.networks.some((n) => !isRedactedSsid(n.ssid))) {
            return {
                networks: cw.networks,
                savedNetworks,
                redactedByMacOS: false,
                locationAuthorized: cw.locationAuthorized,
            };
        }
    }
    // 2. Fallback to systeminformation.wifiNetworks()
    try {
        const nets = await si.wifiNetworks();
        const mapped = nets
            .filter((n) => n.ssid)
            .map((n, idx) => {
            const isRed = isRedactedSsid(n.ssid);
            return {
                ssid: isRed ? `Wi-Fi Signal #${idx + 1} (Ch ${n.channel || '?'})` : n.ssid,
                bssid: n.bssid || '',
                channel: n.channel,
                signalLevel: n.signalLevel,
                quality: n.quality,
                security: Array.isArray(n.security) ? n.security.join(', ') : String(n.security || 'WPA2/WPA3'),
                isRedacted: isRed,
            };
        })
            .sort((a, b) => (b.signalLevel || -100) - (a.signalLevel || -100));
        const allRedacted = mapped.length > 0 && mapped.every((n) => n.isRedacted);
        return {
            networks: mapped,
            savedNetworks,
            redactedByMacOS: os.platform() === 'darwin' && (allRedacted || mapped.length === 0),
            locationAuthorized: !allRedacted,
        };
    }
    catch {
        return {
            networks: [],
            savedNetworks,
            redactedByMacOS: os.platform() === 'darwin',
            locationAuthorized: false,
        };
    }
}
export async function openMacLocationSettings() {
    if (os.platform() !== 'darwin') {
        return { ok: false, message: 'Only applicable on macOS' };
    }
    try {
        await execFileAsync('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices']);
        return { ok: true, message: 'Opened macOS Location Services Settings. Enable SmartMac to reveal Wi-Fi names.' };
    }
    catch (err) {
        return { ok: false, message: err.message };
    }
}
export async function connectToWifiNetwork(ssid, password, iface = 'en0') {
    const safeSsid = (ssid || '').trim();
    if (!safeSsid)
        return { ok: false, message: 'SSID is required' };
    try {
        if (os.platform() === 'darwin') {
            const args = ['-setairportnetwork', iface, safeSsid];
            if (password)
                args.push(password);
            await execFileAsync('networksetup', args, { timeout: 15000 });
            return { ok: true, message: `Connected to Wi-Fi "${safeSsid}"` };
        }
        else if (os.platform() === 'win32') {
            await execFileAsync('netsh', ['wlan', 'connect', `name=${safeSsid}`], { timeout: 15000 });
            return { ok: true, message: `Connecting to Wi-Fi "${safeSsid}"` };
        }
        else {
            const args = ['dev', 'wifi', 'connect', safeSsid];
            if (password)
                args.push('password', password);
            await execFileAsync('nmcli', args, { timeout: 15000 });
            return { ok: true, message: `Connected to Wi-Fi "${safeSsid}"` };
        }
    }
    catch (err) {
        return { ok: false, message: `Failed to connect to "${safeSsid}": ${err.stderr || err.message}` };
    }
}
export async function toggleWifiPower(turnOn, iface = 'en0') {
    const platform = os.platform();
    try {
        if (platform === 'darwin') {
            const state = turnOn ? 'on' : 'off';
            await execAsync(`networksetup -setairportpower ${iface} ${state}`);
            return { ok: true, message: `Wi-Fi (${iface}) turned ${state}` };
        }
        else if (platform === 'win32') {
            const state = turnOn ? 'enabled' : 'disabled';
            await execAsync(`netsh interface set interface "Wi-Fi" ${state}`);
            return { ok: true, message: `Windows Wi-Fi adapter ${state}` };
        }
        else {
            const state = turnOn ? 'on' : 'off';
            await execAsync(`nmcli radio wifi ${state}`);
            return { ok: true, message: `Linux Wi-Fi radio turned ${state}` };
        }
    }
    catch (err) {
        return { ok: false, message: `Failed to toggle Wi-Fi: ${err.message}` };
    }
}
export async function runPingDiagnostic(host = '1.1.1.1', count = 3) {
    const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, '');
    const safeCount = Math.min(Math.max(1, Number(count) || 3), 5);
    const isWin = os.platform() === 'win32';
    const cmd = isWin
        ? `ping -n ${safeCount} -w 2000 ${safeHost}`
        : `ping -c ${safeCount} -W 2000 ${safeHost}`;
    try {
        const { stdout } = await execAsync(cmd);
        const unixMatch = stdout.match(/min\/avg\/max\/(?:stddev|mdev)\s*=\s*[\d.]+\/([\d.]+)\//);
        const winMatch = stdout.match(/Average\s*=\s*(\d+)ms/i);
        const avg = unixMatch ? parseFloat(unixMatch[1]) : winMatch ? parseFloat(winMatch[1]) : null;
        return {
            ok: true,
            host: safeHost,
            output: stdout,
            avgLatencyMs: avg,
        };
    }
    catch (err) {
        return {
            ok: false,
            host: safeHost,
            output: err.stdout || err.message || 'Ping failed',
            avgLatencyMs: null,
        };
    }
}
