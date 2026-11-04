// Assignments, quizzes and other dated activities become tasks. Tracks due-date changes and submission state.
import { and, eq, gte, inArray, isNull, notInArray, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Task, TaskSource } from '../db/schema';
import { cleanName, stripHtml } from '../lib/html';
import { DAY, HOUR } from '../lib/time';
import type {
  ActionEventsResponse,
  AssignmentsResponse,
  QuizAttemptsResponse,
  QuizzesResponse,
  SubmissionStatusResponse,
} from '../moodle/types';
import { bump, can, recordChange, step, type SyncContext } from './context';

interface MoodleTaskInput {
  source: Exclude<TaskSource, 'personal'>;
  moodleId: number;
  cmid: number | null;
  courseId: number;
  title: string;
  description: string | null;
  url: string | null;
  dueAt: number | null;
  cutoffAt?: number | null;
  opensAt?: number | null;
}

/** Insert or update a task that comes from Moodle. Returns the stored row. */
export function upsertMoodleTask(ctx: SyncContext, input: MoodleTaskInput): Task {
  const old = db()
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.source, input.source), eq(schema.tasks.moodleId, input.moodleId)))
    .get();
  const fields = {
    cmid: input.cmid,
    courseId: input.courseId,
    title: input.title,
    description: input.description,
    url: input.url,
    dueAt: input.dueAt || null,
    cutoffAt: input.cutoffAt || null,
    opensAt: input.opensAt || null,
    removedAt: null,
  };

  if (!old) {
    const row = db()
      .insert(schema.tasks)
      .values({ source: input.source, moodleId: input.moodleId, ...fields, createdAt: ctx.now, updatedAt: ctx.now })
      .returning()
      .get();
    bump(ctx, 'tasks.new');
    if (!fields.dueAt || fields.dueAt > ctx.now - DAY) {
      recordChange(ctx, {
        type: 'task_new',
        courseId: input.courseId,
        entityType: 'task',
        entityId: row.id,
        title: input.title,
        payload: { dueAt: fields.dueAt, source: input.source },
      });
    }
    return row;
  }

  const dueChanged = (old.dueAt ?? null) !== fields.dueAt;
  const changed =
    dueChanged ||
    old.title !== fields.title ||
    old.description !== fields.description ||
    old.cutoffAt !== fields.cutoffAt ||
    old.opensAt !== fields.opensAt ||
    old.removedAt !== null ||
    old.courseId !== fields.courseId ||
    old.url !== fields.url;
  if (!changed) return old;

  const update: Partial<Task> = { ...fields, updatedAt: ctx.now };
  if (dueChanged) {
    update.prevDueAt = old.dueAt;
    update.dueChangedAt = ctx.now;
    recordChange(ctx, {
      type: 'due_changed',
      courseId: input.courseId,
      entityType: 'task',
      entityId: old.id,
      title: input.title,
      payload: { from: old.dueAt, to: fields.dueAt },
    });
  }
  return db().update(schema.tasks).set(update).where(eq(schema.tasks.id, old.id)).returning().get();
}

/** Apply what Moodle says about the submission to the task's own status. */
export function applyMoodleStatus(ctx: SyncContext, task: Task, moodleStatus: string | null, grade: string | null) {
  const update: Partial<Task> = {};
  if (moodleStatus !== task.moodleStatus) {
    update.moodleStatus = moodleStatus;
    const submitted = moodleStatus === 'submitted' || moodleStatus === 'finished';
    if (submitted && (task.status === 'todo' || task.status === 'in_progress')) {
      update.status = 'submitted';
      update.completedAt = ctx.now;
      recordChange(ctx, { type: 'submitted', courseId: task.courseId, entityType: 'task', entityId: task.id, title: task.title });
    } else if ((moodleStatus === 'draft' || moodleStatus === 'inprogress') && task.status === 'todo') {
      update.status = 'in_progress';
      update.startedAt = ctx.now;
    } else if ((moodleStatus === 'new' || moodleStatus === 'reopened') && task.status === 'submitted' && task.moodleStatus) {
      // Submission was reverted / reopened in Moodle.
      update.status = 'in_progress';
      update.completedAt = null;
    }
  }
  if (grade && grade !== task.grade) {
    update.grade = grade;
    update.gradedAt = ctx.now;
    recordChange(ctx, {
      type: 'grade_new',
      courseId: task.courseId,
      entityType: 'task',
      entityId: task.id,
      title: task.title,
      payload: { grade },
    });
  }
  if (Object.keys(update).length) {
    db()
      .update(schema.tasks)
      .set({ ...update, updatedAt: ctx.now })
      .where(eq(schema.tasks.id, task.id))
      .run();
  }
}

