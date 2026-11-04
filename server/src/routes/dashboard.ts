import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import { catchupPlanFor, computeLag, listLectures } from '../domain/lectures';
import { listTasks, type TaskView } from '../domain/tasks';
import { parse } from '../lib/http';
import { addDays, dayKey, todayKey, weekStart } from '../lib/time';
import { getAccount } from '../moodle/account';
import { isSyncRunning, lastSyncRun, runSync } from '../sync/engine';
import { recentChanges } from './updates';

const ACTIVE_BUCKETS = new Set(['overdue', 'urgent', 'week', 'later', 'nodate']);

function syncStatus() {
  const a = getAccount();
  return {
    running: isSyncRunning(),
    last: lastSyncRun() ?? null,
    connected: !!a,
    tokenInvalid: a?.tokenInvalid ?? false,
  };
}

export function dashboardRoutes(app: FastifyInstance) {
  app.post('/api/sync', async () => {
    if (!getAccount()) return { started: false, reason: 'not_connected' };
    runSync('manual').catch(() => {});
    return { started: true };
  });

  app.get('/api/sync/status', async () => syncStatus());

  app.get('/api/sync/runs', async () => db().select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(20).all());

  app.get('/api/dashboard', async () => {
    const today = todayKey();
    const tasks = listTasks();
    const active = tasks.filter((t) => ACTIVE_BUCKETS.has(t.urgency.bucket));
    const lectures = listLectures();
    const plan = catchupPlanFor(today, 7, lectures);
    const unreadAnnouncements = db()
      .select()
      .from(schema.announcements)
      .where(eq(schema.announcements.read, false))
      .orderBy(desc(schema.announcements.postedAt))
      .all();
    const courseNames = new Map(db().select().from(schema.courses).all().map((c) => [c.id, { name: c.fullName, color: c.color }]));
    const unreadNotifications = db().select({ id: schema.notifications.id }).from(schema.notifications).where(eq(schema.notifications.read, false)).all().length;

    const counts: Record<string, number> = {};
    for (const t of tasks) counts[t.urgency.bucket] = (counts[t.urgency.bucket] ?? 0) + 1;

    return {
      today,
      sync: syncStatus(),
      counts,
      notStarted: active.filter((t) => t.notStarted).length,
      focus: active.filter((t) => t.urgency.bucket === 'overdue' || t.urgency.bucket === 'urgent').slice(0, 8),
      thisWeek: active.filter((t) => t.urgency.bucket === 'week').slice(0, 8),
      plannedToday: active.filter((t) => t.plannedDate === today),
      todayLectures: plan.days[0]?.items.map((i) => ({ ...i, course: courseNames.get(i.courseId) ?? null })) ?? [],
      lag: computeLag(lectures),
      recentChanges: recentChanges(12),
      announcements: {
        unread: unreadAnnouncements.length,
        latest: unreadAnnouncements.slice(0, 3).map((a) => ({ ...a, course: courseNames.get(a.courseId) ?? null })),
      },
      unreadNotifications,
    };
  });

  app.get('/api/week', async (req) => {
    const q = parse(
      z.object({
        start: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
      req.query,
    );
    const today = todayKey();
    const start = weekStart(q.start ?? today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const tasks = listTasks().filter((t) => t.urgency.bucket !== 'expired');
    const courseNames = new Map(db().select().from(schema.courses).all().map((c) => [c.id, { name: c.fullName, color: c.color }]));

    // The catch-up plan always starts today; only future days of this week get lecture blocks.
    const plan = catchupPlanFor(today, 14);
    const planByDay = new Map(plan.days.map((d) => [d.date, d]));

    const byDue = new Map<string, TaskView[]>();
    const byPlan = new Map<string, TaskView[]>();
    for (const t of tasks) {
      if (t.dueAt) {
        const k = dayKey(t.dueAt);
        byDue.set(k, [...(byDue.get(k) ?? []), t]);
      }
      if (t.plannedDate) byPlan.set(t.plannedDate, [...(byPlan.get(t.plannedDate) ?? []), t]);
    }

    return {
      start,
      today,
      prev: addDays(start, -7),
      next: addDays(start, 7),
      days: days.map((date) => ({
        date,
        deadlines: byDue.get(date) ?? [],
        planned: byPlan.get(date) ?? [],
        lectures: (planByDay.get(date)?.items ?? []).map((i) => ({ ...i, course: courseNames.get(i.courseId) ?? null })),
      })),
      unscheduled: tasks.filter((t) => !t.plannedDate && !['done', 'expired'].includes(t.urgency.bucket) && t.status !== 'submitted'),
      planUnscheduledMin: plan.unscheduledMin,
    };
  });
}
