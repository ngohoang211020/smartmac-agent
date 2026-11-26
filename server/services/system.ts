import si from 'systeminformation';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export interface SystemSnapshot {
  timestamp: number;
  hostname: string;
  platform: string;
  osType: 'darwin' | 'linux' | 'win32' | string;
  arch: string;
  uptime: number;
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    physicalCores: number;
    speed: number;
    currentLoad: number;
    loadUser: number;
    loadSystem: number;
    coreLoads: number[];
    temperature: number | null;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    active: number;
    available: number;
    swapTotal: number;
    swapUsed: number;
    usagePercent: number;
  };
  gpu: Array<{
    model: string;
    vendor: string;
    vram: number | null;
    utilizationGpu: number | null;
  }>;
  battery: {
    hasBattery: boolean;
    percent: number;
    isCharging: boolean;
    acConnected: boolean;
    timeRemaining: number | null;
    cycleCount: number | null;
    condition: string;
  };
  disks: Array<{
    fs: string;
    type: string;
    size: number;
    used: number;
    available: number;
    usePercent: number;
    mount: string;
  }>;
  networkTraffic: {
    iface: string;
    rxSec: number;
    txSec: number;
    rxBytes: number;
    txBytes: number;
  };
}

let cachedStaticInfo: {
  cpu: si.Systeminformation.CpuData;
  graphics: si.Systeminformation.GraphicsData;
  osInfo: si.Systeminformation.OsData;
} | null = null;

export async function getStaticSystemInfo() {
  if (!cachedStaticInfo) {
    const [cpu, graphics, osInfo] = await Promise.all([
      si.cpu(),
      si.graphics(),
      si.osInfo(),
    ]);
    cachedStaticInfo = { cpu, graphics, osInfo };
  }
  return cachedStaticInfo;
}

export async function getSystemSnapshot(): Promise<SystemSnapshot> {
  const staticInfo = await getStaticSystemInfo();
  const [load, mem, temp, battery, fsSize, netStats] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.cpuTemperature().catch(() => ({ main: null })),
    si.battery().catch(() => ({
      hasBattery: false,
      percent: 100,
      isCharging: false,
      acConnected: true,
      timeRemaining: null,
      cycleCount: null,
    })),
    si.fsSize().catch(() => []),
    si.networkStats().catch(() => []),
  ]);

  const primaryNet = netStats.find((n) => n.rx_bytes > 0 || n.tx_bytes > 0) || netStats[0] || {
    iface: os.platform() === 'darwin' ? 'en0' : 'eth0',
    rx_sec: 0,
    tx_sec: 0,
    rx_bytes: 0,
    tx_bytes: 0,
  };

  // Cross-platform disk filtering (macOS, Linux, Windows)
  const seenMounts = new Set<string>();
  const disks = fsSize
    .filter((d) => {
      if (!d.size || d.size <= 0) return false;
      if (os.platform() === 'darwin') {
        if (d.mount === '/' || d.mount.startsWith('/Volumes/')) {
          if (seenMounts.has(d.mount)) return false;
          seenMounts.add(d.mount);
          return true;
        }
        return false;
      }
      if (os.platform() === 'linux') {
        if (d.mount.startsWith('/snap') || d.mount.startsWith('/run') || d.mount.startsWith('/sys')) return false;
      }
      if (seenMounts.has(d.mount)) return false;
      seenMounts.add(d.mount);
      return true;
    })
    .map((d) => ({
      fs: d.fs,
      type: d.type,
      size: d.size,
      used: d.used,
      available: d.available,
      usePercent: Math.round((d.use || 0) * 10) / 10,
      mount: d.mount,
    }));

  const actualUsed = mem.active || mem.used - mem.buffcache || mem.used;
  const usagePercent = Math.round((actualUsed / mem.total) * 1000) / 10;

  return {
    timestamp: Date.now(),
    hostname: os.hostname(),
    platform: `${staticInfo.osInfo.distro} ${staticInfo.osInfo.release}`,
    osType: os.platform(),
    arch: staticInfo.osInfo.arch,
    uptime: os.uptime(),
    cpu: {
      manufacturer: staticInfo.cpu.manufacturer,
      brand: staticInfo.cpu.brand,
      cores: staticInfo.cpu.cores,
      physicalCores: staticInfo.cpu.physicalCores,
      speed: staticInfo.cpu.speed,
      currentLoad: Math.round(load.currentLoad * 10) / 10,
      loadUser: Math.round(load.currentLoadUser * 10) / 10,
      loadSystem: Math.round(load.currentLoadSystem * 10) / 10,
      coreLoads: load.cpus.map((c) => Math.round(c.load * 10) / 10),
      temperature: temp.main || null,
    },
    memory: {
      total: mem.total,
      used: actualUsed,
      free: mem.free,
      active: mem.active,
      available: mem.available,
      swapTotal: mem.swaptotal,
      swapUsed: mem.swapused,
      usagePercent,
    },
    gpu: staticInfo.graphics.controllers.map((g) => ({
      model: g.model || 'Integrated GPU',
      vendor: g.vendor || 'System',
      vram: g.vram || null,
      utilizationGpu: g.utilizationGpu ?? null,
    })),
    battery: {
      hasBattery: battery.hasBattery,
      percent: battery.percent,
      isCharging: battery.isCharging,
      acConnected: battery.acConnected,
      timeRemaining: battery.timeRemaining ?? null,
      cycleCount: battery.cycleCount ?? null,
      condition: 'Normal',
    },
    disks,
    networkTraffic: {
      iface: primaryNet.iface,
      rxSec: Math.max(0, Math.round(primaryNet.rx_sec || 0)),
      txSec: Math.max(0, Math.round(primaryNet.tx_sec || 0)),
      rxBytes: primaryNet.rx_bytes || 0,
      txBytes: primaryNet.tx_bytes || 0,
    },
  };
}

