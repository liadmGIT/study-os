// Downloads new course files to the data volume: files/<course>/<section>/<path>/<file>.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db';
import type { FileRow } from '../db/schema';
import { getSettings } from '../lib/settings';
import { MoodleTokenError, limiter, type MoodleClient } from '../moodle/client';
import { bump, type SyncContext } from './context';

const MAX_PER_RUN = 40;

export function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_');
  return (cleaned || '_').slice(0, 120);
}

export function localPathFor(courseName: string, sectionName: string | null, file: Pick<FileRow, 'filepath' | 'filename'>): string {
  const sub = file.filepath
    .split('/')
    .filter(Boolean)
    .map(safeName);
  return path.join(safeName(courseName), safeName(sectionName || 'כללי'), ...sub, safeName(file.filename));
}

function skipReason(f: FileRow, s: ReturnType<typeof getSettings>): string | null {
  const isVideo = /^(video|audio)\//.test(f.mimeType ?? '') || /\.(mp4|mov|mkv|webm|m4v|mp3|m4a)$/i.test(f.filename);
  if (isVideo && !s.downloadVideos) return 'video';
  if (f.fileSize && f.fileSize > s.maxFileMb * 1024 * 1024) return 'too_large';
  return null;
}

export async function downloadFile(client: MoodleClient, f: FileRow, rel: string) {
  const abs = path.join(config.filesDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.part`;
  const res = await client.download(f.fileUrl);
  if (!res.body) throw new Error('Empty response');
  await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(tmp));
  fs.renameSync(tmp, abs);
}

export async function syncFileDownloads(ctx: SyncContext) {
  const s = getSettings();
  if (!s.downloadFiles) return;
  const activeIds = new Set(ctx.activeCourses.map((c) => c.id));
  const pending = db()
    .select({ file: schema.files, courseName: schema.courses.fullName, sectionName: schema.sections.name })
    .from(schema.files)
    .innerJoin(schema.courses, eq(schema.files.courseId, schema.courses.id))
    .leftJoin(schema.sections, eq(schema.files.sectionId, schema.sections.id))
    .where(and(isNull(schema.files.downloadedAt), isNull(schema.files.skippedReason), isNull(schema.files.removedAt)))
    .orderBy(asc(schema.files.firstSeenAt))
    .all()
    .filter((r) => activeIds.has(r.file.courseId))
    .slice(0, MAX_PER_RUN);

  const limit = limiter(2);
  await Promise.all(
    pending.map(({ file, courseName, sectionName }) =>
      limit(async () => {
        const reason = skipReason(file, s);
        if (reason) {
          db().update(schema.files).set({ skippedReason: reason }).where(eq(schema.files.id, file.id)).run();
          return;
        }
        const rel = localPathFor(courseName, sectionName, file);
        try {
          await downloadFile(ctx.client, file, rel);
          db()
            .update(schema.files)
            .set({ localPath: rel, downloadedAt: ctx.now, error: null })
            .where(eq(schema.files.id, file.id))
            .run();
          bump(ctx, 'files.downloaded');
        } catch (err) {
          if (err instanceof MoodleTokenError) throw err;
          db()
            .update(schema.files)
            // Parked until the user presses "retry" in the files screen.
            .set({ error: err instanceof Error ? err.message : String(err), skippedReason: 'error' })
            .where(eq(schema.files.id, file.id))
            .run();
          bump(ctx, 'files.failed');
        }
      }),
    ),
  );
}
