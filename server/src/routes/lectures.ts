import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import type { Lecture, ModuleKind } from '../db/schema';
import { catchupPlanFor, computeLag, listLectures } from '../domain/lectures';
import { idParam, notFound, parse } from '../lib/http';
import { getSettings } from '../lib/settings';
import { nowSec, todayKey } from '../lib/time';
import { ensureLecture } from '../sync/contents';

const KINDS = ['recording', 'slides', 'file', 'folder', 'assignment', 'quiz', 'forum', 'link', 'page', 'meeting', 'label', 'other'] as const;

function getLecture(id: number): Lecture {
  return db().select().from(schema.lectures).where(eq(schema.lectures.moduleId, id)).get() ?? notFound('ההרצאה לא נמצאה');
}

function viewOf(id: number) {
  return listLectures({ includeIgnored: true }).find((l) => l.moduleId === id) ?? null;
}

export function lectureRoutes(app: FastifyInstance) {
  app.get('/api/lectures', async (req) => {
    const q = parse(z.object({ courseId: z.coerce.number().int().optional(), includeIgnored: z.coerce.boolean().optional() }), req.query);
    const all = listLectures({ includeIgnored: q.includeIgnored });
    const lectures = q.courseId ? all.filter((l) => l.courseId === q.courseId) : all;
    return { lectures, lag: computeLag(all.filter((l) => !l.ignored)), today: todayKey() };
  });

  app.get('/api/lectures/plan', async (req) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(30).default(7) }), req.query);
    return { ...catchupPlanFor(todayKey(), days), dailyMin: getSettings().dailyStudyMin };
  });

  app.patch('/api/lectures/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        status: z.enum(['unwatched', 'in_progress', 'watched']).optional(),
        positionMin: z.number().int().min(0).max(1000).optional(),
        durationMin: z.number().int().min(1).max(1000).nullable().optional(),
        notesMd: z.string().max(100000).optional(),
        lectureDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        ignored: z.boolean().optional(),
        slidesModuleId: z.number().int().nullable().optional(),
      }),
      req.body,
    );
    const lec = getLecture(id);
    const now = nowSec();
    const update: Partial<Lecture> = { ...body, updatedAt: now };
    const duration = body.durationMin !== undefined ? body.durationMin : lec.durationMin;

    // Entering a position moves the status along on its own.
    if (body.positionMin !== undefined && body.status === undefined) {
      if (duration && body.positionMin >= duration) update.status = 'watched';
      else if (body.positionMin > 0 && lec.status === 'unwatched') update.status = 'in_progress';
    }
    const status = update.status ?? lec.status;
    if (status === 'watched' && lec.status !== 'watched') update.watchedAt = now;
    if (status !== 'watched') update.watchedAt = null;
    if (body.status === 'unwatched' && body.positionMin === undefined) update.positionMin = 0;

    db().update(schema.lectures).set(update).where(eq(schema.lectures.moduleId, id)).run();
    return viewOf(id);
  });

  /** "Open": marks the lecture as started and returns the link to open. */
  app.post('/api/lectures/:id/open', async (req) => {
    const { id } = parse(idParam, req.params);
    const lec = getLecture(id);
    const update: Partial<Lecture> = { openedAt: nowSec(), updatedAt: nowSec() };
    if (lec.status === 'unwatched') update.status = 'in_progress';
    db().update(schema.lectures).set(update).where(eq(schema.lectures.moduleId, id)).run();
    const view = viewOf(id);
    return { url: view?.openUrl ?? null, lecture: view };
  });

  /** Fix a wrong classification ("this is a recording" / "this isn't"). */
  app.patch('/api/modules/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const { kindOverride } = parse(z.object({ kindOverride: z.enum(KINDS).nullable() }), req.body);
    const mod = db().select().from(schema.modules).where(eq(schema.modules.id, id)).get() ?? notFound('הפריט לא נמצא');
    db()
      .update(schema.modules)
      .set({ kindOverride: kindOverride as ModuleKind | null })
      .where(eq(schema.modules.id, id))
      .run();
    const effective = kindOverride ?? mod.kind;
    if (effective === 'recording') {
      const course = db().select().from(schema.courses).where(eq(schema.courses.id, mod.courseId)).get();
      if (course) ensureLecture({ now: nowSec(), quietCourses: new Set() }, course, mod.id, mod.sectionId);
    }
    return { ok: true, kind: effective };
  });
}
