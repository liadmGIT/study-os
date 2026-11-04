import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import { computeLag, listLectures } from '../domain/lectures';
import { listTasks } from '../domain/tasks';
import { idParam, notFound, parse } from '../lib/http';

export function courseRoutes(app: FastifyInstance) {
  app.get('/api/courses', async () => {
    const courses = db().select().from(schema.courses).where(isNull(schema.courses.removedAt)).orderBy(asc(schema.courses.fullName)).all();
    const tasks = listTasks();
    const lag = new Map(computeLag(listLectures()).map((l) => [l.courseId, l]));
    const unread = db().select().from(schema.announcements).where(eq(schema.announcements.read, false)).all();
    return courses.map((c) => ({
      ...c,
      openTasks: tasks.filter((t) => t.courseId === c.id && !['done', 'submitted', 'expired'].includes(t.urgency.bucket)).length,
      nextDue: tasks
        .filter((t) => t.courseId === c.id && t.dueAt && ['overdue', 'urgent', 'week', 'later'].includes(t.urgency.bucket))
        .map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt }))[0] ?? null,
      lag: lag.get(c.id) ?? null,
      unreadAnnouncements: unread.filter((a) => a.courseId === c.id).length,
    }));
  });

  app.patch('/api/courses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        active: z.boolean().optional(),
        color: z
          .string()
          .regex(/^#[0-9a-f]{6}$/i)
          .optional(),
        credits: z.number().min(0).max(30).nullable().optional(),
      }),
      req.body,
    );
    db().update(schema.courses).set(body).where(eq(schema.courses.id, id)).run();
    return db().select().from(schema.courses).where(eq(schema.courses.id, id)).get() ?? notFound();
  });

  app.get('/api/courses/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const course = db().select().from(schema.courses).where(eq(schema.courses.id, id)).get() ?? notFound('הקורס לא נמצא');
    const sections = db()
      .select()
      .from(schema.sections)
      .where(and(eq(schema.sections.courseId, id), isNull(schema.sections.removedAt)))
      .orderBy(asc(schema.sections.number))
      .all();
    const modules = db()
      .select()
      .from(schema.modules)
      .where(and(eq(schema.modules.courseId, id), isNull(schema.modules.removedAt)))
      .orderBy(asc(schema.modules.position))
      .all();
    const files = db()
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.courseId, id), isNull(schema.files.removedAt)))
      .all();
    const announcements = db()
      .select()
      .from(schema.announcements)
      .where(eq(schema.announcements.courseId, id))
      .orderBy(desc(schema.announcements.postedAt))
      .limit(30)
      .all();
    const lectures = listLectures({ courseId: id });
    return {
      course,
      sections: sections.map((s) => ({
        ...s,
        modules: modules
          .filter((m) => m.sectionId === s.id && m.modname !== 'label')
          .map((m) => ({
            id: m.id,
            name: m.name,
            modname: m.modname,
            kind: m.kindOverride ?? m.kind,
            autoKind: m.kind,
            kindOverride: m.kindOverride,
            url: m.url,
            externalUrl: m.externalUrl,
            visible: m.visible,
            firstSeenAt: m.firstSeenAt,
            files: files
              .filter((f) => f.moduleId === m.id)
              .map((f) => ({ id: f.id, filename: f.filename, fileSize: f.fileSize, downloadedAt: f.downloadedAt, skippedReason: f.skippedReason })),
          })),
      })),
      tasks: listTasks({ courseId: id }),
      lectures,
      lag: computeLag(lectures)[0] ?? null,
      announcements,
    };
  });
}
