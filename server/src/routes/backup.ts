// Backup of what exists only here (not in Moodle): notes, watch progress, personal tasks,
// subtasks, priorities, course settings and app settings. Restore matches rows by Moodle ids.
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import type { ModuleKind } from '../db/schema';
import { attachment, parse } from '../lib/http';
import { getKV, setKV, type AppSettings } from '../lib/settings';
import { dayKey, nowSec } from '../lib/time';
import { ensureLecture } from '../sync/contents';

const BACKUP_VERSION = 1;

const subtaskSchema = z.object({ title: z.string().min(1).max(300), done: z.boolean() });
const taskFields = {
  status: z.enum(['todo', 'in_progress', 'submitted', 'done']),
  priority: z.number().int().min(0).max(3),
  estimateMin: z.number().int().nullable(),
  plannedDate: z.string().nullable(),
  hidden: z.boolean(),
  subtasks: z.array(subtaskSchema).max(200),
};

const backupSchema = z.object({
  app: z.literal('study-os'),
  version: z.number().int(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  courses: z.array(z.object({ id: z.number().int(), active: z.boolean(), color: z.string(), credits: z.number().nullable() })).default([]),
  modules: z.array(z.object({ id: z.number().int(), kindOverride: z.string() })).default([]),
  lectures: z
    .array(
      z.object({
        moduleId: z.number().int(),
        status: z.enum(['unwatched', 'in_progress', 'watched']),
        positionMin: z.number().int().min(0),
        durationMin: z.number().int().nullable(),
        notesMd: z.string().max(200000),
        ignored: z.boolean(),
        lectureDate: z.string().nullable(),
      }),
    )
    .default([]),
  moodleTasks: z.array(z.object({ source: z.enum(['assign', 'quiz', 'event']), moodleId: z.number().int(), ...taskFields })).default([]),
  personalTasks: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        courseId: z.number().int().nullable(),
        description: z.string().nullable(),
        dueAt: z.number().int().nullable(),
        createdAt: z.number().int(),
        ...taskFields,
      }),
    )
    .default([]),
});

export type Backup = z.infer<typeof backupSchema>;

export function buildBackup(): Backup {
  const subtasksOf = (taskId: number) =>
    db()
      .select()
      .from(schema.subtasks)
      .where(eq(schema.subtasks.taskId, taskId))
      .orderBy(schema.subtasks.position)
      .all()
      .map((s) => ({ title: s.title, done: s.done }));
  const tasks = db().select().from(schema.tasks).all();
  const userFields = (t: (typeof tasks)[number]) => ({
    status: t.status,
    priority: t.priority,
    estimateMin: t.estimateMin,
    plannedDate: t.plannedDate,
    hidden: t.hidden,
    subtasks: subtasksOf(t.id),
  });
  return {
    app: 'study-os',
    version: BACKUP_VERSION,
    settings: getKV<Record<string, unknown>>('app') ?? null,
    courses: db()
      .select()
      .from(schema.courses)
      .all()
      .map((c) => ({ id: c.id, active: c.active, color: c.color, credits: c.credits })),
    modules: db()
      .select()
      .from(schema.modules)
      .all()
      .filter((m) => m.kindOverride)
      .map((m) => ({ id: m.id, kindOverride: m.kindOverride! })),
    lectures: db()
      .select()
      .from(schema.lectures)
      .all()
      .map((l) => ({
        moduleId: l.moduleId,
        status: l.status,
        positionMin: l.positionMin,
        durationMin: l.durationMin,
        notesMd: l.notesMd,
        ignored: l.ignored,
        lectureDate: l.lectureDate,
      })),
    moodleTasks: tasks
      .filter((t) => t.source !== 'personal' && t.moodleId !== null)
      .map((t) => ({ source: t.source as 'assign' | 'quiz' | 'event', moodleId: t.moodleId!, ...userFields(t) })),
    personalTasks: tasks
      .filter((t) => t.source === 'personal')
      .map((t) => ({ title: t.title, courseId: t.courseId, description: t.description, dueAt: t.dueAt, createdAt: t.createdAt, ...userFields(t) })),
  };
}