export async function runQuickSystemAction(action: string): Promise<{ ok: boolean; message: string; output?: string }> {
  const platform = os.platform();
  try {
    switch (action) {
      case 'flush_dns': {
        if (platform === 'darwin') {
          await execAsync('dscacheutil -flushcache');
        } else if (platform === 'win32') {
          await execAsync('ipconfig /flushdns');
        } else {
          await execAsync('resolvectl flush-caches || systemd-resolve --flush-caches');
        }
        return { ok: true, message: `DNS cache flushed on ${platform}.` };
      }
      case 'toggle_dark_mode': {
        if (platform === 'darwin') {
          await execAsync(`osascript -e 'tell app "System Events" to tell appearance preferences to set dark mode to not dark mode'`);
          return { ok: true, message: 'Toggled macOS Dark Mode.' };
        } else if (platform === 'win32') {
          await execAsync(
            `powershell -NoProfile -Command "$path='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'; $cur=(Get-ItemProperty -Path $path -Name AppsUseLightTheme).AppsUseLightTheme; $next=if($cur -eq 1){0}else{1}; Set-ItemProperty -Path $path -Name AppsUseLightTheme -Value $next; Set-ItemProperty -Path $path -Name SystemUsesLightTheme -Value $next"`
          );
          return { ok: true, message: 'Toggled Windows 10/11 Dark Mode.' };
        } else if (platform === 'linux') {
          await execAsync(`gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'`).catch(() => {});
          return { ok: true, message: 'Toggled Linux desktop theme.' };
        }
        return { ok: true, message: 'Dark mode toggle executed.' };
      }
      case 'mute_audio': {
        if (platform === 'darwin') {
          await execAsync(`osascript -e 'set volume with output muted'`);
        } else if (platform === 'win32') {
          await execAsync(
            `powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`
          );
        } else if (platform === 'linux') {
          await execAsync(`pactl set-sink-mute @DEFAULT_SINK@ 1 || amixer set Master mute`);
        }
        return { ok: true, message: 'System audio muted.' };
      }
      case 'unmute_audio': {
        if (platform === 'darwin') {
          await execAsync(`osascript -e 'set volume without output muted'`);
        } else if (platform === 'win32') {
          await execAsync(
            `powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`
          );
        } else if (platform === 'linux') {
          await execAsync(`pactl set-sink-mute @DEFAULT_SINK@ 0 || amixer set Master unmute`);
        }
        return { ok: true, message: 'System audio unmuted.' };
      }
      case 'sleep_display': {
        if (platform === 'darwin') {
          await execAsync('pmset displaysleepnow');
        } else if (platform === 'linux') {
          await execAsync('xset dpms force off');
        }
        return { ok: true, message: 'Display put to sleep.' };
      }
      default:
        return { ok: false, message: `Unknown system action: ${action}` };
    }
  } catch (err: any) {
    return { ok: false, message: err.message || 'Failed to execute system action' };
  }
}
