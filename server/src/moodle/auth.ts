// Getting a Moodle web-service token, either with username+password (login/token.php)
// or, for SSO sites, through the mobile-app "launch" flow.
import { md5, randomToken } from '../lib/crypto';
import { MoodleError } from './client';
import type { PublicConfig } from './types';

export const MOBILE_SERVICE = 'moodle_mobile_app';

export interface TokenResult {
  token: string;
  privateToken?: string;
}

export async function loginWithPassword(baseUrl: string, username: string, password: string): Promise<TokenResult> {
  const res = await fetch(`${baseUrl}/login/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ username, password, service: MOBILE_SERVICE }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json: { token?: string; privatetoken?: string; error?: string; errorcode?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new MoodleError('badresponse', `Unexpected response from Moodle (HTTP ${res.status})`);
  }
  if (!json.token) throw new MoodleError(json.errorcode ?? 'loginfailed', json.error ?? 'Login failed');
  return { token: json.token, privateToken: json.privatetoken ?? undefined };
}

export function newPassport(): string {
  return randomToken(12);
}

export function buildLaunchUrl(baseUrl: string, passport: string): string {
  const params = new URLSearchParams({ service: MOBILE_SERVICE, passport, urlscheme: 'moodlemobile' });
  return `${baseUrl}/admin/tool/mobile/launch.php?${params}`;
}

/**
 * Parses what the browser shows after the launch flow:
 *   moodlemobile://token=BASE64   (BASE64 = "signature:::token[:::privatetoken]")
 * Accepts the whole URL, just the base64 part, or a raw 32-char token.
 */
export function parseLaunchToken(
  input: string,
  check?: { baseUrl: string; passport: string },
): TokenResult & { signatureOk: boolean | null } {
  const raw = input.trim();
  if (/^[a-f0-9]{32}$/i.test(raw)) return { token: raw, signatureOk: null };

  const match = raw.match(/token=([A-Za-z0-9+/=_-]+)/);
  const b64 = (match ? match[1] : raw).replace(/-/g, '+').replace(/_/g, '/');
  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    throw new MoodleError('badlaunchtoken', 'Could not read the token from that link');
  }
  const parts = decoded.split(':::');
  if (parts.length < 2 || !/^[a-f0-9]{32}$/i.test(parts[1])) {
    throw new MoodleError('badlaunchtoken', 'Could not read the token from that link');
  }
  let signatureOk: boolean | null = null;
  if (check) {
    const candidates = [check.baseUrl, `${check.baseUrl}/`].map((u) => md5(u + check.passport));
    signatureOk = candidates.includes(parts[0]);
  }
  return { token: parts[1], privateToken: parts[2] || undefined, signatureOk };
}

/** Public (no-login) site config: tells us whether the site is reachable and how it logs in. */
export async function getPublicConfig(baseUrl: string): Promise<PublicConfig> {
  const res = await fetch(`${baseUrl}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config&lang=he`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }]),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json()) as { error?: boolean | string; data?: PublicConfig; exception?: { message: string } }[];
  const first = json?.[0];
  if (!first || first.error) throw new MoodleError('publicconfig', first?.exception?.message ?? 'Public config unavailable');
  return first.data ?? {};
}
