import { eq } from 'drizzle-orm';
import webpush from 'web-push';
import { config } from '../config';
import { db, schema } from '../db';
import { getKV, setKV } from '../lib/settings';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export function vapidKeys(): VapidKeys {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  let keys = getKV<VapidKeys>('vapid');
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    setKV('vapid', keys);
  }
  return keys;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string | null;
  tag?: string;
}

export async function sendPush(payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const subs = db().select().from(schema.pushSubscriptions).all();
  if (!subs.length) return { sent: 0, failed: 0 };
  const keys = vapidKeys();
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          vapidDetails: { subject: config.vapidSubject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 12 * 3600,
        });
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        // The browser dropped this subscription; forget it.
        if (status === 404 || status === 410) db().delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id)).run();
      }
    }),
  );
  return { sent, failed };
}
