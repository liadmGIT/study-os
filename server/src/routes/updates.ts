import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { nowSec } from '../lib/time';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import { idParam, parse } from '../lib/http';

export function recentChanges(limit: number, before?: number) {
  const names = new Map(db().select().from(schema.courses).all().map((c) => [c.id, { name: c.fullName, color: c.color }]));
  return db()
    .select()
    .from(schema.changes)
    .where(before ? lt(schema.changes.id, before) : undefined)
    .orderBy(desc(schema.changes.id))
    .limit(limit)
    .all()
    .map((c) => ({ ...c, course: c.courseId ? (names.get(c.courseId) ?? null) : null }));
}

/** Modules that showed up (or got new files) after the first sync, in the last week. */
export function recentlyNewModuleIds(): Set<number> {
  return new Set(
    db()
      .select({ id: schema.changes.entityId })
      .from(schema.changes)
      .where(and(eq(schema.changes.entityType, 'module'), gt(schema.changes.createdAt, nowSec() - 7 * 86400)))
      .all()
      .map((r) => r.id),
  );
}

export function updateRoutes(app: FastifyInstance) {
  app.get('/api/updates', async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(60), before: z.coerce.number().int().optional() }), req.query);
    return recentChanges(q.limit, q.before);
  });

  app.post('/api/updates/seen', async () => {
    db().update(schema.changes).set({ seen: true }).where(eq(schema.changes.seen, false)).run();
    return { ok: true };
  });

  app.get('/api/announcements', async (req) => {
    const q = parse(z.object({ courseId: z.coerce.number().int().optional(), unread: z.coerce.boolean().optional() }), req.query);
    const names = new Map(db().select().from(schema.courses).all().map((c) => [c.id, { name: c.fullName, color: c.color }]));
    const conds = [];
    if (q.courseId) conds.push(eq(schema.announcements.courseId, q.courseId));
    if (q.unread) conds.push(eq(schema.announcements.read, false));
    return db()
      .select()
      .from(schema.announcements)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.announcements.postedAt))
      .limit(100)
      .all()
      .map((a) => ({ ...a, course: names.get(a.courseId) ?? null }));
  });

  app.patch('/api/announcements/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { read } = parse(z.object({ read: z.boolean() }), req.body);
    db().update(schema.announcements).set({ read }).where(eq(schema.announcements.id, id)).run();
    return { ok: true };
  });

  app.post('/api/announcements/read-all', async () => {
    db().update(schema.announcements).set({ read: true }).where(eq(schema.announcements.read, false)).run();
    return { ok: true };
  });

  app.get('/api/notifications', async () => {
    const list = db().select().from(schema.notifications).orderBy(desc(schema.notifications.id)).limit(60).all();
    const unread = db().select({ id: schema.notifications.id }).from(schema.notifications).where(eq(schema.notifications.read, false)).all().length;
    return { notifications: list, unread };
  });

  app.post('/api/notifications/read-all', async () => {
    db().update(schema.notifications).set({ read: true }).where(eq(schema.notifications.read, false)).run();
    return { ok: true };
  });
}
