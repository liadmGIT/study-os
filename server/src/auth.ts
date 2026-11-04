// Single-user login for the web app: one password (APP_PASSWORD), a signed session cookie.
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config, isProd } from './config';
import { hmac, safeEqual } from './lib/crypto';
import { HttpError, parse } from './lib/http';
import { nowSec } from './lib/time';

const COOKIE = 'sos_session';
const MAX_AGE = 60 * 24 * 3600;

// Changing APP_PASSWORD invalidates existing sessions.
const passwordTag = () => crypto.createHash('sha256').update(config.appPassword).digest('base64url').slice(0, 16);
const sign = (exp: number) => hmac(`${exp}:${passwordTag()}`);

export function isAuthed(req: FastifyRequest): boolean {
  const raw = req.cookies[COOKIE];
  if (!raw) return false;
  const [expStr, sig] = raw.split('.');
  const exp = Number(expStr);
  return Number.isFinite(exp) && exp > nowSec() && !!sig && safeEqual(sig, sign(exp));
}

function issueSession(reply: FastifyReply) {
  const exp = nowSec() + MAX_AGE;
  reply.setCookie(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: MAX_AGE,
  });
}

const WINDOW_SEC = 600;
const PER_IP_LIMIT = 10;
// Single-user app: also cap all attempts together, so rotating IPs doesn't help a guesser.
const GLOBAL_LIMIT = 30;
const attempts = new Map<string, { count: number; resetAt: number }>();

function overLimit(key: string, limit: number, now: number): boolean {
  const a = attempts.get(key);
  if (!a || a.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_SEC });
    return false;
  }
  a.count++;
  return a.count > limit;
}

function checkRate(ip: string) {
  const now = nowSec();
  for (const [key, a] of attempts) if (a.resetAt < now) attempts.delete(key);
  if (overLimit('*', GLOBAL_LIMIT, now) || overLimit(ip, PER_IP_LIMIT, now)) {
    throw new HttpError(429, 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.', 'rate_limited');
  }
}

const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/me']);

export function registerAuth(app: FastifyInstance) {
  app.addHook('onRequest', async (req) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/') || PUBLIC_API.has(path)) return;
    if (!isAuthed(req)) throw new HttpError(401, 'צריך להתחבר', 'unauthorized');
  });

  app.post('/api/auth/login', async (req, reply) => {
    checkRate(req.ip);
    const { password } = parse(z.object({ password: z.string().min(1) }), req.body);
    if (!config.appPassword || !safeEqual(password, config.appPassword)) {
      throw new HttpError(401, 'סיסמה שגויה', 'bad_password');
    }
    attempts.delete(req.ip);
    issueSession(reply);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => ({ authed: isAuthed(req) }));
}
