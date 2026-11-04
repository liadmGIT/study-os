import { db, schema } from '../db';
import type { ChangeType, Course } from '../db/schema';
import type { MoodleClient } from '../moodle/client';
import { MoodleError, MoodleTokenError } from '../moodle/client';

export interface SyncContext {
  client: MoodleClient;
  userId: number;
  now: number;
  functions: Set<string>;
  /** Courses seen for the first time in this run: store everything, but don't announce it as "new". */
  quietCourses: Set<number>;
  activeCourses: Course[];
  stats: Record<string, number>;
  warnings: string[];
}

/** Moodle only lets us call functions the site enabled for the mobile service. An empty list means "unknown" – try anyway. */
export function can(ctx: SyncContext, fn: string): boolean {
  return ctx.functions.size === 0 || ctx.functions.has(fn);
}

export function bump(ctx: SyncContext, key: string, n = 1) {
  ctx.stats[key] = (ctx.stats[key] ?? 0) + n;
}

export function recordChange(
  ctx: SyncContext,
  c: { type: ChangeType; courseId: number | null; entityType: string; entityId: number; title: string; payload?: Record<string, unknown> },
) {
  if (c.courseId !== null && ctx.quietCourses.has(c.courseId)) return;
  db()
    .insert(schema.changes)
    .values({ ...c, payload: c.payload ?? {}, createdAt: ctx.now })
    .run();
  bump(ctx, `change.${c.type}`);
}

/** Runs one sync step; a failure is logged as a warning so the rest of the sync still happens. Token errors abort. */
export async function step<T>(ctx: SyncContext, name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MoodleTokenError) throw err;
    const msg = err instanceof MoodleError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
    ctx.warnings.push(`${name}: ${msg}`);
    return undefined;
  }
}
