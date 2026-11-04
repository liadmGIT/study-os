// Assignments, quizzes and other dated activities become tasks. Tracks due-date changes and submission state.
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Task, TaskSource } from '../db/schema';
import { DAY } from '../lib/time';
import type {
  ActionEventsResponse,
  AssignmentsResponse,
  QuizAttemptsResponse,
  QuizzesResponse,
  SubmissionStatusResponse,
} from '../moodle/types';
import { bump, can, recordChange, step, type SyncContext } from './context';

export function stripHtml(html: string | undefined | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

/** Skip status calls for old, settled tasks so each sync stays light. */
function needsStatusCheck(task: Task, now: number): boolean {
  if (!task.dueAt) return true;
  if (task.dueAt > now - 14 * DAY) return true;
  if (!task.moodleStatus) return true;
  return !task.grade && task.dueAt > now - 60 * DAY;
}

export async function syncAssignments(ctx: SyncContext) {
  if (!can(ctx, 'mod_assign_get_assignments') || !ctx.activeCourses.length) return;
  const res = await ctx.client.call<AssignmentsResponse>('mod_assign_get_assignments', {
    courseids: ctx.activeCourses.map((c) => c.id),
  });
  const seen: number[] = [];
  const toCheck: { task: Task; assignId: number }[] = [];
  for (const course of res.courses) {
    for (const a of course.assignments) {
      seen.push(a.id);
      const task = upsertMoodleTask(ctx, {
        source: 'assign',
        moodleId: a.id,
        cmid: a.cmid,
        courseId: a.course ?? course.id,
        title: a.name,
        description: stripHtml(a.intro) || null,
        url: `${ctx.client.baseUrl}/mod/assign/view.php?id=${a.cmid}`,
        dueAt: a.duedate,
        cutoffAt: a.cutoffdate,
        opensAt: a.allowsubmissionsfromdate,
      });
      if (!a.nosubmissions && needsStatusCheck(task, ctx.now)) toCheck.push({ task, assignId: a.id });
    }
  }
  markMissingRemoved(ctx, 'assign', seen);
  bump(ctx, 'assignments', seen.length);

  if (!can(ctx, 'mod_assign_get_submission_status')) return;
  await Promise.all(
    toCheck.map(({ task, assignId }) =>
      step(ctx, `submission ${assignId}`, async () => {
        const s = await ctx.client.call<SubmissionStatusResponse>('mod_assign_get_submission_status', { assignid: assignId });
        const sub = s.lastattempt?.submission ?? s.lastattempt?.teamsubmission;
        const graded = s.feedback?.gradefordisplay ? stripHtml(s.feedback.gradefordisplay) : null;
        applyMoodleStatus(ctx, task, sub?.status ?? null, graded || null);
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
      title: q.name,
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
  const res = await ctx.client.call<ActionEventsResponse>('core_calendar_get_action_events_by_timesort', {
    timesortfrom: ctx.now - 14 * DAY,
    limitnum: 50,
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
      title: e.activityname || e.name,
      description: null,
      url: e.url ?? e.action?.url ?? null,
      dueAt: e.timesort ?? e.timestart,
    });
  }
  bump(ctx, 'events', res.events.length);
}

function markMissingRemoved(ctx: SyncContext, source: TaskSource, seenIds: number[]) {
  const courseIds = ctx.activeCourses.map((c) => c.id);
  if (!courseIds.length) return;
  const conds = [eq(schema.tasks.source, source), inArray(schema.tasks.courseId, courseIds), isNull(schema.tasks.removedAt)];
  if (seenIds.length) conds.push(notInArray(schema.tasks.moodleId, seenIds));
  db()
    .update(schema.tasks)
    .set({ removedAt: ctx.now })
    .where(and(...conds))
    .run();
}
