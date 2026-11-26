import { getSystemSnapshot, runQuickSystemAction } from './system.js';
import { getTopProcesses, launchApplication, quitApplication, killProcessByPid } from './processes.js';
import { listDirectory, createFolder } from './files.js';
import { getNetworkOverview, runPingDiagnostic } from './network.js';
import { fetchGmailMessages, openExternalWebApp, loadConfig } from './social.js';
import os from 'os';
import path from 'path';
function formatBytes(bytes) {
    if (!bytes || bytes <= 0)
        return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
export async function processAgentMessage(userMessage, history = [], lang = 'vi') {
    const isVi = lang === 'vi';
    const actions = [];
    const lower = userMessage.toLowerCase().trim();
    // Check for deterministic natural language intents first so it works instantaneously even without an API key
    // 1. Launch app intent: "open <app>", "launch <app>", "start <app>"
    const openAppMatch = userMessage.match(/^(?:open|launch|start|run)\s+(?:app\s+)?([a-zA-Z0-9 ._-]+)$/i);
    if (openAppMatch) {
        const target = openAppMatch[1].trim();
        if (['gmail', 'mail'].includes(target.toLowerCase())) {
            const res = await openExternalWebApp('gmail');
            actions.push({ tool: 'openExternalWebApp', status: res.ok ? 'ok' : 'error', summary: res.message });
            return { reply: `I've opened **Gmail** in your default browser.`, actions };
        }
        const res = await launchApplication(target);
        actions.push({ tool: 'launchApplication', status: res.ok ? 'ok' : 'error', summary: res.message });
        return {
            reply: res.ok
                ? `Launched **${target}** on your Mac.`
                : `I tried launching **${target}**, but macOS returned: \`${res.message}\``,
            actions,
        };
    }
    // 2. Quit / close app intent
    const quitAppMatch = userMessage.match(/^(?:quit|close|exit)\s+(?:app\s+)?([a-zA-Z0-9 ._-]+)$/i);
    if (quitAppMatch) {
        const target = quitAppMatch[1].trim();
        const res = await quitApplication(target);
        actions.push({ tool: 'quitApplication', status: res.ok ? 'ok' : 'error', summary: res.message });
        return {
            reply: res.ok ? `Sent a quit signal to **${target}**.` : `Could not quit **${target}**: ${res.message}`,
            actions,
        };
    }
    // 3. Kill PID intent
    const killPidMatch = userMessage.match(/kill\s+(?:pid\s+)?(\d+)/i);
    if (killPidMatch) {
        const pid = parseInt(killPidMatch[1], 10);
        const res = await killProcessByPid(pid, lower.includes('force') || lower.includes('-9'));
        actions.push({ tool: 'killProcessByPid', status: res.ok ? 'ok' : 'error', summary: res.message });
        return {
            reply: res.message,
            actions,
        };
    }
    // 4. Ping intent
    const pingMatch = userMessage.match(/ping\s+([a-zA-Z0-9.-]+)/i);
    if (pingMatch) {
        const host = pingMatch[1];
        const res = await runPingDiagnostic(host, 3);
        actions.push({
            tool: 'runPingDiagnostic',
            status: res.ok ? 'ok' : 'error',
            summary: `Ping ${host}: ${res.avgLatencyMs ? res.avgLatencyMs + ' ms avg' : 'failed'}`,
        });
        return {
            reply: `### Ping Results for \`${host}\`\n- **Average Latency:** ${res.avgLatencyMs !== null ? `${res.avgLatencyMs} ms` : 'Unreachable'}\n\`\`\`\n${res.output.trim()}\n\`\`\``,
            actions,
        };
    }
    // 5. Flush DNS / Dark Mode / Audio mute quick system actions
    if (lower.includes('flush dns')) {
        const res = await runQuickSystemAction('flush_dns');
        actions.push({ tool: 'runQuickSystemAction', status: res.ok ? 'ok' : 'error', summary: res.message });
        return { reply: res.message, actions };
    }
    if (lower.includes('dark mode')) {
        const res = await runQuickSystemAction('toggle_dark_mode');
        actions.push({ tool: 'runQuickSystemAction', status: res.ok ? 'ok' : 'error', summary: res.message });
        return { reply: res.message, actions };
    }
    if (lower.includes('unmute')) {
        const res = await runQuickSystemAction('unmute_audio');
        actions.push({ tool: 'runQuickSystemAction', status: res.ok ? 'ok' : 'error', summary: res.message });
        return { reply: res.message, actions };
    }
    if (lower.includes('mute')) {
        const res = await runQuickSystemAction('mute_audio');
        actions.push({ tool: 'runQuickSystemAction', status: res.ok ? 'ok' : 'error', summary: res.message });
        return { reply: res.message, actions };
    }
    // 6. Create folder intent
    const createFolderMatch = userMessage.match(/create\s+(?:a\s+)?folder\s+(?:named\s+|called\s+)?["']?([^"']+)["']?/i);
    if (createFolderMatch) {
        const rawName = createFolderMatch[1].trim();
        const targetPath = rawName.startsWith('/') || rawName.startsWith('~')
            ? rawName
            : path.join(os.homedir(), 'Desktop', rawName);
        const res = await createFolder(targetPath);
        actions.push({ tool: 'createFolder', status: 'ok', summary: `Created ${res.path}` });
        return {
            reply: `Created folder at \`${res.path}\`.`,
            actions,
        };
    }
    // Gather live system context for AI or smart local responder
    const [sys, procs, net] = await Promise.all([
        getSystemSnapshot(),
        getTopProcesses(10),
        getNetworkOverview(),
    ]);
    const cfg = await loadConfig();
    const apiKey = cfg.geminiApiKey || process.env.GEMINI_API_KEY;
    // If Gemini API key is configured, call Gemini 2.5 Flash REST API directly with live system context
    if (apiKey) {
        try {
            const systemContext = JSON.stringify({
                hostname: sys.hostname,
                platform: sys.platform,
                arch: sys.arch,
                cpu: {
                    brand: sys.cpu.brand,
                    cores: sys.cpu.cores,
                    currentLoadPercent: sys.cpu.currentLoad,
                },
                memory: {
                    total: formatBytes(sys.memory.total),
                    used: formatBytes(sys.memory.used),
                    usagePercent: sys.memory.usagePercent,
                },
                battery: sys.battery,
                disks: sys.disks.map((d) => ({
                    mount: d.mount,
                    used: formatBytes(d.used),
                    available: formatBytes(d.available),
                    usePercent: d.usePercent,
                })),
                wifi: net.wifi,
                topProcesses: procs.list.slice(0, 8),
            }, null, 2);
            actions.push({
                tool: 'getSystemTelemetry',
                status: 'ok',
                summary: `Inspected CPU (${sys.cpu.currentLoad}%), RAM (${sys.memory.usagePercent}%), Wi-Fi (${net.wifi.ssid || 'N/A'})`,
            });
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        ...history.slice(-6).map((h) => ({
                            role: h.role === 'assistant' ? 'model' : 'user',
                            parts: [{ text: h.content }],
                        })),
                        {
                            role: 'user',
                            parts: [
                                {
                                    text: `You are "SmartMac Agent", a local system administrator AI assistant running directly on the user's computer (${isVi ? 'Respond in Vietnamese' : 'Respond in English'}).
Current live system telemetry:
${systemContext}

Answer the user's request concisely with helpful markdown formatting.
User request: ${userMessage}`,
                                },
                            ],
                        },
                    ],
                }),
            });
            const geminiJson = await geminiRes.json();
            const textReply = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textReply) {
                return {
                    reply: textReply,
                    actions,
                };
            }
        }
        catch (err) {
            actions.push({
                tool: 'geminiModelFallback',
                status: 'error',
                summary: `Gemini API warning (${err.message}), using built-in local intelligence`,
            });
        }
    }
    // Built-in Local Intelligence Engine (works 100% offline with zero API keys required)
    if (lower.includes('cpu') || lower.includes('ram') || lower.includes('memory') || lower.includes('status') || lower.includes('health') || lower.includes('system') || lower.includes('gpu') || lower.includes('battery')) {
        actions.push({
            tool: 'getSystemSnapshot',
            status: 'ok',
            summary: `Read live CPU (${sys.cpu.currentLoad}%), RAM (${sys.memory.usagePercent}%), Disk & Battery`,
        });
        const disk = sys.disks[0];
        return {
            reply: `### Live Mac Health Report (\`${sys.hostname}\`)
- **Processor:** ${sys.cpu.brand} (${sys.cpu.cores} cores) — **${sys.cpu.currentLoad}%** load (${sys.cpu.loadUser}% user / ${sys.cpu.loadSystem}% sys)
- **Memory (RAM):** **${formatBytes(sys.memory.used)}** / ${formatBytes(sys.memory.total)} (**${sys.memory.usagePercent}%** active)
- **GPU:** ${sys.gpu.map((g) => g.model).join(', ')}
- **Battery:** ${sys.battery.hasBattery ? `**${sys.battery.percent}%** (${sys.battery.isCharging ? 'Charging' : sys.battery.acConnected ? 'AC Power' : 'On Battery'})` : 'AC Power'}
- **Primary Disk (\`${disk?.mount || '/'}\`):** ${disk ? `${formatBytes(disk.used)} used of ${formatBytes(disk.size)} (**${disk.usePercent}%**)` : 'N/A'}
- **Top CPU Process:** \`${procs.list[0]?.name || 'None'}\` (PID ${procs.list[0]?.pid || 0} at ${procs.list[0]?.cpu || 0}% CPU)`,
            actions,
        };
    }
    if (lower.includes('process') || lower.includes('running') || lower.includes('app') || lower.includes('slow') || lower.includes('hog')) {
        actions.push({
            tool: 'getTopProcesses',
            status: 'ok',
            summary: `Analyzed ${procs.all} processes (${procs.running} running)`,
        });
        const topLines = procs.list
            .slice(0, 8)
            .map((p, idx) => `${idx + 1}. **${p.name}** (PID \`${p.pid}\`) — **${p.cpu}%** CPU | **${p.mem}%** RAM`)
            .join('\n');
        return {
            reply: `### Top Active Processes (${procs.all} total)\n${topLines}\n\n*Tip: Type \`kill <PID>\` or \`quit <App Name>\` to stop any resource-heavy application.*`,
            actions,
        };
    }
    if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('network') || lower.includes('ip') || lower.includes('internet')) {
        actions.push({
            tool: 'getNetworkOverview',
            status: 'ok',
            summary: `Checked Wi-Fi (${net.wifi.ssid || 'Off'}) & interfaces`,
        });
        const activeIfaces = net.interfaces
            .filter((i) => i.ip4 && !i.internal)
            .map((i) => `- **${i.iface}** (${i.type || 'net'}): IPv4 \`${i.ip4}\` | MAC \`${i.mac}\``)
            .join('\n');
        return {
            reply: `### Wi-Fi & Network Summary
- **Wi-Fi Status:** ${net.wifi.enabled ? 'Enabled' : 'Disabled'} — SSID: **${net.wifi.ssid || 'Not connected'}**
- **Default Gateway:** \`${net.defaultGateway || 'N/A'}\`
- **DNS Servers:** ${net.dnsServers.map((d) => `\`${d}\``).join(', ') || 'Auto'}
- **Throughput:** ↓ ${formatBytes(sys.networkTraffic.rxSec)}/s | ↑ ${formatBytes(sys.networkTraffic.txSec)}/s
${activeIfaces ? `\n**Active Interfaces:**\n${activeIfaces}` : ''}