const lastStatusCheck = new Map<number, number>();

/**
 * Decides whether to ask Moodle for this task's submission state in this sync.
 * Tasks due within ±14 days are checked every sync; far-off or undated ones hourly;
 * old ones hourly until graded (or 60 days old). Everything is checked once after a restart.
 */
export function needsStatusCheck(task: Task, now: number): boolean {
  const last = lastStatusCheck.get(task.id);
  let due: boolean;
  if (last === undefined) due = true;
  else if (task.dueAt && task.dueAt < now - 14 * DAY) due = !task.grade && task.dueAt > now - 60 * DAY && now - last >= HOUR;
  else if (!task.dueAt || task.dueAt > now + 14 * DAY) due = now - last >= HOUR;
  else due = true;
  if (due) lastStatusCheck.set(task.id, now);
  return due;
}

/** Moodle shows "-" (or nothing) when there is feedback but no grade. */
export function gradeText(gradefordisplay: string | undefined): string | null {
  const g = stripHtml(gradefordisplay);
  return g && g !== '-' ? g : null;
}

export async function syncAssignments(ctx: SyncContext) {
  if (!can(ctx, 'mod_assign_get_assignments') || !ctx.activeCourses.length) return;
  const res = await ctx.client.call<AssignmentsResponse>('mod_assign_get_assignments', {
    courseids: ctx.activeCourses.map((c) => c.id),
  });
  const seen: number[] = [];
  const toCheck: { task: Task; assignId: number; team: boolean }[] = [];
  for (const course of res.courses) {
    for (const a of course.assignments) {
      seen.push(a.id);
      const task = upsertMoodleTask(ctx, {
        source: 'assign',
        moodleId: a.id,
        cmid: a.cmid,
        courseId: a.course ?? course.id,
        title: cleanName(a.name),
        description: stripHtml(a.intro) || null,
        url: `${ctx.client.baseUrl}/mod/assign/view.php?id=${a.cmid}`,
        dueAt: a.duedate,
        cutoffAt: a.cutoffdate,
        opensAt: a.allowsubmissionsfromdate,
      });
      if (!a.nosubmissions && needsStatusCheck(task, ctx.now)) toCheck.push({ task, assignId: a.id, team: Boolean(a.teamsubmission) });
    }
  }
  markMissingRemoved(ctx, 'assign', seen);
  bump(ctx, 'assignments', seen.length);

  if (!can(ctx, 'mod_assign_get_submission_status')) return;
  await Promise.all(
    toCheck.map(({ task, assignId, team }) =>
      step(ctx, `submission ${assignId}`, async () => {
        const s = await ctx.client.call<SubmissionStatusResponse>('mod_assign_get_submission_status', { assignid: assignId });
        // In group assignments the partner's submission is the team submission; the personal one stays "new".
        const attempt = s.lastattempt;
        const sub = team ? (attempt?.teamsubmission ?? attempt?.submission) : (attempt?.submission ?? attempt?.teamsubmission);
        applyMoodleStatus(ctx, task, sub?.status ?? null, gradeText(s.feedback?.gradefordisplay));
      }),
    ),
  );
}

