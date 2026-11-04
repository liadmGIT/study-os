import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { db, schema } from '../db';
import { attachment, HttpError, idParam, notFound, parse } from '../lib/http';
import { nowSec } from '../lib/time';
import { clientFor, getAccount } from '../moodle/account';
import { downloadFile, localPathFor, safeName } from '../sync/files';

function absPath(rel: string): string {
  const abs = path.resolve(config.filesDir, rel);
  if (!abs.startsWith(path.resolve(config.filesDir) + path.sep)) throw new HttpError(400, 'Bad path');
  return abs;
}

export function fileRoutes(app: FastifyInstance) {
  app.get('/api/files', async (req) => {
    const q = parse(z.object({ courseId: z.coerce.number().int().optional() }), req.query);
    const conds = [isNull(schema.files.removedAt)];
    if (q.courseId) conds.push(eq(schema.files.courseId, q.courseId));
    return db()
      .select({
        file: schema.files,
        moduleName: schema.modules.name,
        sectionName: schema.sections.name,
        sectionNumber: schema.sections.number,
        courseName: schema.courses.fullName,
        courseColor: schema.courses.color,
      })
      .from(schema.files)
      .innerJoin(schema.courses, eq(schema.files.courseId, schema.courses.id))
      .leftJoin(schema.modules, eq(schema.files.moduleId, schema.modules.id))
      .leftJoin(schema.sections, eq(schema.files.sectionId, schema.sections.id))
      .where(and(...conds, eq(schema.courses.active, true)))
      .orderBy(asc(schema.sections.number), asc(schema.modules.position), asc(schema.files.filename))
      .all()
      .map((r) => ({
        ...r.file,
        fileUrl: undefined,
        moduleName: r.moduleName,
        sectionName: r.sectionName,
        sectionNumber: r.sectionNumber,
        courseName: r.courseName,
        courseColor: r.courseColor,
        state: r.file.downloadedAt ? 'downloaded' : r.file.skippedReason ? r.file.skippedReason : 'pending',
      }));
  });

  /** Serves the local copy, or streams it straight from Moodle if it wasn't downloaded. */
  app.get('/api/files/:id/download', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const { inline } = parse(z.object({ inline: z.coerce.boolean().optional() }), req.query);
    const f = db().select().from(schema.files).where(eq(schema.files.id, id)).get() ?? notFound('הקובץ לא נמצא');
    attachment(reply, f.filename, inline);
    if (f.mimeType) reply.type(f.mimeType);
    if (f.localPath && fs.existsSync(absPath(f.localPath))) {
      return reply.send(fs.createReadStream(absPath(f.localPath)));
    }
    const account = getAccount();
    if (!account) throw new HttpError(409, 'אין חיבור ל-Moodle');
    const res = await clientFor(account).download(f.fileUrl);
    return reply.send(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream));
  });

  app.post('/api/files/:id/retry', async (req) => {
    const { id } = parse(idParam, req.params);
    const f = db().select().from(schema.files).where(eq(schema.files.id, id)).get() ?? notFound('הקובץ לא נמצא');
    const account = getAccount();
    if (!account) throw new HttpError(409, 'אין חיבור ל-Moodle');
    const course = db().select().from(schema.courses).where(eq(schema.courses.id, f.courseId)).get();
    const section = f.sectionId ? db().select().from(schema.sections).where(eq(schema.sections.id, f.sectionId)).get() : undefined;
    const rel = localPathFor(course?.fullName ?? String(f.courseId), section?.name ?? null, f);
    try {
      await downloadFile(clientFor(account), f, rel);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db().update(schema.files).set({ error: msg, skippedReason: 'error' }).where(eq(schema.files.id, id)).run();
      throw new HttpError(502, `ההורדה נכשלה: ${msg}`);
    }
    db().update(schema.files).set({ localPath: rel, downloadedAt: nowSec(), error: null, skippedReason: null }).where(eq(schema.files.id, id)).run();
    return { ok: true };
  });

  /** ZIP of every downloaded file in a course (optionally one section). */
  app.get('/api/files/zip', async (req, reply) => {
    const q = parse(z.object({ courseId: z.coerce.number().int(), sectionId: z.coerce.number().int().optional() }), req.query);
    const course = db().select().from(schema.courses).where(eq(schema.courses.id, q.courseId)).get() ?? notFound('הקורס לא נמצא');
    const conds = [eq(schema.files.courseId, q.courseId), isNotNull(schema.files.localPath), isNull(schema.files.removedAt)];
    if (q.sectionId) conds.push(eq(schema.files.sectionId, q.sectionId));
    const list = db().select().from(schema.files).where(and(...conds)).all();
    if (!list.length) throw new HttpError(404, 'אין עדיין קבצים שהורדו בקורס הזה');

    const courseDir = safeName(course.fullName);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    for (const f of list) {
      const abs = absPath(f.localPath!);
      if (!fs.existsSync(abs)) continue;
      const inside = f.localPath!.startsWith(courseDir + path.sep) ? f.localPath!.slice(courseDir.length + 1) : f.localPath!;
      zip.file(abs, { name: inside });
    }
    zip.finalize();
    attachment(reply, `${course.fullName}.zip`);
    reply.type('application/zip');
    return reply.send(zip);
  });
}
