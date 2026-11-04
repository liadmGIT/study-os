import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { cleanName } from '../lib/html';
import { DAY } from '../lib/time';
import type { MoodleCourse } from '../moodle/types';
import { bump, recordChange, type SyncContext } from './context';

export const COURSE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'];

/** Guess whether a course belongs to the current semester. The user can change it in settings. */
export function guessActive(c: MoodleCourse, now: number): boolean {
  if (c.hidden) return false;
  if (c.enddate && c.enddate < now - 21 * DAY) return false;
  if (c.startdate && c.startdate > now + 45 * DAY) return false;
  if (!c.enddate && c.startdate && c.startdate < now - 300 * DAY) return false;
  return true;
}

export async function syncCourses(ctx: SyncContext) {
  const list = await ctx.client.call<MoodleCourse[]>('core_enrol_get_users_courses', { userid: ctx.userId, returnusercount: 0 });
  const existing = new Map(db().select().from(schema.courses).all().map((c) => [c.id, c]));
  const firstEver = existing.size === 0;
  let colorIndex = existing.size;

  for (const c of list) {
    const base = {
      shortName: cleanName(c.shortname),
      fullName: cleanName(c.displayname || c.fullname),
      url: `${ctx.client.baseUrl}/course/view.php?id=${c.id}`,
      startDate: c.startdate || null,
      endDate: c.enddate || null,
      hidden: Boolean(c.hidden),
      lastAccess: c.lastaccess ?? null,
      updatedAt: ctx.now,
      removedAt: null,
    };
    const old = existing.get(c.id);
    if (!old) {
      db()
        .insert(schema.courses)
        .values({
          id: c.id,
          ...base,
          active: guessActive(c, ctx.now),
          color: COURSE_COLORS[colorIndex++ % COURSE_COLORS.length],
          firstSeenAt: ctx.now,
        })
        .run();
      bump(ctx, 'courses.new');
      if (!firstEver) {
        recordChange(ctx, { type: 'course_new', courseId: null, entityType: 'course', entityId: c.id, title: base.fullName });
      }
    } else {
      db().update(schema.courses).set(base).where(eq(schema.courses.id, c.id)).run();
    }
  }

  const ids = list.map((c) => c.id);
  if (ids.length) {
    db().update(schema.courses).set({ removedAt: ctx.now })
      .where(and(notInArray(schema.courses.id, ids), isNull(schema.courses.removedAt)))
      .run();
  }
  bump(ctx, 'courses', list.length);
}
