import { eq, max } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import type { Task } from '../db/schema';
import { getTaskView, listTasks } from '../domain/tasks';
import { HttpError, idParam, notFound, parse } from '../lib/http';
import { nowSec } from '../lib/time';

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  courseId: z.number().int().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  dueAt: z.number().int().nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  estimateMin: z.number().int().min(0).max(100000).nullable().optional(),
  plannedDate: dayKey.nullable().optional(),
  subtasks: z.array(z.string().trim().min(1)).max(100).optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  courseId: z.number().int().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  dueAt: z.number().int().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'submitted', 'done']).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  estimateMin: z.number().int().min(0).max(100000).nullable().optional(),
  plannedDate: dayKey.nullable().optional(),
  hidden: z.boolean().optional(),
});

function getTask(id: number): Task {
  return db().select().from(schema.tasks).where(eq(schema.tasks.id, id)).get() ?? notFound('המשימה לא נמצאה');
}

function nextPosition(taskId: number): number {
  const row = db()
    .select({ m: max(schema.subtasks.position) })
    .from(schema.subtasks)
    .where(eq(schema.subtasks.taskId, taskId))
    .get();
  return (row?.m ?? -1) + 1;
}

function addSubtasks(taskId: number, titles: string[]) {
  let pos = nextPosition(taskId);
  const now = nowSec();
  for (const title of titles) db().insert(schema.subtasks).values({ taskId, title, position: pos++, createdAt: now }).run();
}

/** Ticking a subtask means the work has started. */
function touchStarted(taskId: number) {
  const t = getTask(taskId);
  if (t.status === 'todo') {
    db().update(schema.tasks).set({ status: 'in_progress', startedAt: nowSec(), updatedAt: nowSec() }).where(eq(schema.tasks.id, taskId)).run();
  }
}

export function taskRoutes(app: FastifyInstance) {
  app.get('/api/tasks', async (req) => {
    const q = parse(z.object({ courseId: z.coerce.number().int().optional(), includeHidden: z.coerce.boolean().optional() }), req.query);
    return listTasks(q);
  });

  app.get('/api/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getTaskView(id) ?? notFound('המשימה לא נמצאה');
  });

  app.post('/api/tasks', async (req) => {
    const body = parse(createSchema, req.body);
    const now = nowSec();
    const row = db()
      .insert(schema.tasks)
      .values({
        source: 'personal',
        title: body.title,
        courseId: body.courseId ?? null,
        description: body.description ?? null,
        dueAt: body.dueAt ?? null,
        priority: body.priority ?? 0,
        estimateMin: body.estimateMin ?? null,
        plannedDate: body.plannedDate ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (body.subtasks?.length) addSubtasks(row.id, body.subtasks);
    return getTaskView(row.id);
  });

  app.patch('/api/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(patchSchema, req.body);
    const task = getTask(id);
    const now = nowSec();
    if (task.source !== 'personal' && (body.title !== undefined || body.dueAt !== undefined || body.courseId !== undefined)) {
      throw new HttpError(400, 'את השם, הקורס ותאריך ההגשה של מטלה מ-Moodle אי אפשר לשנות כאן.', 'moodle_owned');
    }
    const update: Partial<Task> = { ...body, updatedAt: now };
    if (body.status && body.status !== task.status) {
      if (body.status === 'in_progress' && !task.startedAt) update.startedAt = now;
      if (body.status === 'done' || body.status === 'submitted') update.completedAt = now;
      if (body.status === 'todo' || body.status === 'in_progress') update.completedAt = null;
    }
    db().update(schema.tasks).set(update).where(eq(schema.tasks.id, id)).run();
    return getTaskView(id);
  });

  app.delete('/api/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const task = getTask(id);
    if (task.source === 'personal') db().delete(schema.tasks).where(eq(schema.tasks.id, id)).run();
    else db().update(schema.tasks).set({ hidden: true, updatedAt: nowSec() }).where(eq(schema.tasks.id, id)).run();
    return { ok: true };
  });

  app.post('/api/tasks/:id/subtasks', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ title: z.string().trim().min(1).max(300).optional(), titles: z.array(z.string().trim().min(1)).max(100).optional() }), req.body);
    getTask(id);
    addSubtasks(id, body.titles ?? (body.title ? [body.title] : []));
    return getTaskView(id);
  });

  /** "Split into N questions": creates "שאלה 1" … "שאלה N". */
  app.post('/api/tasks/:id/split', async (req) => {
    const { id } = parse(idParam, req.params);
    const { count, prefix } = parse(
      z.object({ count: z.number().int().min(1).max(50), prefix: z.string().trim().min(1).max(40).default('שאלה') }),
      req.body,
    );
    getTask(id);
    addSubtasks(
      id,
      Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`),
    );
    return getTaskView(id);
  });

  app.patch('/api/subtasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({ title: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional(), position: z.number().int().min(0).optional() }),
      req.body,
    );
    const st = db().select().from(schema.subtasks).where(eq(schema.subtasks.id, id)).get() ?? notFound();
    db().update(schema.subtasks).set(body).where(eq(schema.subtasks.id, id)).run();
    if (body.done) touchStarted(st.taskId);
    return getTaskView(st.taskId);
  });

  app.delete('/api/subtasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const st = db().select().from(schema.subtasks).where(eq(schema.subtasks.id, id)).get() ?? notFound();
    db().delete(schema.subtasks).where(eq(schema.subtasks.id, id)).run();
    return getTaskView(st.taskId);
  });
}