*Tip: Type \`ping 1.1.1.1\` or \`flush dns\` to test or reset connectivity.*`,
            actions,
        };
    }
    if (lower.includes('file') || lower.includes('folder') || lower.includes('desktop') || lower.includes('download')) {
        const targetDir = lower.includes('download')
            ? path.join(os.homedir(), 'Downloads')
            : lower.includes('desktop')
                ? path.join(os.homedir(), 'Desktop')
                : os.homedir();
        const dirData = await listDirectory(targetDir, false);
        actions.push({
            tool: 'listDirectory',
            status: 'ok',
            summary: `Listed ${dirData.entries.length} items in ${dirData.currentPath}`,
        });
        const sample = dirData.entries
            .slice(0, 10)
            .map((e) => `- ${e.isDirectory ? '[DIR]' : '[FILE]'} **${e.name}** ${e.isDirectory ? '' : `(${formatBytes(e.size)})`}`)
            .join('\n');
        return {
            reply: `### Contents of \`${dirData.currentPath}\` (${dirData.entries.length} items)\n${sample || '_Empty directory_'}\n\n*You can browse, preview, edit, or move files to Trash in the **Files & Folders** tab.*`,
            actions,
        };
    }
    if (lower.includes('gmail') || lower.includes('email') || lower.includes('mail')) {
        const gmailData = await fetchGmailMessages(5);
        actions.push({
            tool: 'fetchGmailStatus',
            status: 'ok',
            summary: `Gmail (${gmailData.mode})`,
        });
        const mailLines = gmailData.messages
            .slice(0, 5)
            .map((m) => `- **${m.subject}** — _${m.from}_`)
            .join('\n');
        return {
            reply: `### Gmail Status
- **Account:** ${gmailData.email || 'Not signed in'} (${gmailData.connected ? 'Connected via OAuth2' : 'Sign in via OAuth2 in the Gmail tab'})
${mailLines || '_No messages loaded yet. Please sign in with Google OAuth2 in the Gmail tab._'}`,
            actions,
        };
    }
    // Default comprehensive overview + command cheat sheet
    actions.push({
        tool: 'getSystemSnapshot',
        status: 'ok',
        summary: `System ready — CPU ${sys.cpu.currentLoad}%, RAM ${sys.memory.usagePercent}%`,
    });
    return {
        reply: `I'm your **Local Mac Housework Agent** running on \`${sys.hostname}\` (**${sys.cpu.brand}**, CPU **${sys.cpu.currentLoad}%**, RAM **${sys.memory.usagePercent}%**).

Here are some things you can ask me to do right now:
- **System & Hardware:** \`check system health\`, \`toggle dark mode\`, \`mute audio\`, \`unmute audio\`
- **Apps & Processes:** \`show top processes\`, \`open Safari\`, \`open Calculator\`, \`quit Notes\`, \`kill 1234\`
- **Wi-Fi & Network:** \`check wifi status\`, \`ping google.com\`, \`flush dns\`
- **Files & Folders:** \`show my desktop files\`, \`show downloads\`, \`create folder MyProject\`
- **Gmail & Facebook:** \`check my gmail and facebook\`, \`open gmail\`, \`open facebook\`, \`open messenger\`

*(Optional: Add a \`GEMINI_API_KEY\` in the **Settings / Social Hub** tab to unlock full open-ended Gemini 2.5 reasoning on top of your live system tools!)*`,
        actions,
    };
}
