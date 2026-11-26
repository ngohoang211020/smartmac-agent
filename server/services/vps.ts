import fs from 'fs/promises';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const VPS_STORE_PATH = path.join(process.cwd(), '.local-vps-servers.json');

export interface VpsServerProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'key' | 'password';
  keyPath?: string;
  tags?: string[];
}

export async function listVpsServers(): Promise<VpsServerProfile[]> {
  try {
    const raw = await fs.readFile(VPS_STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [
      {
        id: 'sample-vps-1',
        name: 'Production Ubuntu VPS',
        host: '103.145.67.89',
        port: 22,
        username: 'root',
        authType: 'key',
        keyPath: '~/.ssh/id_rsa',
        tags: ['Production', 'Docker', 'Nginx'],
      },
    ];
  }
}

export async function saveVpsServer(server: Omit<VpsServerProfile, 'id'> & { id?: string }): Promise<VpsServerProfile[]> {
  const existing = await listVpsServers();
  const id = server.id || `vps-${Date.now()}`;
  const newEntry: VpsServerProfile = {
    id,
    name: server.name || server.host,
    host: server.host.trim(),
    port: Number(server.port) || 22,
    username: server.username.trim() || 'root',
    authType: server.authType || 'key',
    keyPath: server.keyPath || '~/.ssh/id_rsa',
    tags: server.tags || ['VPS'],
  };
  const filtered = existing.filter((s) => s.id !== id);
  const updated = [newEntry, ...filtered];
  await fs.writeFile(VPS_STORE_PATH, JSON.stringify(updated, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return updated;
}

export async function deleteVpsServer(id: string): Promise<VpsServerProfile[]> {
  const existing = await listVpsServers();
  const updated = existing.filter((s) => s.id !== id);
  await fs.writeFile(VPS_STORE_PATH, JSON.stringify(updated, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return updated;
}

function buildSshCommand(srv: VpsServerProfile, remoteCmd?: string): string {
  const safeHost = srv.host.replace(/[^a-zA-Z0-9.-]/g, '');
  const safeUser = srv.username.replace(/[^a-zA-Z0-9._-]/g, '');
  const safePort = Number(srv.port) || 22;
  const keyFlag =
    srv.authType === 'key' && srv.keyPath
      ? `-i "${srv.keyPath.replace(/^~/, os.homedir()).replace(/"/g, '')}"`
      : '';
  const base = `ssh -p ${safePort} ${keyFlag} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=6 ${safeUser}@${safeHost}`;
  if (!remoteCmd) return base;
  return `${base} -o BatchMode=yes "${remoteCmd.replace(/"/g, '\\"')}"`;
}

/**
 * Opens an interactive native OS Terminal window (macOS Terminal.app, Windows PowerShell/WT, Linux x-terminal-emulator)
 * connected directly to the VPS via SSH
 */
export async function launchNativeSshTerminal(srv: VpsServerProfile): Promise<{ ok: boolean; message: string }> {
  const platform = os.platform();
  const sshCmd = buildSshCommand(srv);
  try {
    if (platform === 'darwin') {
      const escaped = sshCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await execAsync(`osascript -e 'tell application "Terminal" to activate' -e 'tell application "Terminal" to do script "${escaped}"'`);
      return { ok: true, message: `Opened macOS Terminal SSH session to ${srv.username}@${srv.host}` };
    } else if (platform === 'win32') {
      await execAsync(`cmd /c start powershell -NoExit -Command "${sshCmd}"`);
      return { ok: true, message: `Opened Windows PowerShell SSH session to ${srv.username}@${srv.host}` };
    } else {
      await execAsync(`x-terminal-emulator -e "${sshCmd}" || gnome-terminal -- bash -c "${sshCmd}; exec bash"`);
      return { ok: true, message: `Opened Linux Terminal SSH session to ${srv.username}@${srv.host}` };
    }
  } catch (err: any) {
    return { ok: false, message: `Failed to launch native terminal: ${err.message}` };
  }
}

/**
 * Executes a non-interactive SSH command on the remote VPS (requires SSH key / passwordless auth)
 */
export async function executeRemoteVpsCommand(
  srv: VpsServerProfile,
  command: string
): Promise<{ ok: boolean; output: string }> {
  try {
    const safeHost = (srv.host || '').replace(/[^a-zA-Z0-9.-]/g, '');
    const safeUser = (srv.username || 'root').replace(/[^a-zA-Z0-9._-]/g, '');
    const safePort = String(Number(srv.port) || 22);
    if (!safeHost) {
      return { ok: false, output: 'Invalid VPS host address' };
    }
    const sshArgs: string[] = [
      '-p',
      safePort,
      '-o',
      'StrictHostKeyChecking=accept-new',
      '-o',
      'ConnectTimeout=6',
      '-o',
      'BatchMode=yes',
    ];
    if (srv.authType === 'key' && srv.keyPath) {
      sshArgs.push('-i', srv.keyPath.replace(/^~/, os.homedir()));
    }
    sshArgs.push(`${safeUser}@${safeHost}`, command);

    const { stdout, stderr } = await execFileAsync('ssh', sshArgs, { timeout: 15000 });
    return {
      ok: true,
      output: (stdout || stderr || 'Command executed (no output)').trim(),
    };
  } catch (err: any) {
    return {
      ok: false,
      output: (err.stdout || err.stderr || err.message || 'SSH connection failed').trim(),
    };
  }
}

export async function listLocalSshKeys(): Promise<Array<{ name: string; path: string }>> {
  const sshDir = path.join(os.homedir(), '.ssh');
  try {
    const files = await fs.readdir(sshDir);
    return files
      .filter((f) => !f.endsWith('.pub') && !f.startsWith('known_hosts') && !f.startsWith('config') && !f.startsWith('.'))
      .map((f) => ({
        name: f,
        path: `~/.ssh/${f}`,
      }));
  } catch {
    return [];
  }
}
