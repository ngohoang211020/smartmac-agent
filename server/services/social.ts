import fs from 'fs/promises';
import path from 'path';
import { google } from 'googleapis';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

function openUrlCrossPlatform(url: string) {
  const platform = os.platform();
  if (platform === 'darwin') return execAsync(`open "${url}"`);
  if (platform === 'win32') return execAsync(`cmd /c start "" "${url.replace(/&/g, '^&')}"`);
  return execAsync(`xdg-open "${url}"`);
}

const CONFIG_PATH = path.join(process.cwd(), '.local-agent-config.json');
const CACHE_PATH = path.join(process.cwd(), '.gmail-inbox-cache.txt');

/**
 * DEFAULT BUILT-IN GOOGLE OAUTH2 CREDENTIALS FOR YOUR OPEN-SOURCE PACKAGE
 * -----------------------------------------------------------------------
 * As the creator of `smartmac-agent`, you only create ONE Google Cloud OAuth 2.0 Client ID
 * (Application type: "Desktop app" or "Web application" with Redirect URI http://localhost:4000/api/social/gmail/oauth/callback)
 * and place it here (or via env).
 * Every user who installs your package via `npx smartmac-agent` can then click
 * "Sign in with Google" immediately without creating their own Google Cloud project!
 */
export const DEFAULT_OAUTH_CLIENT_ID =
  process.env.SMARTMAC_DEFAULT_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
export const DEFAULT_OAUTH_CLIENT_SECRET =
  process.env.SMARTMAC_DEFAULT_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

export interface AgentAndGmailConfig {
  geminiApiKey?: string;
  gmail?: {
    email?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    accessToken?: string;
    refreshToken?: string;
    expiryDate?: number;
    appPassword?: string;
  };
}

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export async function loadConfig(): Promise<AgentAndGmailConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      gmail: {
        email: '',
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/social/gmail/oauth/callback',
        accessToken: '',
        refreshToken: '',
        appPassword: '',
      },
    };
  }
}

export async function saveConfig(partial: Partial<AgentAndGmailConfig>): Promise<AgentAndGmailConfig> {
  const existing = await loadConfig();
  const merged: AgentAndGmailConfig = {
    ...existing,
    ...partial,
    gmail: {
      email: partial.gmail?.email ?? existing.gmail?.email ?? '',
      clientId: partial.gmail?.clientId ?? existing.gmail?.clientId ?? '',
      clientSecret: partial.gmail?.clientSecret ?? existing.gmail?.clientSecret ?? '',
      redirectUri:
        partial.gmail?.redirectUri ??
        existing.gmail?.redirectUri ??
        'http://localhost:4000/api/social/gmail/oauth/callback',
      accessToken: partial.gmail?.accessToken ?? existing.gmail?.accessToken ?? '',
      refreshToken: partial.gmail?.refreshToken ?? existing.gmail?.refreshToken ?? '',
      expiryDate: partial.gmail?.expiryDate ?? existing.gmail?.expiryDate,
      appPassword: partial.gmail?.appPassword ?? existing.gmail?.appPassword ?? '',
    },
  };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

/**
 * Completely resets all stored Gmail tokens, cached emails, and local memory so user can sign in fresh
 */
export async function resetGmailSession(): Promise<{ ok: boolean; message: string }> {
  await fs.unlink(CACHE_PATH).catch(() => {});
  const existing = await loadConfig();
  const cleaned: AgentAndGmailConfig = {
    geminiApiKey: existing.geminiApiKey || '',
    gmail: {
      email: '',
      clientId: existing.gmail?.clientId || '',
      clientSecret: existing.gmail?.clientSecret || '',
      redirectUri: existing.gmail?.redirectUri || 'http://localhost:4000/api/social/gmail/oauth/callback',
      accessToken: '',
      refreshToken: '',
      appPassword: '',
    },
  };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cleaned, null, 2), 'utf-8');
  return {
    ok: true,
    message: 'Cleared all saved Gmail OAuth tokens, sessions, and local inbox cache. Ready to sign in again.',
  };
}

