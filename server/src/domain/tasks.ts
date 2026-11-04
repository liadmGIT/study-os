import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Subtask, Task } from '../db/schema';
import { getSettings } from '../lib/settings';
import { nowSec } from '../lib/time';
import { isNotStarted } from './alerts';
import { BUCKET_ORDER, computeUrgency, type Urgency } from './urgency';

export interface TaskView extends Task {
  subtasks: Subtask[];
  course: { id: number; name: string; color: string } | null;
  urgency: Urgency;
  notStarted: boolean;
}

export function toViews(rows: Task[], now = nowSec()): TaskView[] {
  if (!rows.length) return [];
  const s = getSettings();
  const ids = rows.map((r) => r.id);
  const subs = db().select().from(schema.subtasks).where(inArray(schema.subtasks.taskId, ids)).orderBy(asc(schema.subtasks.position)).all();
  const byTask = new Map<number, Subtask[]>();
  for (const st of subs) byTask.set(st.taskId, [...(byTask.get(st.taskId) ?? []), st]);
  const courseMap = new Map(db().select().from(schema.courses).all().map((c) => [c.id, c]));

  return rows.map((t) => {
    const st = byTask.get(t.id) ?? [];
    const done = st.filter((x) => x.done).length;
    const course = t.courseId ? courseMap.get(t.courseId) : undefined;
    return {
      ...t,
      subtasks: st,
      course: course ? { id: course.id, name: course.fullName, color: course.color } : null,
      urgency: computeUrgency(
        { dueAt: t.dueAt, cutoffAt: t.cutoffAt, status: t.status, priority: t.priority, estimateMin: t.estimateMin, subtasksTotal: st.length, subtasksDone: done },
        now,
      ),
      notStarted: isNotStarted(t, done, now, s.notStartedDays),
    };
  });
}

/** Visible tasks: personal + Moodle tasks of active courses, not removed or hidden. */
export function listTasks(opts: { includeHidden?: boolean; courseId?: number } = {}): TaskView[] {
  const activeCourseIds = db()
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(and(eq(schema.courses.active, true), isNull(schema.courses.removedAt)))
    .all()
    .map((c) => c.id);

  const conds = [isNull(schema.tasks.removedAt)];
  if (!opts.includeHidden) conds.push(eq(schema.tasks.hidden, false));
  if (opts.courseId) conds.push(eq(schema.tasks.courseId, opts.courseId));
  const courseCond = activeCourseIds.length
    ? or(eq(schema.tasks.source, 'personal'), inArray(schema.tasks.courseId, activeCourseIds))
    : eq(schema.tasks.source, 'personal');
  conds.push(courseCond!);

  const rows = db().select().from(schema.tasks).where(and(...conds)).all();
  return sortViews(toViews(rows));
}

export function sortViews(views: TaskView[]): TaskView[] {
  return views.sort(
    (a, b) =>
      BUCKET_ORDER.indexOf(a.urgency.bucket) - BUCKET_ORDER.indexOf(b.urgency.bucket) ||
      (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
      b.urgency.score - a.urgency.score ||
      a.id - b.id,
  );
}

export function getTaskView(id: number): TaskView | undefined {
  const row = db().select().from(schema.tasks).where(eq(schema.tasks.id, id)).get();
  return row ? toViews([row])[0] : undefined;
}