function replaceSubtasks(taskId: number, subtasks: { title: string; done: boolean }[]) {
  db().delete(schema.subtasks).where(eq(schema.subtasks.taskId, taskId)).run();
  const now = nowSec();
  subtasks.forEach((s, position) => db().insert(schema.subtasks).values({ taskId, title: s.title, done: s.done, position, createdAt: now }).run());
}

export function restoreBackup(b: Backup) {
  const applied = { settings: 0, courses: 0, modules: 0, lectures: 0, tasks: 0, personalTasks: 0 };
  const skipped = { courses: 0, modules: 0, lectures: 0, tasks: 0, personalTasks: 0 };
  const now = nowSec();

  db().transaction(() => {
    if (b.settings) {
      setKV('app', { ...(getKV<AppSettings>('app') ?? {}), ...b.settings });
      applied.settings = 1;
    }
    for (const c of b.courses) {
      const r = db().update(schema.courses).set({ active: c.active, color: c.color, credits: c.credits }).where(eq(schema.courses.id, c.id)).run();
      if (r.changes) applied.courses++;
      else skipped.courses++;
    }
    for (const m of b.modules) {
      const mod = db().select().from(schema.modules).where(eq(schema.modules.id, m.id)).get();
      if (!mod) {
        skipped.modules++;
        continue;
      }
      db()
        .update(schema.modules)
        .set({ kindOverride: m.kindOverride as ModuleKind })
        .where(eq(schema.modules.id, m.id))
        .run();
      if (m.kindOverride === 'recording') {
        const course = db().select().from(schema.courses).where(eq(schema.courses.id, mod.courseId)).get();
        if (course) ensureLecture({ now, quietCourses: new Set() }, course, mod.id, mod.sectionId);
      }
      applied.modules++;
    }
    for (const l of b.lectures) {
      const { moduleId, ...fields } = l;
      const r = db()
        .update(schema.lectures)
        .set({ ...fields, watchedAt: fields.status === 'watched' ? now : null, updatedAt: now })
        .where(eq(schema.lectures.moduleId, moduleId))
        .run();
      if (r.changes) applied.lectures++;
      else skipped.lectures++;
    }
    for (const t of b.moodleTasks) {
      const row = db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.source, t.source), eq(schema.tasks.moodleId, t.moodleId)))
        .get();
      if (!row) {
        skipped.tasks++;
        continue;
      }
      const { subtasks, ...fields } = t;
      db()
        .update(schema.tasks)
        .set({ status: fields.status, priority: fields.priority, estimateMin: fields.estimateMin, plannedDate: fields.plannedDate, hidden: fields.hidden, updatedAt: now })
        .where(eq(schema.tasks.id, row.id))
        .run();
      if (subtasks.length) replaceSubtasks(row.id, subtasks);
      applied.tasks++;
    }
    for (const t of b.personalTasks) {
      // The same task restored twice is recognised by its title and creation time.
      const existing = db()
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.source, 'personal'), eq(schema.tasks.title, t.title), eq(schema.tasks.createdAt, t.createdAt)))
        .get();
      if (existing) {
        skipped.personalTasks++;
        continue;
      }
      const courseOk = t.courseId === null || !!db().select({ id: schema.courses.id }).from(schema.courses).where(eq(schema.courses.id, t.courseId)).get();
      const row = db()
        .insert(schema.tasks)
        .values({
          source: 'personal',
          title: t.title,
          courseId: courseOk ? t.courseId : null,
          description: t.description,
          dueAt: t.dueAt,
          status: t.status,
          priority: t.priority,
          estimateMin: t.estimateMin,
          plannedDate: t.plannedDate,
          hidden: t.hidden,
          createdAt: t.createdAt,
          updatedAt: now,
        })
        .returning({ id: schema.tasks.id })
        .get();
      replaceSubtasks(row.id, t.subtasks);
      applied.personalTasks++;
    }
  });
  return { applied, skipped };
}

export function backupRoutes(app: FastifyInstance) {
  app.get('/api/backup', async (_req, reply) => {
    attachment(reply, `study-os-backup-${dayKey(nowSec())}.json`);
    reply.type('application/json; charset=utf-8');
    return JSON.stringify(buildBackup(), null, 2);
  });

  app.post('/api/backup/restore', { bodyLimit: 25 * 1024 * 1024 }, async (req) => {
    return restoreBackup(parse(backupSchema, req.body));
  });
}