function createOAuth2Client(cfg: AgentAndGmailConfig) {
  const clientId = cfg.gmail?.clientId || DEFAULT_OAUTH_CLIENT_ID;
  const clientSecret = cfg.gmail?.clientSecret || DEFAULT_OAUTH_CLIENT_SECRET;
  const port = process.env.PORT || '4000';
  const redirectUri =
    cfg.gmail?.redirectUri ||
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:${port}/api/social/gmail/oauth/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('NO_DEFAULT_OAUTH_CLIENT');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates Google OAuth 2.0 Authorization URL for Gmail
 */
export async function getGmailOAuthUrl(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const cfg = await loadConfig();
    const oauth2Client = createOAuth2Client(cfg);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
    return { ok: true, url };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Handles the Google OAuth2 callback code exchange and fetches the user's Gmail address
 */
export async function handleGmailOAuthCallback(code: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const cfg = await loadConfig();
    const oauth2Client = createOAuth2Client(cfg);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const gmailApi = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmailApi.users.getProfile({ userId: 'me' });
    const emailAddress = profile.data.emailAddress || cfg.gmail?.email || 'Connected via OAuth2';

    await saveConfig({
      gmail: {
        ...cfg.gmail,
        email: emailAddress,
        accessToken: tokens.access_token || cfg.gmail?.accessToken || '',
        refreshToken: tokens.refresh_token || cfg.gmail?.refreshToken || '',
        expiryDate: tokens.expiry_date || undefined,
      },
    });

    return { ok: true, email: emailAddress };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export async function fetchGmailMessages(limit = 12, query = 'in:inbox'): Promise<{
  connected: boolean;
  mode: 'oauth2' | 'imap' | 'disconnected';
  email: string;
  messages: EmailMessage[];
  error?: string;
}> {
  const cfg = await loadConfig();
  const gmail = cfg.gmail;

  // 1. OAuth2 with googleapis (Refresh Token + Access Token)
  const effectiveClientId = gmail?.clientId || DEFAULT_OAUTH_CLIENT_ID;
  const effectiveClientSecret = gmail?.clientSecret || DEFAULT_OAUTH_CLIENT_SECRET;
  if (gmail?.refreshToken && effectiveClientId && effectiveClientSecret) {
    try {
      const oauth2Client = createOAuth2Client(cfg);
      oauth2Client.setCredentials({
        access_token: gmail.accessToken,
        refresh_token: gmail.refreshToken,
        expiry_date: gmail.expiryDate,
      });

      const gmailApi = google.gmail({ version: 'v1', auth: oauth2Client });
      const [profileRes, listRes] = await Promise.all([
        gmailApi.users.getProfile({ userId: 'me' }).catch(() => null),
        gmailApi.users.messages.list({ userId: 'me', maxResults: limit, q: query }),
      ]);

      const detectedEmail = profileRes?.data?.emailAddress || gmail.email || 'Connected via OAuth2';
      if (detectedEmail && detectedEmail !== gmail.email) {
        await saveConfig({ gmail: { ...gmail, email: detectedEmail } });
      }

      const items = listRes.data.messages || [];
      const details: EmailMessage[] = [];

      for (const item of items.slice(0, limit)) {
        if (!item.id) continue;
        const msgRes = await gmailApi.users.messages.get({
          userId: 'me',
          id: item.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });
        const msg = msgRes.data;
        const headers = msg.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
        details.push({
          id: msg.id || item.id,
          from: getHeader('From'),
          subject: getHeader('Subject') || '(No Subject)',
          snippet: msg.snippet || '',
          date: getHeader('Date') || new Date(Number(msg.internalDate || Date.now())).toISOString(),
          unread: (msg.labelIds || []).includes('UNREAD'),
        });
      }

      return {
        connected: true,
        mode: 'oauth2',
        email: detectedEmail,
        messages: details,
      };
    } catch (err: any) {
      return {
        connected: false,
        mode: 'oauth2',
        email: gmail.email || '',
        messages: [],
        error: `Google OAuth2 error: ${err.message}`,
      };
    }
  }

  // 2. Direct OAuth2 Access Token (without Client Secret)
  if (gmail?.accessToken) {
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${gmail.accessToken}` },
      });
      let detectedEmail = gmail.email || 'Connected via OAuth2 Token';
      if (profileRes.ok) {
        const prof: any = await profileRes.json();
        if (prof.emailAddress) detectedEmail = prof.emailAddress;
      }

      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${gmail.accessToken}` } }
      );
      if (!listRes.ok) {
        throw new Error(`Gmail API HTTP ${listRes.status} (Token may be expired — please sign in again)`);
      }
      const listData: any = await listRes.json();
      const items = listData.messages || [];
      const details: EmailMessage[] = [];

      for (const item of items.slice(0, limit)) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${gmail.accessToken}` } }
        );
        if (msgRes.ok) {
          const msg: any = await msgRes.json();
          const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
          details.push({
            id: msg.id,
            from: getHeader('From'),
            subject: getHeader('Subject') || '(No Subject)',
            snippet: msg.snippet || '',
            date: getHeader('Date') || new Date(Number(msg.internalDate)).toISOString(),
            unread: (msg.labelIds || []).includes('UNREAD'),
          });
        }
      }
      return {
        connected: true,
        mode: 'oauth2',
        email: detectedEmail,
        messages: details,
      };
    } catch (err: any) {
      return {
        connected: false,
        mode: 'oauth2',
        email: gmail.email || '',
        messages: [],
        error: `Gmail OAuth2 Token error: ${err.message}`,
      };
    }
  }

  // 3. Gmail IMAP with App Password
  if (gmail?.email && gmail?.appPassword) {
    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: gmail.email,
        pass: gmail.appPassword,
      },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      const messages: EmailMessage[] = [];
      try {
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (total > 0) {
          const startSeq = Math.max(1, total - limit + 1);
          for await (const msg of client.fetch(`${startSeq}:*`, {
            envelope: true,
            flags: true,
            uid: true,
          })) {
            const fromAddr = msg.envelope?.from?.[0];
            const fromStr = fromAddr
              ? `${fromAddr.name ? fromAddr.name + ' ' : ''}<${fromAddr.address}>`
              : 'Unknown';
            messages.push({
              id: String(msg.uid),
              from: fromStr,
              subject: msg.envelope?.subject || '(No Subject)',
              snippet: `UID #${msg.uid} in INBOX`,
              date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : new Date().toISOString(),
              unread: !msg.flags?.has('\\Seen'),
            });
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
      return {
        connected: true,
        mode: 'imap',
        email: gmail.email,
        messages: messages.reverse(),
      };
    } catch (err: any) {
      return {
        connected: false,
        mode: 'imap',
        email: gmail.email,
        messages: [],
        error: `Gmail IMAP error: ${err.message}`,
      };
    }
  }

  // 4. Disconnected clean state (no demo/cached emails)
  return {
    connected: false,
    mode: 'disconnected',
    email: '',
    messages: [],
  };
}

