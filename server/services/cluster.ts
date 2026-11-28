import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import type { Request, Response, NextFunction } from 'express';
import { getSystemSnapshot } from './system.js';
import { getTopProcesses } from './processes.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.SMARTMAC_DATA_DIR || process.cwd();
const NODES_STORE_PATH = path.join(DATA_DIR, '.local-cluster-nodes.json');

export interface ClusterNodeProfile {
  id: string;
  name: string;
  url: string; // e.g. http://103.145.67.89:4000
  secret: string; // matches SMARTMAC_NODE_SECRET on the VM
  tags: string[];
  addedAt: number;
}

export interface NodeTelemetryReport {
  nodeId: string;
  name: string;
  url: string;
  online: boolean;
  latencyMs: number;
  hostname?: string;
  platform?: string;
  arch?: string;
  uptime?: number;
  cpuLoad?: number;
  cpuCores?: number;
  ramPercent?: number;
  ramUsed?: number;
  ramTotal?: number;
  diskPercent?: number;
  diskFree?: number;
  dockerCount?: number;
  error?: string;
}

/**
 * Auth middleware for Agent Node endpoints (`/api/node/*`) when a VM runs in Agent mode
 */
export function nodeSecretAuthGuard(req: Request, res: Response, next: NextFunction) {
  const configuredSecret = process.env.SMARTMAC_NODE_SECRET;
  // If running locally without SMARTMAC_NODE_SECRET set, allow localhost requests only
  if (!configuredSecret) {
    return next();
  }
  const incoming = String(req.headers['x-node-secret'] || '');
  const a = Buffer.from(incoming);
  const b = Buffer.from(configuredSecret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid x-node-secret token' });
  }
  next();
}

/**
 * Local Node Capabilities (executed on the VM itself when Master queries /api/node/*)
 */
export async function getLocalNodeTelemetry() {
  const [sys, procs, docker] = await Promise.all([
    getSystemSnapshot(),
    getTopProcesses(10),
    listLocalDockerContainers(),
  ]);
  const primaryDisk = sys.disks[0];
  return {
    hostname: sys.hostname,
    platform: sys.platform,
    arch: sys.arch,
    uptime: sys.uptime,
    cpuLoad: sys.cpu.currentLoad,
    cpuCores: sys.cpu.cores,
    ramPercent: sys.memory.usagePercent,
    ramUsed: sys.memory.used,
    ramTotal: sys.memory.total,
    diskPercent: primaryDisk?.usePercent ?? 0,
    diskFree: primaryDisk?.available ?? 0,
    dockerCount: docker.containers.length,
    dockerRunning: docker.containers.filter((c) => c.state === 'running').length,
    topProcesses: procs.list.slice(0, 6),
  };
}

export async function listLocalDockerContainers(): Promise<{
  available: boolean;
  containers: Array<{
    id: string;
    name: string;
    image: string;
    status: string;
    state: string;
    ports: string;
  }>;
  error?: string;
}> {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '-a', '--format', '{{.ID}}||{{.Names}}||{{.Image}}||{{.Status}}||{{.State}}||{{.Ports}}'],
      { timeout: 6000 }
    );
    const containers = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, name, image, status, state, ports] = line.split('||');
        return {
          id: id || '',
          name: name || '',
          image: image || '',
          status: status || '',
          state: (state || '').toLowerCase(),
          ports: ports || '',
        };
      });
    return { available: true, containers };
  } catch (err: any) {
    return { available: false, containers: [], error: err.message };
  }
}

export async function runLocalDockerAction(
  containerId: string,
  action: 'start' | 'stop' | 'restart' | 'logs'
): Promise<{ ok: boolean; output: string }> {
  const safeId = (containerId || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeId) return { ok: false, output: 'Invalid container ID' };
  try {
    const args =
      action === 'logs'
        ? ['logs', '--tail', '60', safeId]
        : [action, safeId];
    const { stdout, stderr } = await execFileAsync('docker', args, { timeout: 15000 });
    return {
      ok: true,
      output: (stdout || stderr || `docker ${action} ${safeId} succeeded`).trim(),
    };
  } catch (err: any) {
    return { ok: false, output: (err.stderr || err.message || 'Docker action failed').trim() };
  }
}

export async function execLocalNodeCommand(command: string): Promise<{ ok: boolean; output: string }> {
  if (!command || !command.trim()) {
    return { ok: false, output: 'Empty command' };
  }
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
    return {
      ok: true,
      output: (stdout || stderr || 'Command completed (no output)').trim(),
    };
  } catch (err: any) {
    return {
      ok: false,
      output: (err.stdout || err.stderr || err.message || 'Command failed').trim(),
    };
  }
}

