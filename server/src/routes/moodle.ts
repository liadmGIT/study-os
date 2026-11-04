import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { HttpError, parse } from '../lib/http';
import { getKV, setKV } from '../lib/settings';
import { nowSec } from '../lib/time';
import { disconnect, getAccount, saveConnection } from '../moodle/account';
import { buildLaunchUrl, getPublicConfig, loginWithPassword, newPassport, parseLaunchToken, type TokenResult } from '../moodle/auth';
import { MoodleError } from '../moodle/client';
import { runSync } from '../sync/engine';

/** The functions the sync relies on. Missing ones are shown in settings so it's clear what won't work. */
export const IMPORTANT_FUNCTIONS = [
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'mod_quiz_get_quizzes_by_courses',
  'mod_quiz_get_user_attempts',
  'core_calendar_get_action_events_by_timesort',
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
];

function friendlyError(err: unknown): HttpError {
  if (err instanceof MoodleError) {
    const map: Record<string, string> = {
      invalidlogin: 'שם המשתמש או הסיסמה שגויים.',
      enablewsdescription: 'באתר ה-Moodle הזה כבויה הגישה דרך אפליקציה. נסה את ההתחברות דרך הדפדפן.',
      servicenotavailable: 'שירות האפליקציה לא זמין באתר. נסה את ההתחברות דרך הדפדפן.',
      sitemaintenance: 'ה-Moodle בתחזוקה כרגע. נסה שוב מאוחר יותר.',
      usernotfullysetup: 'החשבון ב-Moodle לא הושלם. היכנס פעם אחת דרך האתר ונסה שוב.',
      badlaunchtoken: 'לא הצלחנו לקרוא את הטוקן מהקישור. ודא שהעתקת את כל הכתובת שמתחילה ב-moodlemobile://',
      invalidtoken: 'הטוקן לא תקין או שפג תוקפו.',
    };
    return new HttpError(400, map[err.code] ?? `Moodle: ${err.message}`, err.code);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new HttpError(502, `לא הצלחנו להגיע ל-Moodle מהשרת (${msg}).`, 'unreachable');
}

async function connect(tokens: TokenResult, username?: string) {
  try {
    const info = await saveConnection(tokens, username);
    // First sync in the background; the UI polls /api/sync/status.
    runSync('connect').catch(() => {});
    return { ok: true, ...info };
  } catch (err) {
    throw friendlyError(err);
  }
}

export function moodleRoutes(app: FastifyInstance) {
  app.get('/api/moodle/status', async () => {
    const a = getAccount();
    if (!a) return { connected: false, baseUrl: config.moodleUrl };
    const fns = new Set(a.functions);
    return {
      connected: true,
      baseUrl: a.baseUrl,
      fullName: a.fullName,
      username: a.username,
      siteName: a.siteName,
      tokenInvalid: a.tokenInvalid,
      connectedAt: a.connectedAt,
      lastOkAt: a.lastOkAt,
      functionsCount: a.functions.length,
      missingFunctions: fns.size ? IMPORTANT_FUNCTIONS.filter((f) => !fns.has(f)) : [],
    };
  });

  /** Can this server reach Moodle at all? (Some university sites block IPs outside Israel.) */
  app.get('/api/moodle/ping', async () => {
    const started = Date.now();
    try {
      const pc = await getPublicConfig(config.moodleUrl);
      return {
        reachable: true,
        ms: Date.now() - started,
        baseUrl: config.moodleUrl,
        siteName: pc.sitename ?? null,
        typeOfLogin: pc.typeoflogin ?? null, // 1 = username/password works, 2/3 = SSO via browser
        identityProviders: (pc.identityproviders ?? []).map((p) => p.name),
        release: pc.release ?? null,
      };
    } catch (err) {
      return { reachable: false, ms: Date.now() - started, baseUrl: config.moodleUrl, error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post('/api/moodle/login', async (req) => {
    const { username, password } = parse(z.object({ username: z.string().trim().min(1), password: z.string().min(1) }), req.body);
    let tokens: TokenResult;
    try {
      tokens = await loginWithPassword(config.moodleUrl, username, password);
    } catch (err) {
      throw friendlyError(err);
    }
    return connect(tokens, username);
  });

  app.post('/api/moodle/launch/start', async () => {
    const passport = newPassport();
    setKV('launch_passport', { passport, createdAt: nowSec() });
    return { url: buildLaunchUrl(config.moodleUrl, passport) };
  });

  app.post('/api/moodle/launch/finish', async (req) => {
    const { value } = parse(z.object({ value: z.string().trim().min(10) }), req.body);
    const stored = getKV<{ passport: string }>('launch_passport');
    let tokens: TokenResult;
    try {
      tokens = parseLaunchToken(value, stored ? { baseUrl: config.moodleUrl, passport: stored.passport } : undefined);
    } catch (err) {
      throw friendlyError(err);
    }
    return connect(tokens);
  });

  /** Paste a token directly (e.g. from Moodle's "Security keys" page). */
  app.post('/api/moodle/token', async (req) => {
    const { token } = parse(z.object({ token: z.string().trim().regex(/^[a-f0-9]{32}$/i, 'טוקן לא תקין') }), req.body);
    return connect({ token });
  });

  app.delete('/api/moodle', async () => {
    disconnect();
    return { ok: true };
  });
}