/**
 * Fetches unread Gmail messages from the last 3 days (`is:unread newer_than:3d`) for the Bell notification dropdown
 */
export async function fetchUnreadGmail3Days(limit = 15): Promise<{
  connected: boolean;
  email: string;
  unreadCount: number;
  messages: EmailMessage[];
  syncedAt: number;
  error?: string;
}> {
  const data = await fetchGmailMessages(limit, 'in:inbox is:unread newer_than:3d');
  // If connected via IMAP, filter for unread & last 3 days
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const filtered =
    data.mode === 'imap'
      ? data.messages.filter((m) => m.unread && new Date(m.date).getTime() >= threeDaysAgo)
      : data.messages;

  return {
    connected: data.connected,
    email: data.email,
    unreadCount: filtered.length,
    messages: filtered,
    syncedAt: Date.now(),
    error: data.error,
  };
}

export async function sendGmailMessage(to: string, subject: string, body: string): Promise<{ ok: boolean; message: string }> {
  const cfg = await loadConfig();
  const gmail = cfg.gmail;

  const rawMessage = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    body,
  ].join('\n');
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const effectiveClientId = gmail?.clientId || DEFAULT_OAUTH_CLIENT_ID;
  const effectiveClientSecret = gmail?.clientSecret || DEFAULT_OAUTH_CLIENT_SECRET;
  if (gmail?.refreshToken && effectiveClientId && effectiveClientSecret) {
    try {
      const oauth2Client = createOAuth2Client(cfg);
      oauth2Client.setCredentials({
        access_token: gmail.accessToken,
        refresh_token: gmail.refreshToken,
        expiry_date: gmail.expiryDate,
      });
      const gmailApi = google.gmail({ version: 'v1', auth: oauth2Client });
      await gmailApi.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });
      return { ok: true, message: `Email sent via Google OAuth2 to ${to}` };
    } catch (err: any) {
      return { ok: false, message: `Google OAuth2 send failed: ${err.message}` };
    }
  }

  if (gmail?.accessToken) {
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gmail.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { ok: true, message: `Email sent via Gmail OAuth2 API to ${to}` };
    } catch (err: any) {
      return { ok: false, message: `Gmail API send failed: ${err.message}` };
    }
  }

  if (gmail?.email && gmail?.appPassword) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmail.email,
          pass: gmail.appPassword,
        },
      });
      await transporter.sendMail({
        from: gmail.email,
        to,
        subject,
        text: body,
      });
      return { ok: true, message: `Email sent to ${to}` };
    } catch (err: any) {
      return { ok: false, message: `SMTP failed: ${err.message}` };
    }
  }

  const mailtoUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await openUrlCrossPlatform(mailtoUrl);
  return {
    ok: true,
    message: 'Opened Gmail web composer in your browser (sign in via OAuth2 for direct background sending).',
  };
}

export async function openExternalWebApp(target: string): Promise<{ ok: boolean; message: string }> {
  const urls: Record<string, string> = {
    gmail: 'https://mail.google.com',
    gmail_compose: 'https://mail.google.com/mail/?view=cm&fs=1',
    google_console: 'https://console.cloud.google.com/apis/credentials',
    oauth_playground: 'https://developers.google.com/oauthplayground',
  };
  const url = urls[target] || target;
  if (!url.startsWith('https://')) {
    return { ok: false, message: 'Invalid URL' };
  }
  await openUrlCrossPlatform(url);
  return { ok: true, message: `Opened ${url} in default browser` };
}
