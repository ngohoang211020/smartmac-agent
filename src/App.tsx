import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  HardDrive,
  Wifi,
  FolderOpen,
  AppWindow,
  Mail,
  MessageSquare,
  Activity,
  RefreshCw,
  Play,
  Square,
  Trash2,
  FolderPlus,
  ExternalLink,
  Search,
  Send,
  Terminal,
  Moon,
  Sun,
  VolumeX,
  Volume2,
  ArrowUp,
  Save,
  Settings,
  Globe,
  Bot,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Home,
  ChevronDown,
  ChevronUp,
  Calendar,
  Bell,
  LayoutGrid,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Laptop,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Camera,
  Video,
  Mic,
  Download,
} from 'lucide-react';
import { Lang, translations } from './i18n';

interface SystemSnapshot {
  timestamp: number;
  hostname: string;
  platform: string;
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

type ActiveTab = 'overview' | 'apps' | 'files' | 'network' | 'social' | 'vps' | 'media';

function openGmailMessageDirect(messageId: string) {
  if (!messageId || messageId.startsWith('demo-') || messageId.startsWith('cli-')) {
    window.open('https://mail.google.com/mail/u/0/#inbox', '_blank', 'noopener,noreferrer');
    return;
  }
  window.open(`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(messageId)}`, '_blank', 'noopener,noreferrer');
}

function parseSenderInfo(rawFrom: string): { name: string; email: string; initial: string } {
  const cleaned = (rawFrom || 'Unknown').replace(/"/g, '').trim();
  const match = cleaned.match(/^(.*?)\s*<([^>]+)>$/);
  const name = match && match[1].trim() ? match[1].trim() : cleaned.split('@')[0];
  const email = match ? match[2].trim() : cleaned;
  const initial = (name[0] || 'M').toUpperCase();
  return { name, email, initial };
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('smartmac_lang');
    return saved === 'vi' || saved === 'en' ? saved : 'vi';
  });
  const t = translations[lang];

  const handleSetLang = (next: Lang) => {
    setLang(next);
    localStorage.setItem('smartmac_lang', next);
  };

