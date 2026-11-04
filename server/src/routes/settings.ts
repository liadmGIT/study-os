import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { buildIcs } from '../calendar/ics';
import { config } from '../config';
import { db, schema } from '../db';
import { HttpError, parse } from '../lib/http';
import { getIcsSecret, getSettings, rotateIcsSecret, updateSettings } from '../lib/settings';
import { nowSec } from '../lib/time';
import { sendPush, vapidKeys } from '../notify/push';

export function baseUrlOf(req: FastifyRequest): string {
  return config.publicUrl ?? `${req.protocol}://${req.host}`;
}

const hour = z.number().int().min(0).max(23);
const settingsPatch = z.object({
  dailyStudyMin: z.number().int().min(0).max(1440).optional(),
  defaultLectureMin: z.number().int().min(5).max(600).optional(),
  notStartedDays: z.number().int().min(0).max(30).optional(),
  lagThreshold: z.number().int().min(1).max(50).optional(),
  quietHoursStart: hour.optional(),
  quietHoursEnd: hour.optional(),
  downloadFiles: z.boolean().optional(),
  downloadVideos: z.boolean().optional(),
  maxFileMb: z.number().int().min(1).max(2000).optional(),
  icsIncludePlan: z.boolean().optional(),
  notify: z
    .object({
      deadline: z.boolean(),
      notStarted: z.boolean(),
      dueChanged: z.boolean(),
      newTask: z.boolean(),
      announcement: z.boolean(),
      recording: z.boolean(),
      files: z.boolean(),
      grade: z.boolean(),
      lectureLag: z.boolean(),
    })
    .partial()
    .optional(),
});

export function settingsRoutes(app: FastifyInstance) {
  const payload = (req: FastifyRequest) => ({
    settings: getSettings(),
    icsUrl: `${baseUrlOf(req)}/cal/${getIcsSecret()}.ics`,
    moodleUrl: config.moodleUrl,
  });

  app.get('/api/settings', async (req) => payload(req));

  app.patch('/api/settings', async (req) => {
    updateSettings(parse(settingsPatch, req.body));
    return payload(req);
  });

  app.post('/api/settings/ics/rotate', async (req) => {
    rotateIcsSecret();
    return payload(req);
  });

  // Calendar feed – public, protected by the secret in the URL.
  app.get('/cal/:file', async (req, reply) => {
    const { file } = parse(z.object({ file: z.string() }), req.params);
    if (file !== `${getIcsSecret()}.ics`) throw new HttpError(404, 'Not found');
    reply.type('text/calendar; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return buildIcs(baseUrlOf(req));
  });

  app.get('/api/push/key', async () => ({ publicKey: vapidKeys().publicKey }));

  app.post('/api/push/subscribe', async (req) => {
    const body = parse(z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }), req.body);
    const row = {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: req.headers['user-agent'] ?? null,
      createdAt: nowSec(),
    };
    db()
      .insert(schema.pushSubscriptions)
      .values(row)
      .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: row })
      .run();
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req) => {
    const { endpoint } = parse(z.object({ endpoint: z.string() }), req.body);
    db().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint)).run();
    return { ok: true };
  });

  app.post('/api/push/test', async () => {
    const res = await sendPush({ title: 'בדיקת התראות', body: 'אם אתה רואה את זה – ההתראות עובדות 🎉', url: '/', tag: 'test' });
    if (!res.sent) throw new HttpError(400, 'אין מכשיר רשום להתראות, או שהשליחה נכשלה.');
    return res;
  });
}
