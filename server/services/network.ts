import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import dns from 'dns';

const execAsync = promisify(exec);

export interface NetworkOverview {
  wifi: {
    enabled: boolean;
    ssid: string | null;
    bssid: string | null;
    channel: number | null;
    frequency: number | null;
    signalLevel: number | null;
    quality: number | null;
    security: string | null;
    txRate: number | null;
    interfaceName: string;
  };
  interfaces: Array<{
    iface: string;
    ifaceName: string;
    ip4: string;
    ip6: string;
    mac: string;
    internal: boolean;
    operstate: string;
    type: string;
    speed: number | null;
  }>;
  defaultGateway: string | null;
  dnsServers: string[];
  publicIp: string | null;
  activeConnections: Array<{
    protocol: string;
    localAddress: string;
    localPort: string;
    peerAddress: string;
    peerPort: string;
    state: string;
    pid: number;
    process: string;
  }>;
}

export async function getPlatformWifiSSID(iface = 'en0'): Promise<{ ssid: string | null; enabled: boolean }> {
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      const { stdout: pwrOut } = await execAsync(`networksetup -getairportpower ${iface} 2>/dev/null || echo ""`);
      const enabled = !pwrOut.toLowerCase().includes('off');

      const { stdout } = await execAsync(`networksetup -getairportnetwork ${iface} 2>/dev/null || echo ""`);
      const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/i);
      if (match && match[1]) {
        return { ssid: match[1].trim(), enabled };
      }

      const { stdout: summary } = await execAsync(`ipconfig getsummary ${iface} 2>/dev/null || echo ""`);
      const ssidMatch = summary.match(/\bSSID\s*:\s*(.+)/);
      return {
        ssid: ssidMatch ? ssidMatch[1].trim() : null,
        enabled,
      };
    } else if (platform === 'win32') {
      const { stdout } = await execAsync('netsh wlan show interfaces');
      const stateMatch = stdout.match(/State\s*:\s*(.+)/i);
      const ssidMatch = stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
      const connected = stateMatch ? stateMatch[1].toLowerCase().includes('connected') : true;
      return {
        ssid: ssidMatch ? ssidMatch[1].trim() : null,
        enabled: connected,
      };
    } else {
      const { stdout } = await execAsync('iwgetid -r 2>/dev/null || nmcli -t -f active,ssid dev wifi | grep "^yes" | cut -d: -f2');
      return {
        ssid: stdout.trim() || null,
        enabled: true,
      };
    }
  } catch {
    return { ssid: null, enabled: true };
  }
}

export async function getDnsServers(): Promise<string[]> {
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
  } catch {
    return [];
  }
}

export async function getNetworkOverview(): Promise<NetworkOverview> {
  const [ifaces, wifiConnections, gateway, connections, platformWifi, dnsServers] = await Promise.all([
    si.networkInterfaces().catch(() => []),
    si.wifiConnections().catch(() => []),
    si.networkGatewayDefault().catch(() => ''),
    si.networkConnections().catch(() => []),
    getPlatformWifiSSID('en0'),
    getDnsServers(),
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

  return {
    wifi: {
      enabled: platformWifi.enabled,
      ssid: primaryWifi?.ssid || platformWifi.ssid || (platformWifi.enabled ? 'Connected (Wi-Fi)' : null),
      bssid: primaryWifi?.bssid || null,
      channel: primaryWifi?.channel || null,
      frequency: primaryWifi?.frequency || null,
      signalLevel: primaryWifi?.signalLevel || null,
      quality: primaryWifi?.quality || null,
      security: primaryWifi?.security ? String(primaryWifi.security) : 'WPA2/WPA3',
      txRate: primaryWifi?.txRate || null,
      interfaceName: primaryWifi?.iface || (os.platform() === 'win32' ? 'Wi-Fi' : 'en0'),
    },
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

export async function scanWifiNetworks(): Promise<
  Array<{
    ssid: string;
    bssid: string;
    channel: number;
    signalLevel: number;
    quality: number;
    security: string;
  }>
> {
  try {
    const nets = await si.wifiNetworks();
    return nets
      .filter((n) => n.ssid)
      .map((n) => ({
        ssid: n.ssid,
        bssid: n.bssid,
        channel: n.channel,
        signalLevel: n.signalLevel,
        quality: n.quality,
        security: Array.isArray(n.security) ? n.security.join(', ') : String(n.security || 'Open'),
      }));
  } catch {
    return [];
  }
}

export async function toggleWifiPower(turnOn: boolean, iface = 'en0'): Promise<{ ok: boolean; message: string }> {
  const platform = os.platform();
  try {
    if (platform === 'darwin') {
      const state = turnOn ? 'on' : 'off';
      await execAsync(`networksetup -setairportpower ${iface} ${state}`);
      return { ok: true, message: `Wi-Fi (${iface}) turned ${state}` };
    } else if (platform === 'win32') {
      const state = turnOn ? 'enabled' : 'disabled';
      await execAsync(`netsh interface set interface "Wi-Fi" ${state}`);
      return { ok: true, message: `Windows Wi-Fi adapter ${state}` };
    } else {
      const state = turnOn ? 'on' : 'off';
      await execAsync(`nmcli radio wifi ${state}`);
      return { ok: true, message: `Linux Wi-Fi radio turned ${state}` };
    }
  } catch (err: any) {
    return { ok: false, message: `Failed to toggle Wi-Fi: ${err.message}` };
  }
}

export async function runPingDiagnostic(host = '1.1.1.1', count = 3): Promise<{
  ok: boolean;
  host: string;
  output: string;
  avgLatencyMs: number | null;
}> {
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
  } catch (err: any) {
    return {
      ok: false,
      host: safeHost,
      output: err.stdout || err.message || 'Ping failed',
      avgLatencyMs: null,
    };
  }
}