  const [appTheme, setAppTheme] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('smartmac_theme') === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (appTheme === 'dark') {
      root.classList.add('app-dark');
    } else {
      root.classList.remove('app-dark');
    }
    localStorage.setItem('smartmac_theme', appTheme);
  }, [appTheme]);

  const toggleAppTheme = () => {
    setAppTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [openMenuGroups, setOpenMenuGroups] = useState<{
    monitor: boolean;
    workspace: boolean;
    cloud: boolean;
    quickActions: boolean;
  }>({
    monitor: true,
    workspace: true,
    cloud: true,
    quickActions: false,
  });

  const toggleMenuGroup = (key: keyof typeof openMenuGroups) => {
    setOpenMenuGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<Array<{ time: string; cpu: number; ram: number; rx: number; tx: number }>>([]);
  const [toast, setToast] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [agentOpen, setAgentOpen] = useState<boolean>(false);
  const [bannerVisible, setBannerVisible] = useState<boolean>(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [installModalOpen, setInstallModalOpen] = useState(false);

  // Security & Admin PIN Protection State
  const [secModalOpen, setSecModalOpen] = useState(false);
  const [secStatus, setSecStatus] = useState<{ pinEnabled: boolean; authenticated: boolean; bindHost: string }>({
    pinEnabled: false,
    authenticated: true,
    bindHost: '127.0.0.1',
  });
  const [unlockPinInput, setUnlockPinInput] = useState('');
  const [unlockErr, setUnlockErr] = useState('');

  const checkSecurityStatus = async () => {
    try {
      const res = await fetch('/api/security/status');
      const data = await res.json();
      setSecStatus({
        pinEnabled: Boolean(data.pinEnabled),
        authenticated: Boolean(data.authenticated),
        bindHost: data.bindHost || '127.0.0.1',
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkSecurityStatus();
  }, []);

  const handleUnlockWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockErr('');
    const res = await fetch('/api/security/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: unlockPinInput }),
    });
    const data = await res.json();
    if (data.ok && data.token) {
      localStorage.setItem('smartmac_sec_token', data.token);
      setUnlockPinInput('');
      await checkSecurityStatus();
      window.location.reload();
    } else {
      setUnlockErr(lang === 'vi' ? 'Mã PIN không chính xác' : 'Incorrect Admin PIN');
    }
  };

  // Bell Icon: 3-Day Unread Gmail Notification State
  const [bellOpen, setBellOpen] = useState(false);
  const [bellSyncing, setBellSyncing] = useState(false);
  const [unread3d, setUnread3d] = useState<{
    connected: boolean;
    email: string;
    unreadCount: number;
    messages: Array<{ id: string; from: string; subject: string; snippet: string; date: string; unread: boolean }>;
    syncedAt?: number;
  }>({
    connected: false,
    email: '',
    unreadCount: 0,
    messages: [],
  });

  const syncUnreadGmail3Days = async (showFeedback = false) => {
    setBellSyncing(true);
    try {
      const res = await fetch('/api/social/gmail/unread-3d');
      const data = await res.json();
      setUnread3d({
        connected: Boolean(data.connected),
        email: data.email || '',
        unreadCount: Number(data.unreadCount) || 0,
        messages: data.messages || [],
        syncedAt: data.syncedAt || Date.now(),
      });
      if (showFeedback) {
        if (data.connected) {
          showToast(
            lang === 'vi'
              ? `Đã đồng bộ: ${data.unreadCount || 0} email chưa đọc trong 3 ngày qua`
              : `Synced: ${data.unreadCount || 0} unread emails in the last 3 days`
          );
        } else {
          showToast(
            lang === 'vi'
              ? 'Vui lòng đăng nhập Gmail OAuth2 để đồng bộ email chưa đọc'
              : 'Please sign in to Gmail OAuth2 to sync unread emails',
            'err'
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setBellSyncing(false);
    }
  };

  useEffect(() => {
    syncUnreadGmail3Days(false);
    const interval = setInterval(() => syncUnreadGmail3Days(false), 60000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const handleSnapshot = (snap: SystemSnapshot) => {
      setSnapshot(snap);
      setHistory((prev) => [
        ...prev.slice(-29),
        {
          time: new Date(snap.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
          cpu: snap.cpu.currentLoad,
          ram: snap.memory.usagePercent,
          rx: snap.networkTraffic.rxSec,
          tx: snap.networkTraffic.txSec,
        },
      ]);
    };

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') handleSnapshot(msg.data);
        } catch {
          // ignore
        }
      };
    } catch {
      // fallback
    }

    fetch('/api/system/snapshot')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.cpu) handleSnapshot(d);
      })
      .catch(() => {});

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-800 flex">
      {/* LEFT SIDEBAR — SmartHR Light Style */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div>
          {/* Brand Logo */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.svg"
                alt="SmartMac Logo"
                className="w-8 h-8 rounded-lg shrink-0 shadow-xs"
              />
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Smart<span className="text-[#F26522]">Mac</span>
              </span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-[#F26522] border border-orange-200">
              OSS
            </span>
          </div>

          <div className="p-3.5 space-y-4">
            {/* SECTION 1: CORE NAVIGATION DROPDOWNS */}
            <div>
              <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t.mainMenu}
              </div>

              <div className="space-y-1.5">
                {/* Group 1: System & Hardware Monitor */}
                <div>
                  <button
                    onClick={() => toggleMenuGroup('monitor')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      activeTab === 'overview' || activeTab === 'apps'
                        ? 'bg-orange-50/80 text-[#F26522]'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Cpu className="w-4 h-4 shrink-0" />
                      <span>{lang === 'vi' ? 'Hệ thống & Phần cứng' : 'System & Hardware'}</span>
                    </div>
                    {openMenuGroups.monitor ? (
                      <ChevronUp className="w-3.5 h-3.5 opacity-70" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>

                  {openMenuGroups.monitor && (
                    <div className="ml-4 pl-2.5 mt-1 border-l border-slate-200 space-y-0.5">
                      <SubMenuItem
                        active={activeTab === 'overview'}
                        onClick={() => setActiveTab('overview')}
                        label={t.systemDashboard}
                        badge={snapshot ? `${snapshot.cpu.currentLoad}%` : undefined}
                      />
                      <SubMenuItem
                        active={activeTab === 'apps'}
                        onClick={() => setActiveTab('apps')}
                        label={t.appsProcesses}
                      />
                      <SubMenuItem
                        active={activeTab === 'media'}
                        onClick={() => setActiveTab('media')}
                        label={t.mediaStudio}
                        badge="REC"
                      />
                    </div>
                  )}
                </div>

                {/* Group 2: Storage & Network */}
                <div>
                  <button
                    onClick={() => toggleMenuGroup('workspace')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      activeTab === 'files' || activeTab === 'network'
                        ? 'bg-orange-50/80 text-[#F26522]'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <FolderOpen className="w-4 h-4 shrink-0" />
                      <span>{lang === 'vi' ? 'Tệp tin & Kết nối Mạng' : 'Files & Network'}</span>
                    </div>
                    {openMenuGroups.workspace ? (
                      <ChevronUp className="w-3.5 h-3.5 opacity-70" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>

                  {openMenuGroups.workspace && (
                    <div className="ml-4 pl-2.5 mt-1 border-l border-slate-200 space-y-0.5">
                      <SubMenuItem
                        active={activeTab === 'files'}
                        onClick={() => setActiveTab('files')}
                        label={t.filesFolders}
                      />
                      <SubMenuItem
                        active={activeTab === 'network'}
                        onClick={() => setActiveTab('network')}
                        label={t.wifiNetwork}
                      />
                    </div>
                  )}
                </div>

                {/* Group 3: Cloud, Gmail & Remote VPS */}
                <div>
                  <button
                    onClick={() => toggleMenuGroup('cloud')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      activeTab === 'social' || activeTab === 'vps'
                        ? 'bg-orange-50/80 text-[#F26522]'
                        : 'text-slate-700 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Globe className="w-4 h-4 shrink-0" />
                      <span>{lang === 'vi' ? 'Cloud, Gmail & VPS' : 'Cloud, Gmail & VPS'}</span>
                    </div>
                    {openMenuGroups.cloud ? (
                      <ChevronUp className="w-3.5 h-3.5 opacity-70" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>

                  {openMenuGroups.cloud && (
                    <div className="ml-4 pl-2.5 mt-1 border-l border-slate-200 space-y-0.5">
                      <SubMenuItem
                        active={activeTab === 'social'}
                        onClick={() => setActiveTab('social')}
                        label={t.gmailFacebook}
                        badge={unread3d.unreadCount > 0 ? String(unread3d.unreadCount) : 'OAuth2'}
                      />
                      <SubMenuItem
                        active={activeTab === 'vps'}
                        onClick={() => setActiveTab('vps')}
                        label={t.vpsManager}
                        badge="PRO"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2: AI ASSISTANT & SYSTEM UTILITIES */}
            <div className="pt-2 border-t border-slate-100">
              <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {lang === 'vi' ? 'TRỢ LÝ AI & TIỆN ÍCH' : 'AI & SYSTEM UTILITIES'}
              </div>

              <div className="space-y-1.5">
                {/* AI Super Agent Drawer Toggle */}
                <button
                  onClick={() => setAgentOpen(!agentOpen)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    agentOpen
                      ? 'bg-[#F26522] text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Bot className={`w-4 h-4 shrink-0 ${agentOpen ? 'text-white' : 'text-[#F26522]'}`} />
                    <span>{t.aiSuperAgent}</span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                      agentOpen ? 'bg-white/20 text-white' : 'bg-orange-50 text-[#F26522]'
                    }`}
                  >
                    {t.chat}
                  </span>
                </button>

                {/* Collapsible Quick System Utilities Dropdown */}
                <div>
                  <button
                    onClick={() => toggleMenuGroup('quickActions')}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100/80 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <Settings className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>{t.quickMacControls}</span>
                    </div>
                    {openMenuGroups.quickActions ? (
                      <ChevronUp className="w-3.5 h-3.5 opacity-70" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    )}
                  </button>

                  {openMenuGroups.quickActions && (
                    <div className="ml-4 pl-2.5 mt-1 border-l border-slate-200 space-y-0.5">
                      <SidebarSystemTrigger
                        icon={<RefreshCw className="w-3.5 h-3.5 text-slate-500" />}
                        label={t.flushDns}
                        action="flush_dns"
                        onResult={showToast}
                      />
                      <SidebarSystemTrigger
                        icon={<VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                        label={t.muteAudio}
                        action="mute_audio"
                        onResult={showToast}
                      />
                      <SidebarSystemTrigger
                        icon={<Volume2 className="w-3.5 h-3.5 text-slate-500" />}
                        label={t.unmuteAudio}
                        action="unmute_audio"
                        onResult={showToast}
                      />
                      <SidebarActionItem
                        icon={
                          appTheme === 'dark' ? (
                            <Sun className="w-3.5 h-3.5 text-amber-400" />
                          ) : (
                            <Moon className="w-3.5 h-3.5 text-slate-500" />
                          )
                        }
                        label={
                          lang === 'vi'
                            ? appTheme === 'dark'
                              ? 'Giao diện App: Sáng'
                              : 'Giao diện App: Tối'
                            : appTheme === 'dark'
                            ? 'App Theme: Light'
                            : 'App Theme: Dark'
                        }
                        onClick={toggleAppTheme}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">{t.telemetryStatus}</span>
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t.online}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {snapshot ? `${snapshot.hostname} • ${snapshot.arch}` : t.connecting}
          </div>
        </div>
      </aside>

      {/* MAIN COLUMN */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER BAR — SmartHR Light Style + ENG/VN Language Switcher */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalSearch.trim()) {
                    setAgentOpen(true);
                  }
                }}
                placeholder={t.searchPlaceholder}
                className="w-full pl-9 pr-16 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#F26522] focus:bg-white transition"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-500">
                CTRL + /
              </span>
            </div>
            <button
              onClick={() => setActiveTab('apps')}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition"
              title={t.applications}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setInstallModalOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              title="1-Command Open Source CLI"
            >
              <Terminal className="w-3.5 h-3.5 text-[#F26522]" />
              <span>npx smartmac-agent</span>
            </button>
          </div>

          {/* Right Header Icons, ENG/VI Switcher & Avatar */}
          <div className="flex items-center gap-2.5">
            {snapshot && (
              <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs mr-1">
                <span className="text-slate-500">
                  CPU: <strong className="text-slate-800">{snapshot.cpu.currentLoad}%</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">
                  RAM: <strong className="text-slate-800">{snapshot.memory.usagePercent}%</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-500">
                  Net: <strong className="text-emerald-600">↓ {formatBytes(snapshot.networkTraffic.rxSec)}/s</strong>
                </span>
              </div>
            )}

            {/* ENG / VIETNAMESE Language Switcher Pill */}
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold">
              <button
                onClick={() => handleSetLang('en')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  lang === 'en'
                    ? 'bg-white text-[#F26522] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🇺🇸</span>
                <span>ENG</span>
              </button>
              <button
                onClick={() => handleSetLang('vi')}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer ${
                  lang === 'vi'
                    ? 'bg-white text-[#F26522] shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>🇻🇳</span>
                <span>VIE</span>
              </button>
            </div>

            {/* Security Shield / Admin PIN Lock Icon */}
            <button
              onClick={() => setSecModalOpen(true)}
              className={`p-2 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                secStatus.pinEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
              title={
                lang === 'vi'
                  ? 'Bảo mật & Khóa mã PIN Quản trị (127.0.0.1 Protected)'
                  : 'Security & Admin PIN Lock (127.0.0.1 Protected)'
              }
            >
              <ShieldCheck className="w-4 h-4" />
            </button>

            {/* App-Only Light / Dark Background Toggle Icon */}
            <button
              onClick={toggleAppTheme}
              className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 transition cursor-pointer flex items-center gap-1.5"
              title={
                appTheme === 'dark'
                  ? 'Switch App Background to White (Light Mode)'
                  : 'Switch App Background to Dark (Dark Mode)'
              }
            >
              {appTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('social')}
              className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              title="Gmail OAuth2"
            >
              <Mail className="w-4 h-4" />
              {unread3d.connected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 absolute top-1.5 right-1.5" />
              )}
            </button>

            {/* Bell Icon with 3-Day Unread Gmail Popover */}
            <div className="relative">
              <button
                onClick={() => {
                  const next = !bellOpen;
                  setBellOpen(next);
                  if (next) syncUnreadGmail3Days(false);
                }}
                className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition cursor-pointer"
                title={
                  lang === 'vi'
                    ? 'Thông báo Gmail chưa đọc (3 ngày gần nhất)'
                    : 'Unread Gmail Notifications (Last 3 Days)'
                }
              >
                <Bell className="w-4 h-4" />
                {unread3d.unreadCount > 0 ? (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center absolute -top-0.5 -right-0.5 shadow-2xs">
                    {unread3d.unreadCount > 99 ? '99+' : unread3d.unreadCount}
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-rose-500 absolute top-1.5 right-1.5" />
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-96 rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 overflow-hidden">
                  {/* Dropdown Header */}
                  <div className="p-3.5 bg-[#1B2537] text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#F26522]" />
                      <div>
                        <div className="text-xs font-bold">
                          {lang === 'vi' ? 'Gmail Chưa Đọc (3 Ngày Qua)' : 'Unread Gmail (Last 3 Days)'}
                        </div>
                        <div className="text-[10px] text-slate-300 truncate max-w-[200px]">
                          {unread3d.connected
                            ? `${unread3d.email} • ${unread3d.unreadCount} unread`
                            : lang === 'vi'
                            ? 'Chưa đăng nhập OAuth2'
                            : 'Not signed in via OAuth2'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => syncUnreadGmail3Days(true)}
                        disabled={bellSyncing}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-[11px] font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${bellSyncing ? 'animate-spin' : ''}`} />
                        <span>{lang === 'vi' ? 'Đồng bộ' : 'Sync'}</span>
                      </button>
                      <button
                        onClick={() => setBellOpen(false)}
                        className="p-1 text-slate-300 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dropdown Body */}
                  {!unread3d.connected ? (
                    <div className="p-6 text-center space-y-3">
                      <Mail className="w-7 h-7 text-slate-400 mx-auto" />
                      <div className="text-xs font-bold text-slate-800">
                        {lang === 'vi'
                          ? 'Kết nối Gmail OAuth 2.0 để nhận thông báo'
                          : 'Connect Gmail OAuth 2.0 to sync unread emails'}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {lang === 'vi'
                          ? 'Tự động tải và thông báo các email chưa đọc trong 3 ngày gần nhất.'
                          : 'Automatically fetches and alerts you of new unread emails from the last 3 days.'}
                      </p>
                      <button
                        onClick={() => {
                          setBellOpen(false);
                          setActiveTab('social');
                        }}
                        className="px-4 py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold cursor-pointer"
                      >
                        {lang === 'vi' ? 'Đăng nhập Gmail OAuth2' : 'Sign in with Google OAuth2'}
                      </button>
                    </div>
                  ) : unread3d.messages.length === 0 ? (
                    <div className="p-6 text-center space-y-2">
                      <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                      <div className="text-xs font-bold text-slate-800">
                        {lang === 'vi'
                          ? 'Không có email chưa đọc trong 3 ngày qua!'
                          : 'No unread emails in the last 3 days!'}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Query: <code>in:inbox is:unread newer_than:3d</code>
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {unread3d.messages.map((m) => {
                        const sender = parseSenderInfo(m.from);
                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              setBellOpen(false);
                              openGmailMessageDirect(m.id);
                            }}
                            className="px-3.5 py-2.5 hover:bg-orange-50/50 transition cursor-pointer group flex items-start gap-2.5"
                            title="Click to open this email directly in Gmail"
                          >
                            <div className="w-7 h-7 rounded-full bg-orange-100 text-[#F26522] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                              {sender.initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-800 truncate group-hover:text-[#F26522]">
                                  {sender.name}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                                  {new Date(m.date).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-[#F26522]" />
                                </span>
                              </div>
                              <div className="text-[11px] font-semibold text-slate-900 truncate">{m.subject}</div>
                              <div className="text-[11px] text-slate-500 truncate">{m.snippet}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Dropdown Footer */}
                  <div className="px-3.5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-mono">is:unread newer_than:3d</span>
                    <button
                      onClick={() => {
                        setBellOpen(false);
                        setActiveTab('social');
                      }}
                      className="font-bold text-[#F26522] hover:underline cursor-pointer"
                    >
                      {lang === 'vi' ? 'Mở Hộp thư Gmail →' : 'Open Full Gmail Hub →'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setAgentOpen(!agentOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border cursor-pointer ${
                agentOpen
                  ? 'bg-[#F26522] text-white border-[#F26522] shadow-sm'
                  : 'bg-orange-50 text-[#F26522] border-orange-200 hover:bg-orange-100'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>{t.aiAgentBtn}</span>
            </button>

            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-800 to-slate-600 text-white flex items-center justify-center font-bold text-xs shadow-sm ml-1">
              HN
            </div>
          </div>
        </header>

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-semibold shadow-xl border ${
              toast.type === 'ok'
                ? 'bg-white text-emerald-700 border-emerald-200'
                : 'bg-white text-rose-700 border-rose-200'
            }`}
          >
            {toast.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500" />
            )}
            <span>{toast.text}</span>
          </div>
        )}

        {/* 1-Command Open Source Install Modal */}
        {installModalOpen && (
          <OneCommandModal t={t} onClose={() => setInstallModalOpen(false)} />
        )}

        {/* Security & Admin PIN Settings Modal */}
        {secModalOpen && (
          <SecurityPinModal
            lang={lang}
            secStatus={secStatus}
            onClose={() => setSecModalOpen(false)}
            onUpdated={() => {
              checkSecurityStatus();
              showToast(lang === 'vi' ? 'Đã cập nhật cài đặt bảo mật!' : 'Security settings updated!');
            }}
          />
        )}

        {/* Full-Screen Admin PIN Lock Screen when PIN is enabled and not authenticated */}
        {secStatus.pinEnabled && !secStatus.authenticated && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <form
              onSubmit={handleUnlockWithPin}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F26522] flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {lang === 'vi' ? 'SmartMac Đang Khóa Bảo Mật' : 'SmartMac Security Lock'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {lang === 'vi'
                    ? 'Nhập mã PIN quản trị của bạn để mở khóa bảng điều khiển.'
                    : 'Enter your local Admin PIN to unlock the system dashboard.'}
                </p>
              </div>
              {unlockErr && (
                <div className="p-2 rounded-lg bg-rose-50 text-rose-600 text-xs font-semibold">
                  {unlockErr}
                </div>
              )}
              <input
                type="password"
                autoFocus
                value={unlockPinInput}
                onChange={(e) => setUnlockPinInput(e.target.value)}
                placeholder={lang === 'vi' ? 'Nhập mã PIN...' : 'Enter Admin PIN...'}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center text-sm font-bold tracking-widest text-slate-900 focus:outline-none focus:border-[#F26522]"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold cursor-pointer"
              >
                {lang === 'vi' ? 'Mở Khóa Hệ Thống' : 'Unlock Dashboard'}
              </button>
            </form>
          </div>
        )}

        {/* PAGE CONTENT + OPTIONAL AI DRAWER */}
        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Page Title + Breadcrumb + Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{t.tabTitles[activeTab]}</h1>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                  <Home className="w-3.5 h-3.5" />
                  <span>/</span>
                  <span>{t.dashboard}</span>
                  <span>/</span>
                  <span className="text-slate-700 font-medium">{t.tabTitles[activeTab]}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setInstallModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 text-[#F26522]" />
                  <span>{t.oneCmdBtn}</span>
                </button>
                <button
                  onClick={() => setAgentOpen(!agentOpen)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F26522]" />
                  <span>{t.askAiAssistant}</span>
                </button>
                <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{todayStr}</span>
                </div>
              </div>
            </div>

            {/* Dismissible Cyan Alert Banner */}
            {bannerVisible && (
              <div className="px-4 py-3 rounded-xl bg-[#E8F8F9] border border-[#BCECEF] text-[#0D7490] text-xs font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#0D7490]" />
                  <span>{t.bannerText}</span>
                </div>
                <button
                  onClick={() => setBannerVisible(false)}
                  className="text-slate-500 hover:text-slate-800 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active Tab View */}
            {activeTab === 'overview' && (
              <SmartHROverviewTab
                t={t}
                snapshot={snapshot}
                history={history}
                onNavigate={setActiveTab}
                onOpenAgent={() => setAgentOpen(true)}
                onToast={showToast}
              />
            )}
            {activeTab === 'apps' && <AppsAndProcessesTab t={t} onToast={showToast} />}
            {activeTab === 'files' && <FileExplorerTab t={t} onToast={showToast} />}
            {activeTab === 'network' && <WifiAndNetworkTab t={t} snapshot={snapshot} onToast={showToast} />}
            {activeTab === 'social' && <SocialHubTab t={t} lang={lang} onToast={showToast} />}
            {activeTab === 'vps' && <VpsManagerTab t={t} lang={lang} onToast={showToast} />}
            {activeTab === 'media' && <MediaStudioTab t={t} lang={lang} onToast={showToast} />}
          </main>

          {agentOpen && <AIAgentDrawer t={t} lang={lang} onClose={() => setAgentOpen(false)} onToast={showToast} />}
        </div>
      </div>
    </div>
  );
}

function SecurityPinModal({
  lang,
  secStatus,
  onClose,
  onUpdated,
}: {
  lang: Lang;
  secStatus: { pinEnabled: boolean; authenticated: boolean; bindHost: string };
  onClose: () => void;
  onUpdated: () => void;
}) {
  const isVi = lang === 'vi';
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState('');

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/security/set-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin, newPin }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setErr(data.message || 'Failed to update PIN');
      return;
    }
    if (data.token) {
      localStorage.setItem('smartmac_sec_token', data.token);
    } else {
      localStorage.removeItem('smartmac_sec_token');
    }
    onUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-[#1B2537] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold">
                {isVi ? 'Trung Tâm Bảo Mật & Khóa Mã PIN' : 'Security Center & Admin PIN Lock'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isVi ? 'Bảo vệ máy tính khỏi truy cập trái phép qua mạng LAN & Web' : 'Protects your machine from unauthorized LAN & Web access'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Active Security Layers Checklist */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5 text-emerald-900">
            <div className="font-bold flex items-center gap-1.5 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isVi ? 'Các Lớp Bảo Mật Đang Bật Mặc Định:' : 'Active Built-in Security Protections:'}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-700">
              <li>
                <strong>Loopback-Only Binding (<code>{secStatus.bindHost}</code>):</strong>{' '}
                {isVi
                  ? 'Chỉ máy tính của bạn mới truy cập được cổng 4000 (chặn hoàn toàn người lạ cùng mạng Wi-Fi).'
                  : 'Only your local computer can access port 4000 (blocks anyone else on the same Wi-Fi/LAN).'}
              </li>
              <li>
                <strong>Anti-CSRF & DNS Rebinding Guard:</strong>{' '}
                {isVi
                  ? 'Chặn mọi trang web độc hại bên ngoài gọi lén vào localhost API.'
                  : 'Blocks external websites in other browser tabs from calling localhost APIs.'}
              </li>
              <li>
                <strong>Safe Process Execution (<code>execFile</code>) & <code>0600</code> Secrets:</strong>{' '}
                {isVi
                  ? 'Chống lỗ hổng Command Injection và khóa quyền đọc file token OAuth2.'
                  : 'Prevents shell injection and locks OAuth2 config files to owner-only permissions.'}
              </li>
            </ul>
          </div>

          {/* Set / Remove Admin PIN Form */}
          <form onSubmit={handleSavePin} className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">
                {isVi ? 'Cài Đặt Mã PIN Khóa Bảng Điều Khiển' : 'Dashboard Admin PIN Lock'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  secStatus.pinEnabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {secStatus.pinEnabled ? (isVi ? 'ĐANG BẬT' : 'PIN ENABLED') : isVi ? 'CHƯA ĐẶT PIN' : 'NO PIN SET'}
              </span>
            </div>

            {err && <div className="p-2 rounded bg-rose-50 text-rose-600 font-semibold">{err}</div>}

            {secStatus.pinEnabled && (
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">
                  {isVi ? 'Mã PIN hiện tại *' : 'Current Admin PIN *'}
                </label>
                <input
                  type="password"
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] text-slate-500 block mb-1">
                {isVi
                  ? 'Mã PIN mới (Để trống nếu muốn tắt khóa PIN)'
                  : 'New Admin PIN (Leave empty to disable PIN lock)'}
              </label>
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={isVi ? 'Nhập mã PIN bảo mật mới...' : 'Enter new Admin PIN...'}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {secStatus.pinEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('smartmac_sec_token');
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-semibold cursor-pointer"
                >
                  {isVi ? 'Khóa Ngay' : 'Lock Now'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold cursor-pointer"
              >
                {isVi ? 'Đóng' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white font-bold cursor-pointer"
              >
                {isVi ? 'Lưu Mã PIN' : 'Save PIN'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function OneCommandModal({ t, onClose }: { t: typeof translations['en']; onClose: () => void }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const commands = [
    {
      title: '1. Run Directly from GitHub via NPX (macOS / Linux / Windows)',
      cmd: 'npx github:ngohoang211020/smartmac-agent',
    },
    {
      title: '2. One-Line Curl Installer (macOS & Linux)',
      cmd: 'curl -fsSL https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.sh | bash',
    },
    {
      title: '3. One-Line PowerShell Installer (Windows)',
      cmd: 'irm https://raw.githubusercontent.com/ngohoang211020/smartmac-agent/main/install.ps1 | iex',
    },
    {
      title: '4. Global NPM Package (Once published to npm)',
      cmd: 'npx smartmac-agent',
    },
  ];

  const copyCmd = (cmd: string, idx: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden">
        <div className="bg-[#1B2537] text-white p-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold">{t.modalTitle}</h3>
            <p className="text-xs text-slate-300 mt-0.5">{t.modalSub}</p>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {commands.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-xs font-semibold text-slate-700">{item.title}</div>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 text-emerald-400 font-mono text-xs">
                <span className="truncate">{item.cmd}</span>
                <button
                  onClick={() => copyCmd(item.cmd, idx)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 shrink-0 text-[11px]"
                >
                  {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedIdx === idx ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SubMenuItem({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-xs transition relative cursor-pointer ${
        active
          ? 'text-[#F26522] font-semibold'
          : 'text-slate-600 hover:text-slate-900 font-medium'
      }`}
    >
      {active && <span className="w-1 h-4 rounded-r bg-[#F26522] absolute left-0" />}
      <span>{label}</span>
      {badge && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-[#F26522] border border-orange-200">
          {badge}
        </span>
      )}
    </button>
  );
}

function SidebarActionItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SidebarSystemTrigger({
  icon,
  label,
  action,
  onResult,
}: {
  icon: React.ReactNode;
  label: string;
  action: string;
  onResult: (msg: string, type: 'ok' | 'err') => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/system/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      onResult(data.message, data.ok ? 'ok' : 'err');
    } catch (err: any) {
      onResult(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={run}
      disabled={busy}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition disabled:opacity-50"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ============================================================================
   1. SMARTHR-STYLE OVERVIEW DASHBOARD TAB
============================================================================ */
function SmartHROverviewTab({
  t,
  snapshot,
  onNavigate,
  onOpenAgent,
}: {
  t: typeof translations['en'];
  snapshot: SystemSnapshot | null;
  history: Array<{ time: string; cpu: number; ram: number; rx: number; tx: number }>;
  onNavigate: (tab: ActiveTab) => void;
  onOpenAgent: () => void;
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  if (!snapshot) {
    return (
      <div className="h-64 bg-white rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 text-sm">
        {t.connecting}
      </div>
    );
  }

  const primaryDisk = snapshot.disks[0];
  const cpuLoad = snapshot.cpu.currentLoad;
  const ramPct = snapshot.memory.usagePercent;
  const diskPct = primaryDisk?.usePercent || 0;
  const batteryPct = snapshot.battery.percent || 100;

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const seg1 = Math.max(8, Math.min(45, cpuLoad)) / 100;
  const seg2 = Math.max(10, Math.min(40, ramPct * 0.4)) / 100;
  const seg3 = Math.max(8, Math.min(25, diskPct * 0.3)) / 100;
  const seg4 = Math.max(5, 1 - (seg1 + seg2 + seg3));

  const nowFormatted = new Date(snapshot.timestamp).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="space-y-5">
      {/* ROW 1: 3-Column Layout matching SmartHR Employee Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Card 1: Dark Header Profile Card */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-[#1B2537] p-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#F26522] to-amber-400 p-0.5">
                    <div className="w-full h-full rounded-full bg-[#1B2537] flex items-center justify-center text-white font-bold text-sm">
                      Mac
                    </div>
                  </div>
                  <span className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#1B2537] absolute bottom-0 right-0" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">{snapshot.hostname}</h3>
                  <p className="text-xs text-slate-300">
                    {snapshot.cpu.brand} • {snapshot.arch}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate('social')}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div>
                <div className="text-slate-400">{t.processorGraphics}</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {snapshot.cpu.brand} ({snapshot.cpu.cores} {t.cores}) • {snapshot.gpu[0]?.model || 'Apple GPU'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">{t.connectedGmail}</div>
                <div className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1.5">
                  <span>OAuth 2.0</span>
                  <button
                    onClick={() => onNavigate('social')}
                    className="text-[11px] text-[#F26522] underline cursor-pointer"
                  >
                    Sign In / Manage
                  </button>
                </div>
              </div>
              <div>
                <div className="text-slate-400">{t.operatingSystem}</div>
                <div className="font-semibold text-slate-800 mt-0.5">{snapshot.platform}</div>
              </div>
              <div>
                <div className="text-slate-400">{t.primaryVolume}</div>
                <div className="font-semibold text-slate-800 mt-0.5">
                  {primaryDisk
                    ? `${formatBytes(primaryDisk.used)} ${t.usedOf} ${formatBytes(primaryDisk.size)} (${formatBytes(primaryDisk.available)} ${t.free})`
                    : 'Macintosh HD'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Resource Allocation Donut Chart */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">{t.resourceAllocation}</h3>
            <span className="px-2.5 py-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              {t.live2s}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center my-4">
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1B4D3E]" />
                <span className="text-slate-500">
                  <strong className="text-slate-900">{snapshot.cpu.currentLoad}%</strong> {t.cpuTotalLoad}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                <span className="text-slate-500">
                  <strong className="text-slate-900">{snapshot.cpu.loadUser}%</strong> {t.userProcesses}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F26522]" />
                <span className="text-slate-500">
                  <strong className="text-slate-900">{snapshot.memory.usagePercent}%</strong> {t.unifiedRam}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E11D48]" />
                <span className="text-slate-500">
                  <strong className="text-slate-900">{snapshot.cpu.loadSystem}%</strong> {t.kernelSystem}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15]" />
                <span className="text-slate-500">
                  <strong className="text-slate-900">{diskPct}%</strong> {t.diskStorage}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-36 h-36 -rotate-90" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r={radius} stroke="#F1F5F9" strokeWidth="18" fill="none" />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    stroke="#155E63"
                    strokeWidth="18"
                    fill="none"
                    strokeDasharray={`${seg4 * circumference} ${circumference}`}
                    strokeDashoffset="0"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    stroke="#10B981"
                    strokeWidth="18"
                    fill="none"
                    strokeDasharray={`${seg2 * circumference} ${circumference}`}
                    strokeDashoffset={`-${seg4 * circumference}`}
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    stroke="#FACC15"
                    strokeWidth="18"
                    fill="none"
                    strokeDasharray={`${seg3 * circumference} ${circumference}`}
                    strokeDashoffset={`-${(seg4 + seg2) * circumference}`}
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    stroke="#F26522"
                    strokeWidth="18"
                    fill="none"
                    strokeDasharray={`${seg1 * circumference} ${circumference}`}
                    strokeDashoffset={`-${(seg4 + seg2 + seg3) * circumference}`}
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="text-lg font-extrabold text-slate-900">{snapshot.cpu.currentLoad}%</div>
                  <div className="text-[10px] text-slate-400 font-medium">{t.cpuLoad}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
            <span className="w-4 h-4 rounded bg-orange-500 text-white flex items-center justify-center text-[10px] font-bold">
              ✓
            </span>
            <span>
              {t.memoryHealthy} <strong>{formatBytes(snapshot.memory.available)}</strong> {t.availableForApps}
            </span>
          </div>
        </div>

        {/* Card 3: Quick Stats Grid */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">{t.hardwareSummary}</h3>
            <span className="px-2 py-1 rounded-md border border-slate-200 text-[11px] font-medium text-slate-600">
              {snapshot.cpu.cores} {t.cores}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-3 my-4">
            <div>
              <div className="text-[11px] text-slate-400">{t.totalRam}</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {formatBytes(snapshot.memory.total)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.activeRam}</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {formatBytes(snapshot.memory.used)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.batteryLevel}</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">{batteryPct}%</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.powerSource}</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {snapshot.battery.acConnected ? 'AC' : 'Batt'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.freeDisk}</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {primaryDisk ? formatBytes(primaryDisk.available) : '--'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">{t.swapUsed}</div>
              <div className="text-base font-extrabold text-slate-900 mt-0.5">
                {formatBytes(snapshot.memory.swapUsed)}
              </div>
            </div>
          </div>

          <button
            onClick={onOpenAgent}
            className="w-full py-2.5 rounded-lg bg-[#1B2537] hover:bg-slate-800 text-white text-xs font-semibold transition cursor-pointer"
          >
            {t.runAiDiagnostics}
          </button>
        </div>
      </div>

      {/* ROW 2: Orange-Border Uptime/Battery Gauge Card + 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 bg-[#FFFBF9] rounded-xl border-2 border-orange-200 p-5 flex flex-col items-center justify-between text-center">
          <div>
            <div className="text-xs font-medium text-slate-500">{t.systemUptimePower}</div>
            <div className="text-base font-extrabold text-slate-900 mt-1">{nowFormatted}</div>
          </div>

          <div className="my-4 relative w-32 h-32 flex items-center justify-center">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="48" stroke="#E2E8F0" strokeWidth="8" fill="none" />
              <circle
                cx="60"
                cy="60"
                r="48"
                stroke="#10B981"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${(batteryPct / 100) * (2 * Math.PI * 48)} ${2 * Math.PI * 48}`}
              />
            </svg>
            <div className="absolute text-center">
              <div className="text-[10px] text-slate-400">{t.totalUptime}</div>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5">
                {formatUptime(snapshot.uptime)}
              </div>
            </div>
          </div>

          <div className="w-full space-y-2">
            <div className="inline-block px-3 py-1 rounded-md bg-slate-900 text-white text-[11px] font-semibold">
              {t.battery} {batteryPct}% • {snapshot.battery.isCharging ? t.charging : snapshot.battery.acConnected ? t.acConnected : t.onBattery}
            </div>
            <div>
              <button
                onClick={() => onNavigate('apps')}
                className="w-full py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-semibold transition"
              >
                {t.manageActiveProcs}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col justify-between space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              icon={<Cpu className="w-4 h-4 text-white" />}
              iconBg="bg-[#F26522]"
              value={`${snapshot.cpu.currentLoad}`}
              total="100%"
              label={t.processorLoadNow}
              trend={`${snapshot.cpu.cores} ${t.activeLogicalCores}`}
              trendUp={snapshot.cpu.currentLoad < 75}
              onClick={() => onNavigate('apps')}
            />
            <KpiCard
              icon={<Clock className="w-4 h-4 text-white" />}
              iconBg="bg-[#1B2537]"
              value={(snapshot.memory.used / 1024 ** 3).toFixed(1)}
              total={`${(snapshot.memory.total / 1024 ** 3).toFixed(0)} GB`}
              label={t.unifiedMemoryUsed}
              trend={`${snapshot.memory.usagePercent}% ${t.activeUtilization}`}
              trendUp={snapshot.memory.usagePercent < 85}
              onClick={() => onNavigate('apps')}
            />
            <KpiCard
              icon={<HardDrive className="w-4 h-4 text-white" />}
              iconBg="bg-blue-600"
              value={primaryDisk ? (primaryDisk.used / 1024 ** 3).toFixed(0) : '0'}
              total={primaryDisk ? `${(primaryDisk.size / 1024 ** 3).toFixed(0)} GB` : '0 GB'}
              label={t.primaryStorage}
              trend={`${primaryDisk ? formatBytes(primaryDisk.available) : '0 B'} ${t.available}`}
              trendUp={true}
              onClick={() => onNavigate('files')}
            />
            <KpiCard
              icon={<Wifi className="w-4 h-4 text-white" />}
              iconBg="bg-pink-600"
              value={formatBytes(snapshot.networkTraffic.rxSec)}
              total="/sec"
              label={`${t.networkLabel} (${snapshot.networkTraffic.iface})`}
              trend={`↑ ${formatBytes(snapshot.networkTraffic.txSec)}/s ${t.upload}`}
              trendUp={true}
              onClick={() => onNavigate('network')}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{t.coreActivityTitle}</h3>
                <p className="text-xs text-slate-400">
                  {t.userLabel}: {snapshot.cpu.loadUser}% • {t.kernelLabel}: {snapshot.cpu.loadSystem}% • {t.updatedEvery2s}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onNavigate('files')}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                >
                  {t.browseFiles}
                </button>
                <button
                  onClick={() => onNavigate('social')}
                  className="px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#F26522] text-xs font-semibold transition"
                >
                  {t.openGmailFb}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
              {snapshot.cpu.coreLoads.map((load, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500 font-medium">{t.core} #{idx + 1}</span>
                    <span className="font-bold text-slate-800">{load}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        load > 75 ? 'bg-rose-500' : load > 45 ? 'bg-[#F26522]' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, load)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  value,
  total,
  label,
  trend,
  trendUp,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  total: string;
  label: string;
  trend: string;
  trendUp: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col justify-between hover:border-orange-300 transition cursor-pointer"
    >
      <div>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shadow-2xs`}>
          {icon}
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-xl font-extrabold text-slate-900">{value}</span>
          <span className="text-xs font-semibold text-slate-400">/ {total}</span>
        </div>
        <div className="text-xs text-slate-500 font-medium mt-0.5">{label}</div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px]">
        <span
          className={`w-4 h-4 rounded-full flex items-center justify-center ${
            trendUp ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
          }`}
        >
          {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        </span>
        <span className="text-slate-500 font-medium truncate">{trend}</span>
      </div>
    </div>
  );
}

/* ============================================================================
   2. APPS & PROCESSES TAB
============================================================================ */
function AppsAndProcessesTab({
  t,
  onToast,
}: {
  t: typeof translations['en'];
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [processes, setProcesses] = useState<any[]>([]);
  const [procStats, setProcStats] = useState({ all: 0, running: 0, sleeping: 0 });
  const [apps, setApps] = useState<Array<{ name: string; path: string; isSystem: boolean }>>([]);
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState<'processes' | 'installed'>('processes');
  const [loading, setLoading] = useState(false);

  const loadProcesses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/processes?limit=60');
      const data = await res.json();
      setProcesses(data.list || []);
      setProcStats({ all: data.all || 0, running: data.running || 0, sleeping: data.sleeping || 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadApps = async () => {
    try {
      const res = await fetch('/api/apps');
      const data = await res.json();
      setApps(data.apps || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadProcesses();
    loadApps();
    const timer = setInterval(loadProcesses, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleKill = async (pid: number, name: string) => {
    const res = await fetch('/api/processes/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid, force: false }),
    });
    const data = await res.json();
    onToast(data.message || `Terminated ${name}`, data.ok ? 'ok' : 'err');
    loadProcesses();
  };

  const handleLaunchApp = async (appNameOrPath: string) => {
    const res = await fetch('/api/apps/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appNameOrPath }),
    });
    const data = await res.json();
    onToast(data.message, data.ok ? 'ok' : 'err');
  };

  const handleQuitApp = async (appName: string) => {
    const res = await fetch('/api/apps/quit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName }),
    });
    const data = await res.json();
    onToast(data.message, data.ok ? 'ok' : 'err');
  };

  const filteredProcs = processes.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || String(p.pid).includes(search)
  );
  const filteredApps = apps.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('processes')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subTab === 'processes'
                ? 'bg-[#F26522] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.activeProcessesTab} ({procStats.all})
          </button>
          <button
            onClick={() => setSubTab('installed')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subTab === 'installed'
                ? 'bg-[#F26522] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.installedAppsTab} ({apps.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.filterAppsPlaceholder}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#F26522]"
            />
          </div>
          <button
            onClick={loadProcesses}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {subTab === 'processes' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                <th className="py-3 px-4 font-semibold">{t.pid}</th>
                <th className="py-3 px-4 font-semibold">{t.processName}</th>
                <th className="py-3 px-4 font-semibold">{t.user}</th>
                <th className="py-3 px-4 font-semibold">CPU %</th>
                <th className="py-3 px-4 font-semibold">RAM %</th>
                <th className="py-3 px-4 font-semibold text-right">{t.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProcs.map((p) => (
                <tr key={p.pid} className="hover:bg-slate-50/80 transition">
                  <td className="py-2.5 px-4 font-mono text-slate-500">{p.pid}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <AppProcessIcon name={p.name} appPath={p.appPath} size="sm" />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate max-w-xs">{p.name}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs font-mono">
                          {p.appPath ? p.appPath.replace('/Applications/', '') : p.command || p.state}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500">{p.user}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                        <div
                          className={`h-full ${
                            p.cpu > 50 ? 'bg-rose-500' : p.cpu > 15 ? 'bg-[#F26522]' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, p.cpu)}%` }}
                        />
                      </div>
                      <span
                        className={`font-bold ${
                          p.cpu > 50 ? 'text-rose-600' : p.cpu > 15 ? 'text-[#F26522]' : 'text-emerald-600'
                        }`}
                      >
                        {p.cpu}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-700">{p.mem}%</td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => handleKill(p.pid, p.name)}
                      className="px-2.5 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-semibold transition cursor-pointer"
                    >
                      {t.endTask}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredApps.map((app) => (
            <div
              key={app.path}
              className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between hover:border-orange-300 transition"
            >
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <AppProcessIcon name={app.name} appPath={app.path} size="md" />
                <div className="truncate">
                  <div className="font-bold text-sm text-slate-900 truncate">{app.name}</div>
                  <div className="text-[11px] text-slate-400 truncate">{app.path}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => handleLaunchApp(app.path)}
                  className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 transition cursor-pointer"
                  title={t.launchApp}
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleQuitApp(app.name)}
                  className="p-2 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition cursor-pointer"
                  title={t.quitApp}
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppProcessIcon({
  name,
  appPath,
  size = 'sm',
}: {
  name: string;
  appPath?: string;
  size?: 'sm' | 'md';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const lower = (name || '').toLowerCase();

  // Build native icon URL if it's an app or matched to an appPath
  const iconUrl =
    !imgFailed && (appPath || !lower.endsWith('d'))
      ? `/api/apps/icon?${appPath ? `path=${encodeURIComponent(appPath)}` : `name=${encodeURIComponent(name)}`}`
      : null;

  const dims = size === 'md' ? 'w-10 h-10 rounded-xl' : 'w-8 h-8 rounded-lg';

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        className={`${dims} object-contain shrink-0 bg-slate-50 border border-slate-200/80 p-0.5 shadow-2xs`}
        loading="lazy"
      />
    );
  }

  // Smart category fallback badge for background daemons, CLI tools, and system processes
  let bg = 'bg-slate-100 text-slate-600 border-slate-200';
  let letIconComponent = Cpu;

  if (lower.includes('chrome') || lower.includes('safari') || lower.includes('firefox') || lower.includes('arc') || lower.includes('webkit')) {
    bg = 'bg-blue-50 text-blue-600 border-blue-200';
    letIconComponent = Globe;
  } else if (lower.includes('node') || lower.includes('tsx') || lower.includes('vite') || lower.includes('python') || lower.includes('git') || lower.includes('terminal') || lower.includes('zsh') || lower.includes('bash')) {
    bg = 'bg-emerald-50 text-emerald-600 border-emerald-200';
    letIconComponent = Terminal;
  } else if (lower.includes('windowserver') || lower.includes('kernel') || lower.includes('launchd') || lower.includes('sys') || lower.includes('core')) {
    bg = 'bg-orange-50 text-[#F26522] border-orange-200';
    letIconComponent = Activity;
  } else if (lower.includes('mail') || lower.includes('message') || lower.includes('slack') || lower.includes('discord')) {
    bg = 'bg-rose-50 text-rose-600 border-rose-200';
    letIconComponent = Mail;
  } else if (lower.includes('finder') || lower.includes('file') || lower.includes('mds') || lower.includes('spotlight')) {
    bg = 'bg-amber-50 text-amber-600 border-amber-200';
    letIconComponent = FolderOpen;
  } else {
    bg = 'bg-indigo-50 text-indigo-600 border-indigo-200';
    letIconComponent = AppWindow;
  }

  const IconComp = letIconComponent;
  return (
    <div className={`${dims} ${bg} border flex items-center justify-center shrink-0 shadow-2xs`}>
      <IconComp className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />
    </div>
  );
}

/* ============================================================================
   3. FILE & FOLDER EXPLORER TAB
============================================================================ */
function FileExplorerTab({
  t,
  onToast,
}: {
  t: typeof translations['en'];
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string>('');
  const [entries, setEntries] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<Array<{ label: string; path: string }>>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [preview, setPreview] = useState<{
    path: string;
    name: string;
    size: number;
    content: string;
    isBinary: boolean;
  } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  const loadDir = async (targetPath?: string, hidden = showHidden) => {
    try {
      const q = new URLSearchParams();
      if (targetPath) q.set('path', targetPath);
      if (hidden) q.set('hidden', 'true');
      const res = await fetch(`/api/files/list?${q.toString()}`);
      const data = await res.json();
      if (data.error) {
        onToast(data.error, 'err');
        return;
      }
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setEntries(data.entries || []);
    } catch (err: any) {
      onToast(err.message, 'err');
    }
  };

  useEffect(() => {
    fetch('/api/files/bookmarks')
      .then((r) => r.json())
      .then((d) => setBookmarks(d.bookmarks || []))
      .catch(() => {});
    loadDir();
  }, []);

  const openEntry = async (entry: any) => {
    if (entry.isDirectory) {
      setPreview(null);
      loadDir(entry.path);
    } else {
      const res = await fetch(`/api/files/preview?path=${encodeURIComponent(entry.path)}`);
      const data = await res.json();
      if (data.error) {
        onToast(data.error, 'err');
        return;
      }
      setPreview(data);
      setEditContent(data.content);
    }
  };

  const handleSaveFile = async () => {
    if (!preview) return;
    const res = await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: preview.path, content: editContent }),
    });
    const data = await res.json();
    if (data.ok) {
      onToast(`Saved ${preview.name}`);
      loadDir(currentPath);
    } else {
      onToast(data.error || 'Failed to save', 'err');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const full = `${currentPath}/${newFolderName.trim()}`;
    const res = await fetch('/api/files/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: full }),
    });
    const data = await res.json();
    if (data.ok) {
      onToast(`Created folder ${newFolderName}`);
      setNewFolderName('');
      loadDir(currentPath);
    } else {
      onToast(data.error || 'Failed to create folder', 'err');
    }
  };

  const handleTrash = async (targetPath: string) => {
    const res = await fetch('/api/files/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath }),
    });
    const data = await res.json();
    if (data.ok) {
      onToast(data.message);
      if (preview?.path === targetPath) setPreview(null);
      loadDir(currentPath);
    } else {
      onToast(data.error || 'Failed to move to Trash', 'err');
    }
  };

  const handleReveal = async (targetPath: string) => {
    const res = await fetch('/api/files/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath }),
    });
    const data = await res.json();
    onToast(data.message || 'Revealed in Finder');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => loadDir(parentPath)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 shrink-0"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>{t.upBtn}</span>
          </button>
          {bookmarks.map((b) => (
            <button
              key={b.path}
              onClick={() => loadDir(b.path)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                currentPath === b.path
                  ? 'bg-[#F26522] text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t.newFolderPlaceholder}
            className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#F26522]"
          />
          <button
            onClick={handleCreateFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-semibold transition"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{t.newFolderBtn}</span>
          </button>
          <button
            onClick={() => {
              const next = !showHidden;
              setShowHidden(next);
              loadDir(currentPath, next);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showHidden
                ? 'bg-orange-50 text-[#F26522] border-orange-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            {showHidden ? t.hiddenOn : t.hiddenOff}
          </button>
        </div>
      </div>

      <div className="text-xs font-mono text-slate-500 px-1">
        {t.currentPathLabel} {currentPath}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div
          className={`${
            preview ? 'lg:col-span-7' : 'lg:col-span-12'
          } bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden`}
        >
          <div className="max-h-[540px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50 sticky top-0">
                  <th className="py-3 px-4 font-semibold">{t.nameCol}</th>
                  <th className="py-3 px-4 font-semibold">{t.sizeCol}</th>
                  <th className="py-3 px-4 font-semibold">{t.modifiedCol}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t.actionsCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <tr key={e.path} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => openEntry(e)}
                        className="flex items-center gap-2 font-semibold text-slate-800 hover:text-[#F26522] text-left"
                      >
                        <span>{e.isDirectory ? '📁' : '📄'}</span>
                        <span className="truncate max-w-xs">{e.name}</span>
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {e.isDirectory ? '--' : formatBytes(e.size)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {e.modifiedAt ? new Date(e.modifiedAt).toLocaleDateString() : '--'}
                    </td>
                    <td className="py-2.5 px-4 text-right space-x-1">
                      <button
                        onClick={() => handleReveal(e.path)}
                        className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleTrash(e.path)}
                        className="p-1.5 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {preview && (
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col h-[540px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="truncate">
                <h3 className="text-sm font-bold text-slate-900 truncate">{preview.name}</h3>
                <p className="text-[11px] text-slate-400">{formatBytes(preview.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                {!preview.isBinary && (
                  <button
                    onClick={handleSaveFile}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{t.saveBtn}</span>
                  </button>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold"
                >
                  {t.closeBtn}
                </button>
              </div>
            </div>

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              readOnly={preview.isBinary}
              className="flex-1 mt-3 w-full rounded-lg bg-slate-50 border border-slate-200 p-3 font-mono text-xs text-slate-800 focus:outline-none focus:border-[#F26522] resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   4. WI-FI & NETWORK TAB
============================================================================ */
function WifiAndNetworkTab({
  t,
  snapshot,
  onToast,
}: {
  t: typeof translations['en'];
  snapshot: SystemSnapshot | null;
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [overview, setOverview] = useState<any>(null);
  const [scannedNetworks, setScannedNetworks] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pingHost, setPingHost] = useState('1.1.1.1');
  const [pingResult, setPingResult] = useState<string>('');
  const [pinging, setPinging] = useState(false);

  const loadNetwork = async () => {
    const res = await fetch('/api/network/overview');
    const data = await res.json();
    setOverview(data);
  };

  useEffect(() => {
    loadNetwork();
  }, []);

  const handleScanWifi = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/network/wifi-scan');
      const data = await res.json();
      setScannedNetworks(data.networks || []);
      onToast(`Found ${(data.networks || []).length} Wi-Fi networks`);
    } finally {
      setScanning(false);
    }
  };

  const handleToggleWifi = async (enabled: boolean) => {
    const res = await fetch('/api/network/wifi-toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    onToast(data.message, data.ok ? 'ok' : 'err');
    setTimeout(loadNetwork, 1500);
  };

  const handlePing = async () => {
    setPinging(true);
    try {
      const res = await fetch('/api/network/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: pingHost, count: 3 }),
      });
      const data = await res.json();
      setPingResult(data.output || '');
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{t.wifiHeaderTitle}</h3>
          <p className="text-xs text-slate-400">{t.wifiHeaderSub}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScanWifi}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{t.scanNearbyWifi}</span>
          </button>
          {overview && (
            <button
              onClick={() => handleToggleWifi(!overview.wifi.enabled)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                overview.wifi.enabled
                  ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {overview.wifi.enabled ? t.turnWifiOff : t.turnWifiOn}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">{t.currentWifiNetwork}</span>
            <Wifi className="w-5 h-5 text-[#F26522]" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-2">
            {overview?.wifi?.ssid || t.connecting}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div>{t.interfaceLabel}: <strong className="text-slate-800 font-mono">{overview?.wifi?.interfaceName || 'en0'}</strong></div>
            <div>{t.securityLabel}: <strong className="text-slate-800">{overview?.wifi?.security || 'WPA2/WPA3'}</strong></div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">{t.defaultGatewayDns}</span>
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-2 font-mono">
            {overview?.defaultGateway || 'N/A'}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <div className="truncate">
              DNS: <strong className="text-slate-800 font-mono">{(overview?.dnsServers || []).join(', ') || 'Auto'}</strong>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">{t.liveThroughput}</span>
            <Activity className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-600 mt-2">
            ↓ {formatBytes(snapshot?.networkTraffic.rxSec || 0)}/s
          </div>
          <div className="mt-1 text-sm font-bold text-[#F26522]">
            ↑ {formatBytes(snapshot?.networkTraffic.txSec || 0)}/s
          </div>
        </div>
      </div>

      {scannedNetworks.length > 0 && (
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            {t.nearbyWifiNetworks} ({scannedNetworks.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scannedNetworks.map((n, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                <div>
                  <div className="font-bold text-slate-900">{n.ssid}</div>
                  <div className="text-slate-500">Ch {n.channel} • {n.security}</div>
                </div>
                <span className="px-2 py-1 rounded bg-orange-50 text-[#F26522] font-mono font-semibold">
                  {n.signalLevel} dBm
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <h3 className="text-sm font-bold text-slate-900 mb-3">{t.activeNetInterfaces}</h3>
          <div className="space-y-2.5 max-h-64 overflow-y-auto">
            {(overview?.interfaces || []).map((iface: any) => (
              <div key={iface.iface} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between">
                <div>
                  <div className="font-bold text-slate-900">{iface.iface} ({iface.type || 'net'})</div>
                  <div className="text-slate-600 font-mono mt-0.5">IPv4: {iface.ip4 || 'None'}</div>
                </div>
                <div className="text-right font-mono text-slate-400 text-[11px]">{iface.mac}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col">
          <h3 className="text-sm font-bold text-slate-900 mb-3">{t.pingDiagnosticTitle}</h3>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={pingHost}
              onChange={(e) => setPingHost(e.target.value)}
              placeholder={t.pingPlaceholder}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#F26522]"
            />
            <button
              onClick={handlePing}
              disabled={pinging}
              className="px-4 py-1.5 rounded-lg bg-[#1B2537] hover:bg-slate-800 text-white text-xs font-semibold"
            >
              {pinging ? t.pingingBtn : t.runPingBtn}
            </button>
          </div>
          <pre className="flex-1 p-3 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto min-h-[140px]">
            {pingResult || t.pingEmptyText}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   5. GMAIL OAUTH 2.0 HUB TAB (Clean OAuth2 Sign-In, Reset Session, Inbox & Send)
============================================================================ */
function SocialHubTab({
  t,
  lang,
  onToast,
}: {
  t: typeof translations['en'];
  lang: Lang;
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [gmailData, setGmailData] = useState<any>(null);
  const [configOpen, setConfigOpen] = useState(true);

  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  // OAuth2 + Credentials Form
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://localhost:4000/api/social/gmail/oauth/callback');
  const [gmailAccessToken, setGmailAccessToken] = useState('');
  const [gmailEmail, setGmailEmail] = useState('');
  const [gmailAppPassword, setGmailAppPassword] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  const loadAll = async () => {
    const [gRes, cRes] = await Promise.all([
      fetch('/api/social/gmail').then((r) => r.json()),
      fetch('/api/social/config').then((r) => r.json()),
    ]);
    setGmailData(gRes);
    if (cRes) {
      setGmailEmail(cRes.gmailEmail || '');
      setClientId(cRes.gmailClientId || '');
      setRedirectUri(cRes.gmailRedirectUri || 'http://localhost:4000/api/social/gmail/oauth/callback');
      if (gRes?.connected) {
        setConfigOpen(false);
      }
    }
  };

  useEffect(() => {
    loadAll();
    const onMsg = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'GMAIL_OAUTH_SUCCESS') {
        onToast(`Signed in via Google OAuth2 as ${ev.data.email}`);
        loadAll();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const handleOpenWeb = async (target: string) => {
    const res = await fetch('/api/social/open-web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    onToast(data.message);
  };

  const handleResetMemoryAndLogout = async () => {
    const res = await fetch('/api/social/gmail/reset', { method: 'POST' });
    const data = await res.json();
    setGmailEmail('');
    setGmailAccessToken('');
    setGmailAppPassword('');
    setConfigOpen(true);
    onToast(data.message || 'Memory & Gmail session reset!', 'ok');
    loadAll();
  };

  const handleStartGoogleOAuth2 = async () => {
    // Save clientId / clientSecret first if entered
    if (clientId || clientSecret) {
      await fetch('/api/social/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gmail: {
            clientId,
            ...(clientSecret ? { clientSecret } : {}),
            redirectUri,
          },
        }),
      });
    }

    const res = await fetch('/api/social/gmail/oauth/url');
    const data = await res.json();
    if (!data.ok || !data.url) {
      onToast(
        data.error || 'Please enter your Google OAuth2 Client ID & Client Secret (or paste an OAuth2 Access Token) below.',
        'err'
      );
      setConfigOpen(true);
      return;
    }
    window.open(data.url, 'gmail_oauth_popup', 'width=540,height=680');
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      gmail: {
        email: gmailEmail,
        clientId,
        redirectUri,
      },
    };
    if (clientSecret) payload.gmail.clientSecret = clientSecret;
    if (gmailAccessToken) payload.gmail.accessToken = gmailAccessToken;
    if (gmailAppPassword) payload.gmail.appPassword = gmailAppPassword;
    if (geminiApiKey) payload.geminiApiKey = geminiApiKey;

    const res = await fetch('/api/social/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      onToast('Saved OAuth2 credentials!');
      loadAll();
    }
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mailTo || !mailSubject) return;
    const res = await fetch('/api/social/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: mailTo, subject: mailSubject, body: mailBody }),
    });
    const data = await res.json();
    onToast(data.message, data.ok ? 'ok' : 'err');
    if (data.ok) {
      setMailTo('');
      setMailSubject('');
      setMailBody('');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar: Sign in with Google OAuth2 + Reset Session / Sign Out */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleStartGoogleOAuth2}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Mail className="w-4 h-4" />
            <span>Sign in with Google OAuth 2.0</span>
          </button>

          <button
            onClick={() => handleOpenWeb('gmail')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{t.openGmailWeb}</span>
          </button>

          <button
            onClick={() => setConfigOpen(!configOpen)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>OAuth 2.0 Credentials</span>
          </button>
        </div>

        <button
          onClick={handleResetMemoryAndLogout}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold transition cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Reset Session & Sign Out</span>
        </button>
      </div>

      {/* OAuth 2.0 Configuration Panel */}
      {configOpen && (
        <form onSubmit={handleSaveConfig} className="p-5 rounded-xl bg-white border-2 border-orange-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Google OAuth 2.0 Sign-In Setup</h3>
              <p className="text-xs text-slate-500">
                Connect using Google Cloud OAuth 2.0 Client ID/Secret (Full Authorization Flow) or paste an OAuth2 Bearer Access Token.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleOpenWeb('google_console')}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700"
              >
                Google Cloud Console ↗
              </button>
              <button
                type="button"
                onClick={() => handleOpenWeb('oauth_playground')}
                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700"
              >
                OAuth2 Playground ↗
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Option A: Standard OAuth2 Client ID + Secret */}
            <div className="space-y-2.5 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="font-bold text-[#F26522]">Option A: Google OAuth2 Client</div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Google Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Google Client Secret</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Authorized Redirect URI</label>
                <input
                  type="text"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-600 font-mono text-[11px]"
                />
              </div>
            </div>

            {/* Option B: Instant OAuth2 Bearer Token */}
            <div className="space-y-2.5 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="font-bold text-emerald-600">Option B: Direct OAuth2 Access Token</div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">OAuth2 Bearer Access Token</label>
                <input
                  type="password"
                  value={gmailAccessToken}
                  onChange={(e) => setGmailAccessToken(e.target.value)}
                  placeholder="ya29.a0..."
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-800"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Or Gmail Address + App Password</label>
                <input
                  type="email"
                  value={gmailEmail}
                  onChange={(e) => setGmailEmail(e.target.value)}
                  placeholder="your.email@gmail.com"
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-800 mb-1.5"
                />
                <input
                  type="password"
                  value={gmailAppPassword}
                  onChange={(e) => setGmailAppPassword(e.target.value)}
                  placeholder="16-char App Password (Optional)"
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-800"
                />
              </div>
            </div>

            {/* Gemini AI Agent Key */}
            <div className="space-y-2.5 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="font-bold text-slate-800">Gemini AI Key (Optional)</div>
                <label className="text-[11px] text-slate-500 block">GEMINI_API_KEY</label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-1.5 rounded-md bg-white border border-slate-200 text-slate-800"
                />
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-200">
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#1B2537] hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  Save Credentials
                </button>
                <button
                  type="button"
                  onClick={handleStartGoogleOAuth2}
                  className="w-full py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold cursor-pointer"
                >
                  Launch Google OAuth2 Popup ↗
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Gmail Inbox + Quick Send Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 Cols: Live Gmail Inbox */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{t.gmailInbox}</h3>
                <p className="text-[11px] text-slate-500">
                  {gmailData?.connected ? gmailData.email : 'Not signed in — Memory cleared'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] px-2.5 py-1 rounded-full font-bold ${
                  gmailData?.connected
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {gmailData?.connected ? 'OAUTH2 CONNECTED' : 'SIGN IN REQUIRED'}
              </span>
              <button
                onClick={loadAll}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
                title="Refresh Inbox"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {gmailData?.error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {gmailData.error}
            </div>
          )}

          {!gmailData?.connected ? (
            <div className="py-12 px-4 text-center space-y-3 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <Mail className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                Session Reset — Ready to Sign In with Google OAuth 2.0
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Your previous cached Gmail session has been cleared. Enter your OAuth 2.0 Client ID & Secret (or paste an OAuth2 Access Token) above and click <strong>Sign in with Google OAuth 2.0</strong>.
              </p>
              <button
                onClick={handleStartGoogleOAuth2}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Sign in with Google OAuth 2.0</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-[430px] overflow-y-auto">
              {(gmailData?.messages || []).map((m: any) => {
                const sender = parseSenderInfo(m.from);
                return (
                  <div
                    key={m.id}
                    onClick={() => openGmailMessageDirect(m.id)}
                    className={`px-3.5 py-2.5 flex items-center gap-3 hover:bg-orange-50/50 transition cursor-pointer group ${
                      m.unread ? 'bg-orange-50/20' : 'bg-white'
                    }`}
                    title={lang === 'vi' ? 'Nhấn để mở email này trong Gmail' : 'Click to open this email directly in Gmail'}
                  >
                    {/* Sender Initial Avatar */}
                    <div
                      className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                        m.unread
                          ? 'bg-[#F26522] text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {sender.initial}
                    </div>

                    {/* Compact Single/Two-Line Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {m.unread && (
                            <span className="w-2 h-2 rounded-full bg-[#F26522] shrink-0" />
                          )}
                          <span className="text-xs font-bold text-slate-900 truncate max-w-[160px] group-hover:text-[#F26522]">
                            {sender.name}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate hidden sm:inline">
                            &lt;{sender.email}&gt;
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
                          <span>
                            {new Date(m.date).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-[#F26522] transition" />
                        </div>
                      </div>

                      <div className="flex items-baseline gap-1.5 mt-0.5 truncate">
                        <span className={`text-xs truncate ${m.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                          {m.subject}
                        </span>
                        <span className="text-slate-300">—</span>
                        <span className="text-[11px] text-slate-500 truncate">
                          {m.snippet}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 Cols: Quick Send Email via OAuth2 */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between">
          <form onSubmit={handleSendMail} className="space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">{t.quickSendEmail}</h3>
              <span className="text-[11px] text-slate-400">Gmail REST API v1</span>
            </div>

            <div>
              <label className="text-[11px] text-slate-500 block mb-1">To</label>
              <input
                type="email"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                placeholder={t.recipientPlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Subject</label>
              <input
                type="text"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
                placeholder={t.subjectPlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Message</label>
              <textarea
                rows={6}
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
                placeholder={t.bodyPlaceholder}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t.sendBtn}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   6. ADVANCED VPS & REMOTE SSH MANAGER TAB
============================================================================ */
function VpsManagerTab({
  lang,
  onToast,
}: {
  t: typeof translations['en'];
  lang: Lang;
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const isVi = lang === 'vi';
  const [servers, setServers] = useState<any[]>([]);
  const [sshKeys, setSshKeys] = useState<Array<{ name: string; path: string }>>([]);
  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [addingOpen, setAddingOpen] = useState(false);

  // Add VPS form
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [keyPath, setKeyPath] = useState('~/.ssh/id_rsa');
  const [tags, setTags] = useState('Ubuntu, Docker');

  // Remote execution & Terminal console
  const [remoteCmd, setRemoteCmd] = useState('uname -a && uptime && df -h / && free -m');
  const [consoleLog, setConsoleLog] = useState<string>('');
  const [runningCmd, setRunningCmd] = useState(false);
  const [copiedSsh, setCopiedSsh] = useState(false);

  const loadServers = async () => {
    const res = await fetch('/api/vps/servers');
    const data = await res.json();
    const list = data.servers || [];
    setServers(list);
    setSshKeys(data.keys || []);
    if (!selectedServer && list.length > 0) {
      setSelectedServer(list[0]);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host.trim()) return;
    const res = await fetch('/api/vps/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim() || host.trim(),
        host: host.trim(),
        port: Number(port) || 22,
        username: username.trim() || 'root',
        authType: 'key',
        keyPath,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setServers(data.servers);
      setSelectedServer(data.servers[0]);
      setAddingOpen(false);
      setName('');
      setHost('');
      onToast(isVi ? 'Đã lưu cấu hình máy chủ VPS!' : 'Saved VPS server profile!');
    }
  };

  const handleDeleteServer = async (id: string) => {
    const res = await fetch(`/api/vps/servers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    setServers(data.servers || []);
    if (selectedServer?.id === id) {
      setSelectedServer(data.servers?.[0] || null);
    }
    onToast(isVi ? 'Đã xóa VPS' : 'Removed VPS profile');
  };

  const handleLaunchNativeTerminal = async (srv: any) => {
    const res = await fetch('/api/vps/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(srv),
    });
    const data = await res.json();
    onToast(data.message, data.ok ? 'ok' : 'err');
  };

  const handleRunRemoteCommand = async (cmdOverride?: string) => {
    if (!selectedServer) return;
    const cmdToRun = cmdOverride || remoteCmd;
    if (!cmdToRun.trim()) return;
    if (cmdOverride) setRemoteCmd(cmdOverride);

    setRunningCmd(true);
    setConsoleLog((prev) => `${prev ? prev + '\n\n' : ''}$ ssh ${selectedServer.username}@${selectedServer.host} "${cmdToRun}"\n⏳ Connecting...`);

    try {
      const res = await fetch('/api/vps/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server: selectedServer, command: cmdToRun }),
      });
      const data = await res.json();
      setConsoleLog((prev) => prev.replace('⏳ Connecting...', data.output));
    } catch (err: any) {
      setConsoleLog((prev) => prev.replace('⏳ Connecting...', `Error: ${err.message}`));
    } finally {
      setRunningCmd(false);
    }
  };

  const handlePingVps = async (srv: any) => {
    setRunningCmd(true);
    setConsoleLog((prev) => `${prev ? prev + '\n\n' : ''}$ ping -c 3 ${srv.host}\n⏳ Pinging VPS...`);
    try {
      const res = await fetch('/api/network/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: srv.host, count: 3 }),
      });
      const data = await res.json();
      setConsoleLog((prev) => prev.replace('⏳ Pinging VPS...', data.output || 'No response'));
    } finally {
      setRunningCmd(false);
    }
  };

  const getSshCliString = (srv: any) => {
    const k = srv.keyPath ? `-i ${srv.keyPath} ` : '';
    const p = srv.port && srv.port !== 22 ? `-p ${srv.port} ` : '';
    return `ssh ${p}${k}${srv.username}@${srv.host}`;
  };

  const quickPresets = [
    { label: isVi ? 'Kiểm tra CPU/RAM/Disk' : 'System Health (CPU/RAM/Disk)', cmd: 'uname -a && uptime && free -h && df -h /' },
    { label: 'Docker Containers (docker ps)', cmd: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"' },
    { label: 'Top Processes', cmd: 'ps aux --sort=-%cpu | head -n 10' },
    { label: 'Nginx / Web Ports', cmd: 'ss -tulnp | grep -E "80|443|3000|4000|8080" || netstat -tuln' },
    { label: 'Recent Auth Logs', cmd: 'tail -n 15 /var/log/auth.log 2>/dev/null || journalctl -n 15 --no-pager' },
  ];

  return (
    <div className="space-y-5">
      {/* Top Header Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              {isVi ? 'Trung Tâm Quản Lý Máy Chủ VPS & SSH (Nâng Cao)' : 'Advanced VPS & Remote Server SSH Manager'}
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#F26522] border border-orange-200">
              PRO FEATURE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {isVi
              ? 'Lưu danh sách VPS, mở Terminal SSH gốc chỉ với 1 click, kiểm tra Ping hoặc chạy lệnh quản trị từ xa (Docker, RAM, Disk, Nginx).'
              : 'Manage remote Linux/Cloud VPS profiles, launch native OS SSH terminal in 1 click, test latency, or run remote health checks.'}
          </p>
        </div>

        <button
          onClick={() => setAddingOpen(!addingOpen)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span>{isVi ? '+ Thêm Máy Chủ VPS' : '+ Add VPS Server'}</span>
        </button>
      </div>

      {/* Collapsible Add VPS Form */}
      {addingOpen && (
        <form onSubmit={handleSaveServer} className="p-5 rounded-xl bg-white border-2 border-orange-200 shadow-sm space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">
              {isVi ? 'Thêm Cấu Hình Máy Chủ VPS Mới' : 'Add New Remote VPS Profile'}
            </h4>
            <span className="text-[11px] text-slate-400">Saved locally in .local-vps-servers.json</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">{isVi ? 'Tên gợi nhớ' : 'Server Name'}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production Ubuntu VPS"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Host / IP Address *</label>
              <input
                type="text"
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="103.145.67.89 or vps.domain.com"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">SSH User</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="root"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="22"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">SSH Private Key Path</label>
              <input
                type="text"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
                placeholder="~/.ssh/id_rsa"
                list="local-ssh-keys"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 font-mono"
              />
              <datalist id="local-ssh-keys">
                {sshKeys.map((k) => (
                  <option key={k.path} value={k.path} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Tags</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Production, Docker, Nginx"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="flex-1 py-1.5 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white font-bold cursor-pointer"
              >
                {isVi ? 'Lưu Máy Chủ' : 'Save VPS'}
              </button>
              <button
                type="button"
                onClick={() => setAddingOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold cursor-pointer"
              >
                {isVi ? 'Đóng' : 'Cancel'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Main Grid: Left Server Cards | Right Remote SSH Console & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 5 Cols: Saved VPS Profiles */}
        <div className="lg:col-span-5 space-y-3">
          {servers.map((srv) => {
            const isSelected = selectedServer?.id === srv.id;
            return (
              <div
                key={srv.id}
                onClick={() => setSelectedServer(srv)}
                className={`p-4 rounded-xl bg-white border transition cursor-pointer shadow-2xs ${
                  isSelected ? 'border-2 border-[#F26522]' : 'border-slate-200 hover:border-orange-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected
                          ? 'bg-[#F26522] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      VPS
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{srv.name}</div>
                      <div className="text-xs font-mono text-slate-500">
                        {srv.username}@{srv.host}:{srv.port}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteServer(srv.id);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete VPS Profile"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tags */}
                {srv.tags && srv.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {srv.tags.map((tag: string, i: number) => (
                      <span
                        key={i}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                    {srv.keyPath && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Key: {srv.keyPath}
                      </span>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchNativeTerminal(srv);
                    }}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-[#1B2537] hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5 text-[#F26522]" />
                    <span>{isVi ? 'Mở Terminal SSH' : 'Open Native SSH Terminal'}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedServer(srv);
                      handlePingVps(srv);
                    }}
                    className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Ping
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right 7 Cols: Remote Command Runner & SSH Output Console */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4">
          {selectedServer ? (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {selectedServer.name} ({selectedServer.username}@{selectedServer.host})
                    </h4>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {getSshCliString(selectedServer)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getSshCliString(selectedServer));
                        setCopiedSsh(true);
                        setTimeout(() => setCopiedSsh(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      {copiedSsh ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSsh ? 'Copied' : 'Copy SSH'}</span>
                    </button>
                    <button
                      onClick={() => handleLaunchNativeTerminal(selectedServer)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isVi ? 'Mở Cửa Sổ Terminal' : 'Launch Terminal App'}</span>
                    </button>
                  </div>
                </div>

                {/* One-Click Remote Preset Chips */}
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {isVi ? 'Lệnh Quản Trị VPS Nhanh (1-Click)' : 'Quick Remote SSH Presets (1-Click)'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPresets.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handleRunRemoteCommand(p.cmd)}
                        disabled={runningCmd}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-orange-50 hover:text-[#F26522] hover:border-orange-200 border border-slate-200 text-xs font-medium text-slate-700 transition cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom SSH Command Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunRemoteCommand();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={remoteCmd}
                    onChange={(e) => setRemoteCmd(e.target.value)}
                    placeholder="Enter remote bash command (e.g. docker ps, df -h, systemctl status nginx)..."
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 focus:outline-none focus:border-[#F26522]"
                  />
                  <button
                    type="submit"
                    disabled={runningCmd}
                    className="px-4 py-2 rounded-lg bg-[#1B2537] hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 text-[#F26522]" />
                    <span>{runningCmd ? (isVi ? 'Đang chạy...' : 'Running...') : isVi ? 'Thực thi SSH' : 'Run via SSH'}</span>
                  </button>
                </form>
              </div>

              {/* Dark SSH Terminal Output Console */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono">SSH Remote Output Console</span>
                  {consoleLog && (
                    <button
                      onClick={() => setConsoleLog('')}
                      className="hover:text-slate-600 underline cursor-pointer"
                    >
                      Clear Console
                    </button>
                  )}
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto h-64 overflow-y-auto leading-relaxed border border-slate-800">
                  {consoleLog ||
                    (isVi
                      ? `# Chọn một máy chủ VPS và nhấn "Thực thi SSH" hoặc "Mở Terminal SSH" để điều khiển trực tiếp.\n# Hỗ trợ xác thực bằng SSH Key (~/.ssh/id_rsa, id_ed25519).`
                      : `# Select a VPS server and click "Run via SSH" or "Launch Terminal App" for interactive shell access.\n# Supports SSH key authentication (~/.ssh/id_rsa, id_ed25519).`)}
                </pre>
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              {isVi ? 'Hãy thêm hoặc chọn 1 máy chủ VPS bên trái' : 'Add or select a VPS server on the left'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   7. SCREEN CAPTURE, SCREEN RECORDER & AUDIO RECORDER STUDIO TAB
============================================================================ */
function MediaStudioTab({
  lang,
  onToast,
}: {
  t: typeof translations['en'];
  lang: Lang;
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const isVi = lang === 'vi';
  const [mediaDir, setMediaDir] = useState<string>('~/Desktop/SmartMac-Captures');
  const [items, setItems] = useState<any[]>([]);
  const [capturingOs, setCapturingOs] = useState(false);

  // Screen Recording State
  const [screenRecActive, setScreenRecActive] = useState(false);
  const [screenWithMic, setScreenWithMic] = useState(true);
  const [screenSeconds, setScreenSeconds] = useState(0);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const screenTimerRef = useRef<any>(null);

  // Audio Recording State
  const [audioRecActive, setAudioRecActive] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioTimerRef = useRef<any>(null);

  const loadMediaList = async () => {
    try {
      const res = await fetch('/api/media/list');
      const data = await res.json();
      if (data.dir) setMediaDir(data.dir);
      setItems(data.items || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadMediaList();
    return () => {
      if (screenTimerRef.current) clearInterval(screenTimerRef.current);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      audioStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  // 1A. OS Native Fullscreen / Interactive Screenshot
  const handleNativeOsScreenshot = async (mode: 'fullscreen' | 'interactive') => {
    setCapturingOs(true);
    try {
      const res = await fetch('/api/media/screenshot-os', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      onToast(data.message, data.ok ? 'ok' : 'err');
      if (data.ok) loadMediaList();
    } finally {
      setCapturingOs(false);
    }
  };

  // 1B. Browser Picker Screen/Window/Tab Snapshot (works across all OSes without OS permissions)
  const handleBrowserSnapshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      track.stop();
      stream.getTracks().forEach((t) => t.stop());

      const base64Data = canvas.toDataURL('image/png');
      const filename = `ScreenCapture_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      const res = await fetch('/api/media/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, base64Data, type: 'screenshot' }),
      });
      const data = await res.json();
      onToast(data.message, data.ok ? 'ok' : 'err');
      loadMediaList();
    } catch (err: any) {
      onToast(err.message || 'Screen capture cancelled', 'err');
    }
  };

  // 2. Start / Stop Screen Video Recording
  const handleStartScreenRecording = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });

      let combinedStream = displayStream;
      if (screenWithMic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          combinedStream = new MediaStream([
            ...displayStream.getVideoTracks(),
            ...displayStream.getAudioTracks(),
            ...micStream.getAudioTracks(),
          ]);
        } catch {
          // Proceed with display stream only if mic permission declined
        }
      }

      screenStreamRef.current = combinedStream;
      if (screenVideoPreviewRef.current) {
        screenVideoPreviewRef.current.srcObject = displayStream;
        screenVideoPreviewRef.current.play().catch(() => {});
      }

      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm';
      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (screenTimerRef.current) clearInterval(screenTimerRef.current);
        setScreenRecActive(false);
        setScreenSeconds(0);
        combinedStream.getTracks().forEach((t) => t.stop());
        if (screenVideoPreviewRef.current) {
          screenVideoPreviewRef.current.srcObject = null;
        }

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'video/webm' });
        const base64Data = await blobToBase64(blob);
        const filename = `ScreenRecord_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

        onToast(isVi ? 'Đang lưu video quay màn hình...' : 'Saving screen recording...');
        const res = await fetch('/api/media/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, base64Data, type: 'video' }),
        });
        const data = await res.json();
        onToast(data.message, data.ok ? 'ok' : 'err');
        loadMediaList();
      };

      // Also stop if user clicks native browser "Stop sharing" button
      displayStream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };

      screenRecorderRef.current = recorder;
      recorder.start(1000);
      setScreenRecActive(true);
      setScreenSeconds(0);
      screenTimerRef.current = setInterval(() => {
        setScreenSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      onToast(err.message || 'Screen recording cancelled', 'err');
    }
  };

  const handleStopScreenRecording = () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      screenRecorderRef.current.stop();
    }
  };

  // 3. Start / Stop Microphone Audio Recording
  const handleStartAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioStreamRef.current = stream;

      const chunks: BlobPart[] = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        if (audioTimerRef.current) clearInterval(audioTimerRef.current);
        setAudioRecActive(false);
        setAudioSeconds(0);
        stream.getTracks().forEach((t) => t.stop());

        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const base64Data = await blobToBase64(blob);
        const filename = `AudioRecord_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;

        const res = await fetch('/api/media/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, base64Data, type: 'audio' }),
        });
        const data = await res.json();
        onToast(data.message, data.ok ? 'ok' : 'err');
        loadMediaList();
      };

      audioRecorderRef.current = recorder;
      recorder.start(500);
      setAudioRecActive(true);
      setAudioSeconds(0);
      audioTimerRef.current = setInterval(() => {
        setAudioSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      onToast(err.message || 'Microphone access denied', 'err');
    }
  };

  const handleStopAudioRecording = () => {
    if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
      audioRecorderRef.current.stop();
    }
  };

  const handleDeleteMedia = async (name: string) => {
    const res = await fetch(`/api/media/file/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await res.json();
    onToast(data.message, data.ok ? 'ok' : 'err');
    loadMediaList();
  };

  const handleRevealFolder = async (filePath?: string) => {
    await fetch('/api/files/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath || mediaDir }),
    });
    onToast(isVi ? 'Đã mở thư mục trong Finder / Explorer' : 'Revealed in Finder / Explorer');
  };

  return (
    <div className="space-y-5">
      {/* Top Studio Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              {isVi
                ? 'Studio Chụp Màn Hình, Quay Video Màn Hình & Ghi Âm'
                : 'Screen Capture, Screen Recorder & Audio Studio'}
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">
              MEDIA STUDIO
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            {isVi ? 'Thư mục lưu tự động:' : 'Auto-saved to:'} {mediaDir}
          </p>
        </div>

        <button
          onClick={() => handleRevealFolder()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#F26522]" />
          <span>{isVi ? 'Mở Thư Mục Lưu File' : 'Open Captures Folder'}</span>
        </button>
      </div>

      {/* 3 Studio Control Cards: 1. Capture Screen | 2. Record Screen Video | 3. Record Audio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CARD 1: CAPTURE SCREEN (SCREENSHOT) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-orange-50 text-[#F26522]">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {isVi ? '1. Chụp Màn Hình (Capture Screen)' : '1. Capture Screen (Screenshot)'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isVi ? 'Chụp toàn màn hình hoặc chọn cửa sổ' : 'Instant OS fullscreen or window picker'}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 pt-1">
              {isVi
                ? 'Hỗ trợ chụp trực tiếp qua lệnh gốc của Hệ điều hành (macOS screencapture / Windows) hoặc chọn cửa sổ cụ thể.'
                : 'Capture your entire desktop immediately via native OS utility or pick a specific window/tab.'}
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => handleNativeOsScreenshot('fullscreen')}
              disabled={capturingOs}
              className="w-full py-2.5 px-4 rounded-xl bg-[#F26522] hover:bg-orange-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              <span>
                {capturingOs
                  ? isVi
                    ? 'Đang chụp...'
                    : 'Capturing...'
                  : isVi
                  ? 'Chụp Toàn Màn Hình Ngay (OS)'
                  : 'Instant Fullscreen Capture (OS)'}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleNativeOsScreenshot('interactive')}
                disabled={capturingOs}
                className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                {isVi ? 'Chọn Vùng (OS)' : 'Select Area (OS)'}
              </button>
              <button
                onClick={handleBrowserSnapshot}
                className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                {isVi ? 'Chọn Cửa Sổ / Tab' : 'Pick Window / Tab'}
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: RECORD SCREEN VIDEO */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${screenRecActive ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {isVi ? '2. Quay Video Màn Hình (Record Screen)' : '2. Record Screen Video'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {screenRecActive
                      ? `🔴 REC ${formatTimer(screenSeconds)}`
                      : isVi
                      ? 'Quay màn hình 30fps kèm âm thanh'
                      : '30fps HD video + system/mic audio'}
                  </p>
                </div>
              </div>
              {screenRecActive && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold animate-pulse">
                  {formatTimer(screenSeconds)}
                </span>
              )}
            </div>

            {/* Live Mini Video Preview while recording */}
            <div className="relative h-24 rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-200">
              <video
                ref={screenVideoPreviewRef}
                muted
                playsInline
                className={`w-full h-full object-contain ${screenRecActive ? 'block' : 'hidden'}`}
              />
              {!screenRecActive && (
                <span className="text-[11px] text-slate-400">
                  {isVi ? 'Khung xem trước trực tiếp khi quay' : 'Live screen preview appears here'}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={screenWithMic}
                onChange={(e) => setScreenWithMic(e.target.checked)}
                disabled={screenRecActive}
                className="rounded text-[#F26522]"
              />
              <span>{isVi ? 'Thu kèm giọng nói Microphone' : 'Include Microphone voice audio'}</span>
            </label>

            {!screenRecActive ? (
              <button
                onClick={handleStartScreenRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1B2537] hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Video className="w-4 h-4 text-[#F26522]" />
                <span>{isVi ? 'Bắt Đầu Quay Màn Hình' : 'Start Screen Recording'}</span>
              </button>
            ) : (
              <button
                onClick={handleStopScreenRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>
                  {isVi ? `Dừng & Lưu Video (${formatTimer(screenSeconds)})` : `Stop & Save Video (${formatTimer(screenSeconds)})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* CARD 3: RECORD AUDIO (VOICE / MICROPHONE) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${audioRecActive ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-emerald-50 text-emerald-600'}`}>
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {isVi ? '3. Ghi Âm Giọng Nói (Record Audio)' : '3. Record Audio (Voice / Mic)'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {audioRecActive
                      ? `🔴 REC ${formatTimer(audioSeconds)}`
                      : isVi
                      ? 'Ghi âm chất lượng cao từ Microphone'
                      : 'High-clarity Opus audio recording'}
                  </p>
                </div>
              </div>
              {audioRecActive && (
                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold animate-pulse">
                  {formatTimer(audioSeconds)}
                </span>
              )}
            </div>

            {/* Audio Waveform Visualizer */}
            <div className="h-24 rounded-lg bg-slate-50 border border-slate-200 flex flex-col items-center justify-center p-3">
              {audioRecActive ? (
                <div className="space-y-2 text-center">
                  <div className="flex items-center justify-center gap-1 h-8">
                    {[40, 85, 55, 95, 65, 90, 50, 80, 60, 95, 45, 75].map((h, i) => (
                      <span
                        key={i}
                        className="w-1.5 rounded-full bg-[#F26522] animate-pulse"
                        style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
                      />
                    ))}
                  </div>
                  <div className="text-xs font-extrabold text-rose-600">
                    {isVi ? 'Đang thu âm Microphone...' : 'Recording Microphone...'} ({formatTimer(audioSeconds)})
                  </div>
                </div>
              ) : (
                <div className="text-center text-[11px] text-slate-400">
                  {isVi
                    ? 'Nhấn "Bắt Đầu Ghi Âm" để thu giọng nói hoặc cuộc họp và tự động lưu vào máy.'
                    : 'Click "Start Audio Recording" to record voice notes or meetings directly to disk.'}
                </div>
              )}
            </div>
          </div>

          <div>
            {!audioRecActive ? (
              <button
                onClick={handleStartAudioRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span>{isVi ? 'Bắt Đầu Ghi Âm' : 'Start Audio Recording'}</span>
              </button>
            ) : (
              <button
                onClick={handleStopAudioRecording}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Square className="w-4 h-4" />
                <span>
                  {isVi ? `Dừng & Lưu File Ghi Âm (${formatTimer(audioSeconds)})` : `Stop & Save Audio (${formatTimer(audioSeconds)})`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Captured Media Gallery (Screenshots, Screen Recordings, Audio Clips) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {isVi ? `Thư Viện Đã Chụp & Ghi (${items.length})` : `Captured Media Library (${items.length})`}
            </h4>
            <p className="text-xs text-slate-400">
              {isVi
                ? 'Xem trực tiếp ảnh chụp màn hình, phát lại video quay màn hình hoặc nghe lại file ghi âm'
                : 'Preview screenshots, play back screen recordings, or listen to recorded audio clips'}
            </p>
          </div>
          <button
            onClick={loadMediaList}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            {isVi
              ? 'Chưa có ảnh chụp, video hoặc bản ghi âm nào. Hãy dùng 3 công cụ phía trên để bắt đầu!'
              : 'No screenshots, screen recordings, or audio clips yet. Use the 3 studio cards above to capture!'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.name}
                className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Media Player / Image Thumbnail */}
                  <div className="h-44 bg-slate-900 flex items-center justify-center overflow-hidden relative">
                    {item.type === 'screenshot' && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="w-full h-full block">
                        <img src={item.url} alt={item.name} className="w-full h-full object-cover hover:scale-105 transition" />
                      </a>
                    )}
                    {item.type === 'video' && (
                      <video src={item.url} controls className="w-full h-full object-contain" />
                    )}
                    {item.type === 'audio' && (
                      <div className="w-full p-4 flex flex-col items-center justify-center gap-3">
                        <Mic className="w-8 h-8 text-emerald-400" />
                        <audio src={item.url} controls className="w-full" />
                      </div>
                    )}
                    <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-black/70 text-white">
                      {item.type}
                    </span>
                  </div>

                  {/* Metadata */}
                  <div className="p-3">
                    <div className="text-xs font-bold text-slate-900 truncate" title={item.name}>
                      {item.name}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>{formatBytes(item.size)}</span>
                      <span>
                        {new Date(item.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-3 py-2 bg-white border-t border-slate-200/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <a
                      href={item.url}
                      download={item.name}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>{isVi ? 'Tải về' : 'Download'}</span>
                    </a>
                    <button
                      onClick={() => handleRevealFolder(item.path)}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer"
                    >
                      Finder
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteMedia(item.name)}
                    className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   8. AI AGENT CHAT DRAWER
============================================================================ */
function AIAgentDrawer({
  t,
  lang,
  onClose,
  onToast,
}: {
  t: typeof translations['en'];
  lang: Lang;
  onClose: () => void;
  onToast: (m: string, t?: 'ok' | 'err') => void;
}) {
  const [messages, setMessages] = useState<
    Array<{
      role: 'user' | 'assistant';
      content: string;
      actions?: Array<{ tool: string; status: string; summary: string }>;
    }>
  >([
    {
      role: 'assistant',
      content: t.aiWelcome,
    },
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === 'assistant') {
        return [{ role: 'assistant', content: t.aiWelcome }];
      }
      return prev;
    });
  }, [lang, t.aiWelcome]);

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const sendPrompt = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || thinking) return;
    if (!promptText) setInput('');

    const nextHistory = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextHistory);
    setThinking(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          lang,
          history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || data.error || 'Done.',
          actions: data.actions || [],
        },
      ]);
    } catch (err: any) {
      onToast(err.message, 'err');
    } finally {
      setThinking(false);
    }
  };

  return (
    <aside className="w-96 border-l border-slate-200 bg-white flex flex-col shrink-0 shadow-lg">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-[#1B2537] text-white">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#F26522] text-white">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold">{t.aiAssistantTitle}</h3>
            <p className="text-[11px] text-slate-300">{t.aiAssistantSub}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-white p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-1.5 overflow-x-auto">
        {t.suggestions.map((s) => (
          <button
            key={s}
            onClick={() => sendPrompt(s)}
            className="px-2.5 py-1 rounded-md bg-white hover:bg-orange-50 hover:text-[#F26522] text-[11px] font-medium text-slate-600 border border-slate-200 shrink-0 transition cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs bg-[#F8F9FA]">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3.5 py-2.5 leading-relaxed shadow-2xs ${
                m.role === 'user'
                  ? 'bg-[#F26522] text-white font-medium'
                  : 'bg-white border border-slate-200 text-slate-800'
              }`}
            >
              {m.actions && m.actions.length > 0 && (
                <div className="mb-2 space-y-1">
                  {m.actions.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded bg-slate-50 text-emerald-700 border border-slate-200"
                    >
                      <Terminal className="w-3 h-3 shrink-0" />
                      <span className="truncate">{a.summary}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
        {thinking && (
          <div className="text-xs text-slate-500 flex items-center gap-2 px-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F26522]" />
            <span>{t.aiExecuting}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendPrompt();
        }}
        className="p-3 border-t border-slate-200 bg-white flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.aiInputPlaceholder}
          className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#F26522]"
        />
        <button
          type="submit"
          disabled={thinking}
          className="p-2 rounded-lg bg-[#F26522] hover:bg-orange-600 text-white transition disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </aside>
  );
}