/**
 * Master Orchestrator: Manage Fleet of Remote VM Agent Nodes
 */
export async function listClusterNodes(): Promise<ClusterNodeProfile[]> {
  try {
    const raw = await fs.readFile(NODES_STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveClusterNode(
  input: Omit<ClusterNodeProfile, 'id' | 'addedAt'> & { id?: string }
): Promise<ClusterNodeProfile[]> {
  const existing = await listClusterNodes();
  const id = input.id || `node-${Date.now()}`;
  const cleanUrl = (input.url || '').trim().replace(/\/+$/, '');
  const entry: ClusterNodeProfile = {
    id,
    name: (input.name || '').trim() || cleanUrl,
    url: cleanUrl,
    secret: (input.secret || '').trim(),
    tags: Array.isArray(input.tags) ? input.tags : ['VM'],
    addedAt: Date.now(),
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  const updated = [entry, ...existing.filter((n) => n.id !== id)];
  await fs.writeFile(NODES_STORE_PATH, JSON.stringify(updated, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return updated;
}

export async function deleteClusterNode(id: string): Promise<ClusterNodeProfile[]> {
  const existing = await listClusterNodes();
  const updated = existing.filter((n) => n.id !== id);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(NODES_STORE_PATH, JSON.stringify(updated, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  return updated;
}

async function fetchRemoteNode(node: ClusterNodeProfile, endpoint: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${node.url}${endpoint}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-node-secret': node.secret,
        ...(init?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function pollAllClusterNodes(): Promise<NodeTelemetryReport[]> {
  const nodes = await listClusterNodes();
  const results = await Promise.all(
    nodes.map(async (node): Promise<NodeTelemetryReport> => {
      const start = Date.now();
      try {
        const res = await fetchRemoteNode(node, '/api/node/telemetry');
        const latencyMs = Date.now() - start;
        if (!res.ok) {
          return {
            nodeId: node.id,
            name: node.name,
            url: node.url,
            online: false,
            latencyMs,
            error: res.data?.error || `HTTP ${res.status}`,
          };
        }
        return {
          nodeId: node.id,
          name: node.name,
          url: node.url,
          online: true,
          latencyMs,
          ...res.data,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          name: node.name,
          url: node.url,
          online: false,
          latencyMs: Date.now() - start,
          error: err.name === 'AbortError' ? 'Connection timeout (8s)' : err.message,
        };
      }
    })
  );
  return results;
}

export async function getRemoteNodeDocker(nodeId: string) {
  const nodes = await listClusterNodes();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { available: false, containers: [], error: 'Node not found' };
  try {
    const res = await fetchRemoteNode(node, '/api/node/docker');
    if (!res.ok) return { available: false, containers: [], error: res.data?.error || `HTTP ${res.status}` };
    return res.data;
  } catch (err: any) {
    return { available: false, containers: [], error: err.message };
  }
}

export async function runRemoteNodeDockerAction(
  nodeId: string,
  containerId: string,
  action: 'start' | 'stop' | 'restart' | 'logs'
) {
  const nodes = await listClusterNodes();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, output: 'Node not found' };
  try {
    const res = await fetchRemoteNode(node, '/api/node/docker/action', {
      method: 'POST',
      body: JSON.stringify({ containerId, action }),
    });
    return res.data;
  } catch (err: any) {
    return { ok: false, output: err.message };
  }
}

export async function broadcastCommandToNodes(nodeIds: string[], command: string) {
  const nodes = await listClusterNodes();
  const targets = nodeIds.length > 0 ? nodes.filter((n) => nodeIds.includes(n.id)) : nodes;

  return Promise.all(
    targets.map(async (node) => {
      const start = Date.now();
      try {
        const res = await fetchRemoteNode(node, '/api/node/exec', {
          method: 'POST',
          body: JSON.stringify({ command }),
        });
        return {
          nodeId: node.id,
          name: node.name,
          ok: Boolean(res.ok && res.data?.ok),
          durationMs: Date.now() - start,
          output: res.data?.output || res.data?.error || `HTTP ${res.status}`,
        };
      } catch (err: any) {
        return {
          nodeId: node.id,
          name: node.name,
          ok: false,
          durationMs: Date.now() - start,
          output: err.message || 'Unreachable',
        };
      }
    })
  );
}