export async function syncQuizzes(ctx: SyncContext) {
  if (!can(ctx, 'mod_quiz_get_quizzes_by_courses') || !ctx.activeCourses.length) return;
  const res = await ctx.client.call<QuizzesResponse>('mod_quiz_get_quizzes_by_courses', {
    courseids: ctx.activeCourses.map((c) => c.id),
  });
  const seen: number[] = [];
  const toCheck: { task: Task; quizId: number }[] = [];
  for (const q of res.quizzes) {
    seen.push(q.id);
    const task = upsertMoodleTask(ctx, {
      source: 'quiz',
      moodleId: q.id,
      cmid: q.coursemodule,
      courseId: q.course,
      title: cleanName(q.name),
      description: stripHtml(q.intro) || null,
      url: `${ctx.client.baseUrl}/mod/quiz/view.php?id=${q.coursemodule}`,
      dueAt: q.timeclose ?? null,
      opensAt: q.timeopen ?? null,
    });
    if (needsStatusCheck(task, ctx.now)) toCheck.push({ task, quizId: q.id });
  }
  markMissingRemoved(ctx, 'quiz', seen);
  bump(ctx, 'quizzes', seen.length);

  if (!can(ctx, 'mod_quiz_get_user_attempts')) return;
  await Promise.all(
    toCheck.map(({ task, quizId }) =>
      step(ctx, `quiz attempts ${quizId}`, async () => {
        const r = await ctx.client.call<QuizAttemptsResponse>('mod_quiz_get_user_attempts', { quizid: quizId, status: 'all' });
        const states = r.attempts.map((a) => a.state);
        const status = states.includes('finished') ? 'finished' : states.includes('inprogress') ? 'inprogress' : null;
        applyMoodleStatus(ctx, task, status, null);
      }),
    ),
  );
}

/** Other dated activities (workshops, lessons, feedback forms...) from the Moodle timeline. */
export async function syncActionEvents(ctx: SyncContext) {
  if (!can(ctx, 'core_calendar_get_action_events_by_timesort')) return;
  const timesortfrom = ctx.now - 14 * DAY;
  const limitnum = 50;
  const res = await ctx.client.call<ActionEventsResponse>('core_calendar_get_action_events_by_timesort', {
    timesortfrom,
    limitnum,
    limittononsuspendedevents: 1,
  });
  const activeIds = new Set(ctx.activeCourses.map((c) => c.id));
  for (const e of res.events) {
    if (!e.course?.id || !activeIds.has(e.course.id)) continue;
    if (e.modulename === 'assign' || e.modulename === 'quiz') continue; // covered above
    upsertMoodleTask(ctx, {
      source: 'event',
      moodleId: e.id,
      cmid: null,
      courseId: e.course.id,
      title: cleanName(e.activityname || e.name),
      description: null,
      url: e.url ?? e.action?.url ?? null,
      dueAt: e.timesort ?? e.timestart,
    });
  }
  // Moodle drops an action event once it's done (form filled, lesson finished). If we got the whole
  // list (fewer than the page size), tasks whose event is gone are finished or deleted.
  if (res.events.length < limitnum) {
    markMissingRemoved(
      ctx,
      'event',
      res.events.map((e) => e.id),
      gte(schema.tasks.dueAt, timesortfrom),
    );
  }
  bump(ctx, 'events', res.events.length);
}

function markMissingRemoved(ctx: SyncContext, source: TaskSource, seenIds: number[], extra?: SQL) {
  const courseIds = ctx.activeCourses.map((c) => c.id);
  if (!courseIds.length) return;
  const conds: SQL[] = [eq(schema.tasks.source, source), inArray(schema.tasks.courseId, courseIds), isNull(schema.tasks.removedAt)];
  if (extra) conds.push(extra);
  if (seenIds.length) conds.push(notInArray(schema.tasks.moodleId, seenIds));
  db()
    .update(schema.tasks)
    .set({ removedAt: ctx.now })
    .where(and(...conds))
    .run();
}
