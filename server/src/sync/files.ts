// Downloads new course files to the data volume: files/<course>/<section>/[<folder>/]<path>/<file>.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { and, asc, eq, isNull, ne, type SQL } from 'drizzle-orm';
import { config } from '../config';
import { db, schema } from '../db';
import type { FileRow } from '../db/schema';
import { getSettings } from '../lib/settings';
import { MoodleTokenError, limiter, type MoodleClient } from '../moodle/client';
import { bump, type SyncContext } from './context';

const MAX_PER_RUN = 40;
/** A file that failed this many syncs in a row waits for a manual "retry". */
export const MAX_DOWNLOAD_ATTEMPTS = 3;

export function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_');
  return (cleaned || '_').slice(0, 120);
}

/** Files inside a Moodle folder go under the folder's name, so two folders' "main.py" don't meet. */
export function localPathFor(
  courseName: string,
  sectionName: string | null,
  file: Pick<FileRow, 'filepath' | 'filename'>,
  folderName?: string | null,
): string {
  const sub = file.filepath
    .split('/')
    .filter(Boolean)
    .map(safeName);
  const dirs = [safeName(courseName), safeName(sectionName || 'כללי'), ...(folderName ? [safeName(folderName)] : [])];
  return path.join(...dirs, ...sub, safeName(file.filename));
}

/** If another file already owns `rel` (or it's reserved in this run), add " (2)", " (3)"… before the extension. */
export function uniqueLocalPath(rel: string, fileId: number, reserved: Set<string> = new Set()): string {
  const taken = (p: string) =>
    reserved.has(p) ||
    !!db()
      .select({ id: schema.files.id })
      .from(schema.files)
      .where(and(eq(schema.files.localPath, p), ne(schema.files.id, fileId)))
      .get();
  if (!taken(rel)) return rel;
  const { dir, name, ext } = path.parse(rel);
  for (let i = 2; ; i++) {
    const candidate = path.join(dir, `${name} (${i})${ext}`);
    if (!taken(candidate)) return candidate;
  }
}

export interface FileJob {
  file: FileRow;
  courseName: string;
  sectionName: string | null;
  modname: string | null;
  moduleName: string | null;
}

/** Files with what's needed to place them on disk. */
export function loadFileJobs(where: SQL): FileJob[] {
  return db()
    .select({
      file: schema.files,
      courseName: schema.courses.fullName,
      sectionName: schema.sections.name,
      modname: schema.modules.modname,
      moduleName: schema.modules.name,
    })
    .from(schema.files)
    .innerJoin(schema.courses, eq(schema.files.courseId, schema.courses.id))
    .leftJoin(schema.sections, eq(schema.files.sectionId, schema.sections.id))
    .leftJoin(schema.modules, eq(schema.files.moduleId, schema.modules.id))
    .where(where)
    .orderBy(asc(schema.files.firstSeenAt))
    .all();
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
  try {
    const res = await client.download(f.fileUrl);
    if (!res.body) throw new Error('Empty response');
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), fs.createWriteStream(tmp));
    fs.renameSync(tmp, abs);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Downloads one file and records the outcome. A re-download (the file changed in Moodle) keeps its path.
 * Token errors are rethrown; other failures count as an attempt, and after MAX_DOWNLOAD_ATTEMPTS
 * (or straight away for a manual retry) the file is parked with skippedReason='error'.
 */
export async function downloadAndRecord(
  client: MoodleClient,
  job: FileJob,
  now: number,
  opts: { reserved?: Set<string>; manual?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { file } = job;
  const rel =
    file.localPath ??
    uniqueLocalPath(localPathFor(job.courseName, job.sectionName, file, job.modname === 'folder' ? job.moduleName : null), file.id, opts.reserved);
  opts.reserved?.add(rel);
  try {
    await downloadFile(client, file, rel);
  } catch (err) {
    if (err instanceof MoodleTokenError) throw err;
    const error = err instanceof Error ? err.message : String(err);
    const attempts = opts.manual ? MAX_DOWNLOAD_ATTEMPTS : file.downloadAttempts + 1;
    db()
      .update(schema.files)
      .set({ error, downloadAttempts: attempts, skippedReason: attempts >= MAX_DOWNLOAD_ATTEMPTS ? 'error' : null })
      .where(eq(schema.files.id, file.id))
      .run();
    return { ok: false, error };
  }
  db()
    .update(schema.files)
    .set({ localPath: rel, downloadedAt: now, error: null, skippedReason: null, downloadAttempts: 0 })
    .where(eq(schema.files.id, file.id))
    .run();
  return { ok: true };
}

export async function syncFileDownloads(ctx: SyncContext) {
  const s = getSettings();
  if (!s.downloadFiles) return;
  const activeIds = new Set(ctx.activeCourses.map((c) => c.id));
  const pending = loadFileJobs(and(isNull(schema.files.downloadedAt), isNull(schema.files.skippedReason), isNull(schema.files.removedAt))!)
    .filter((j) => activeIds.has(j.file.courseId))
    .slice(0, MAX_PER_RUN);

  // Paths chosen in this run, so two parallel downloads can't pick the same name.
  const reserved = new Set<string>();
  const limit = limiter(2);
  await Promise.all(
    pending.map((job) =>
      limit(async () => {
        const reason = skipReason(job.file, s);
        if (reason) {
          db().update(schema.files).set({ skippedReason: reason }).where(eq(schema.files.id, job.file.id)).run();
          return;
        }
        const r = await downloadAndRecord(ctx.client, job, ctx.now, { reserved });
        bump(ctx, r.ok ? 'files.downloaded' : 'files.failed');
      }),
    ),
  );
}
