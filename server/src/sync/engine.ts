// Runs one full sync with Moodle. Only one sync runs at a time.
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { dayKey, nowSec } from '../lib/time';
import { clientFor, getAccount, markOk, markTokenInvalid, TokenUnreadableError } from '../moodle/account';
import { MoodleTokenError, type MoodleClient } from '../moodle/client';
import type { SiteInfo } from '../moodle/types';
import { addNotification, runNotifications } from '../notify/rules';
import { syncCourseContents } from './contents';
import { step, type SyncContext } from './context';
import { syncCourses } from './courses';
import { syncFileDownloads } from './files';
import { syncAnnouncements } from './forums';
import { syncActionEvents, syncAssignments, syncQuizzes } from './tasks';

export type SyncTrigger = 'cron' | 'manual' | 'connect';

export interface SyncResult {
  status: 'ok' | 'partial' | 'error' | 'skipped';
  runId?: number;
  error?: string;
  stats?: Record<string, number>;
  warnings?: string[];
}

let running: Promise<SyncResult> | null = null;

export const isSyncRunning = () => running !== null;

export function runSync(trigger: SyncTrigger, opts: { skipDownloads?: boolean } = {}): Promise<SyncResult> {
  if (!running) running = doSync(trigger, opts).finally(() => (running = null));
  return running;
}

/** After a restart, runs that were in progress will never finish – close them. */
export function closeInterruptedRuns() {
  db()
    .update(schema.syncRuns)
    .set({ status: 'error', finishedAt: nowSec(), error: 'השרת הופעל מחדש באמצע הסנכרון' })
    .where(eq(schema.syncRuns.status, 'running'))
    .run();
}

/** Has any sync ever finished (fully or partly)? */
export function everSynced(): boolean {
  return !!db()
    .select({ id: schema.syncRuns.id })
    .from(schema.syncRuns)
    .where(inArray(schema.syncRuns.status, ['ok', 'partial']))
    .limit(1)
    .get();
}

export function lastSyncRun() {
  return db().select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(1).get();
}

async function doSync(trigger: SyncTrigger, opts: { skipDownloads?: boolean }): Promise<SyncResult> {
  const account = getAccount();
  if (!account) return { status: 'skipped', error: 'not_connected' };
  if (account.tokenInvalid && trigger === 'cron') return { status: 'skipped', error: 'token_invalid' };

  const startedAt = nowSec();
  const run = db().insert(schema.syncRuns).values({ trigger, startedAt, status: 'running' }).returning().get();
  const ctx: SyncContext = {
    client: undefined as unknown as MoodleClient, // set first thing inside the try
    userId: account.userId,
    now: startedAt,
    functions: new Set(account.functions),
    quietCourses: new Set(),
    activeCourses: [],
    stats: {},
    warnings: [],
  };

  let result: SyncResult;
  try {
    const client = clientFor(account);
    ctx.client = client;
    const info = await client.call<SiteInfo>('core_webservice_get_site_info');
    const fns = (info.functions ?? []).map((f) => f.name);
    ctx.functions = new Set(fns);
    markOk(fns);

    await syncCourses(ctx);
    ctx.activeCourses = db()
      .select()
      .from(schema.courses)
      .where(and(eq(schema.courses.active, true), isNull(schema.courses.removedAt)))
      .all();
    ctx.quietCourses = new Set(ctx.activeCourses.filter((c) => !c.baselined).map((c) => c.id));

    const contentOk = new Set<number>();
    await Promise.all(
      ctx.activeCourses.map((course) =>
        step(ctx, `contents ${course.shortName || course.id}`, async () => {
          await syncCourseContents(ctx, course);
          contentOk.add(course.id);
        }),
      ),
    );
    await step(ctx, 'assignments', () => syncAssignments(ctx));
    await step(ctx, 'quizzes', () => syncQuizzes(ctx));
    await step(ctx, 'calendar', () => syncActionEvents(ctx));
    await step(ctx, 'announcements', () => syncAnnouncements(ctx));

    // From now on, changes in these courses are real news.
    const baselined = [...ctx.quietCourses].filter((id) => contentOk.has(id));
    const syncedIds = [...contentOk];
    if (syncedIds.length) {
      db().update(schema.courses).set({ lastSyncedAt: ctx.now }).where(inArray(schema.courses.id, syncedIds)).run();
    }
    if (baselined.length) {
      db().update(schema.courses).set({ baselined: true }).where(inArray(schema.courses.id, baselined)).run();
    }

    if (!opts.skipDownloads) await step(ctx, 'downloads', () => syncFileDownloads(ctx));
    await step(ctx, 'notifications', () => runNotifications());

    ctx.stats.calls = client.calls;
    result = { status: ctx.warnings.length ? 'partial' : 'ok', runId: run.id, stats: ctx.stats, warnings: ctx.warnings };
  } catch (err) {
    if (err instanceof MoodleTokenError) {
      markTokenInvalid();
      const unreadable = err instanceof TokenUnreadableError;
      // One reminder per reason per day, however many syncs fail.
      addNotification({
        key: `reconnect:${unreadable ? 'key' : 'token'}:${dayKey(startedAt)}`,
        type: 'reconnect',
        title: 'צריך להתחבר מחדש ל-Moodle',
        body:
          unreadable
            ? 'מפתח ההצפנה (ENCRYPTION_KEY) השתנה, ולכן אי אפשר לקרוא את החיבור השמור. התחבר שוב כדי שהסנכרון ימשיך.'
            : 'החיבור ל-Moodle פג. היכנס להגדרות והתחבר שוב כדי שהסנכרון ימשיך.',
        url: '/connect',
      });
      await runNotifications().catch(() => {});
    }
    result = { status: 'error', runId: run.id, error: err instanceof Error ? err.message : String(err), stats: ctx.stats, warnings: ctx.warnings };
  }

  db()
    .update(schema.syncRuns)
    .set({
      finishedAt: nowSec(),
      status: result.status === 'skipped' ? 'ok' : result.status,
      error: result.error ?? (ctx.warnings.length ? ctx.warnings.slice(0, 20).join('\n') : null),
      stats: { ...ctx.stats, warnings: ctx.warnings.length },
    })
    .where(eq(schema.syncRuns.id, run.id))
    .run();
  return result;
}
