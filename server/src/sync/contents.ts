// Course structure: sections, activities, files and recordings.
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Course, Module, ModuleKind } from '../db/schema';
import { stableHash } from '../lib/crypto';
import { cleanName } from '../lib/html';
import { dayKey } from '../lib/time';
import type { MoodleModule, MoodleSection } from '../moodle/types';
import { classifyModule, dateFromName, externalUrlOf, lectureNumber } from './classify';
import { bump, recordChange, type SyncContext } from './context';

const effectiveKind = (m: Pick<Module, 'kind' | 'kindOverride'>): ModuleKind => m.kindOverride ?? m.kind;

/** Kinds that become a task through the assignments/quiz sync instead of a "new activity" change. */
const TASK_KINDS = new Set<ModuleKind>(['assignment', 'quiz']);
const SILENT_KINDS = new Set<ModuleKind>(['label']);

function moduleTime(m: MoodleModule): number | null {
  const times = (m.contents ?? []).map((c) => c.timecreated || c.timemodified || 0).filter((t) => t > 0);
  return times.length ? Math.min(...times) : null;
}

export async function syncCourseContents(ctx: SyncContext, course: Course) {
  const sections = await ctx.client.call<MoodleSection[]>('core_course_get_contents', { courseid: course.id });
  const quiet = ctx.quietCourses.has(course.id);
  const existingModules = new Map(
    db().select().from(schema.modules).where(eq(schema.modules.courseId, course.id)).all().map((m) => [m.id, m]),
  );
  const seenModuleIds: number[] = [];
  const seenSectionIds: number[] = [];
  const recordings: { moduleId: number; sectionId: number }[] = [];

  db().transaction(() => {
    for (const sec of sections) {
      seenSectionIds.push(sec.id);
      const secRow = {
        courseId: course.id,
        number: sec.section,
        name: cleanName(sec.name),
        visible: sec.visible !== 0,
        removedAt: null,
      };
      db().insert(schema.sections).values({ id: sec.id, ...secRow }).onConflictDoUpdate({ target: schema.sections.id, set: secRow }).run();

      sec.modules.forEach((m, position) => {
        if (m.uservisible === false) return;
        seenModuleIds.push(m.id);
        const name = cleanName(m.name);
        const kind = classifyModule({ ...m, name });
        const externalUrl = externalUrlOf(m.modname, m.contents);
        const fileContents = (m.contents ?? []).filter((c) => c.type === 'file' && c.fileurl);
        const hash = stableHash({
          n: name,
          u: externalUrl,
          v: m.visible,
          f: fileContents.map((c) => [c.filepath, c.filename, c.timemodified, c.filesize]),
        });
        const old = existingModules.get(m.id);
        const row = {
          courseId: course.id,
          sectionId: sec.id,
          position,
          instance: m.instance ?? null,
          modname: m.modname,
          name,
          url: m.url ?? null,
          externalUrl,
          description: m.description ?? null,
          kind,
          hash,
          visible: m.visible !== 0,
          completionState: m.completiondata?.state ?? null,
          moodleTime: moduleTime(m),
          updatedAt: old && old.hash === hash ? old.updatedAt : ctx.now,
          removedAt: null,
        };

        if (!old) {
          db().insert(schema.modules).values({ id: m.id, ...row, firstSeenAt: ctx.now }).run();
          bump(ctx, 'modules.new');
          if (!quiet && row.visible && !TASK_KINDS.has(kind) && !SILENT_KINDS.has(kind)) {
            const type = kind === 'recording' ? 'recording_new' : ['file', 'slides', 'folder'].includes(kind) ? 'file_new' : 'module_new';
            recordChange(ctx, { type, courseId: course.id, entityType: 'module', entityId: m.id, title: name, payload: { kind } });
          }
        } else {
          db().update(schema.modules).set(row).where(eq(schema.modules.id, m.id)).run();
        }

        // Files inside the activity (resource files, folder contents).
        const isNewModule = !old;
        for (const c of fileContents) {
          const filepath = c.filepath || '/';
          const existingFile = db()
            .select()
            .from(schema.files)
            .where(and(eq(schema.files.moduleId, m.id), eq(schema.files.filepath, filepath), eq(schema.files.filename, c.filename)))
            .get();
          if (!existingFile) {
            db()
              .insert(schema.files)
              .values({
                moduleId: m.id,
                courseId: course.id,
                sectionId: sec.id,
                filename: c.filename,
                filepath,
                fileUrl: c.fileurl!,
                fileSize: c.filesize ?? null,
                mimeType: c.mimetype ?? null,
                timeModified: c.timemodified ?? null,
                firstSeenAt: ctx.now,
              })
              .run();
            bump(ctx, 'files.new');
            if (!quiet && !isNewModule && effectiveKind({ kind, kindOverride: old?.kindOverride ?? null }) !== 'recording') {
              recordChange(ctx, { type: 'file_new', courseId: course.id, entityType: 'module', entityId: m.id, title: `${name}: ${c.filename}` });
            }
          } else {
            const changed = (c.timemodified ?? null) !== existingFile.timeModified;
            db()
              .update(schema.files)
              .set({
                fileUrl: c.fileurl!,
                sectionId: sec.id,
                fileSize: c.filesize ?? null,
                mimeType: c.mimetype ?? null,
                timeModified: c.timemodified ?? null,
                removedAt: null,
                ...(changed ? { downloadedAt: null, skippedReason: null, error: null } : {}),
              })
              .where(eq(schema.files.id, existingFile.id))
              .run();
            if (changed && !quiet && existingFile.timeModified) {
              recordChange(ctx, { type: 'file_updated', courseId: course.id, entityType: 'module', entityId: m.id, title: `${name}: ${c.filename}` });
            }
          }
        }
        const keepFiles = fileContents.map((c) => `${c.filepath || '/'}\u0000${c.filename}`);
        for (const f of db().select().from(schema.files).where(and(eq(schema.files.moduleId, m.id), isNull(schema.files.removedAt))).all()) {
          if (!keepFiles.includes(`${f.filepath}\u0000${f.filename}`)) {
            db().update(schema.files).set({ removedAt: ctx.now }).where(eq(schema.files.id, f.id)).run();
          }
        }

        if (effectiveKind({ kind, kindOverride: old?.kindOverride ?? null }) === 'recording') {
          recordings.push({ moduleId: m.id, sectionId: sec.id });
        }
      });
    }

    // Anything no longer in the course is marked removed (kept for history).
    if (seenModuleIds.length) {
      db()
        .update(schema.modules)
        .set({ removedAt: ctx.now })
        .where(and(eq(schema.modules.courseId, course.id), notInArray(schema.modules.id, seenModuleIds), isNull(schema.modules.removedAt)))
        .run();
    }
    if (seenSectionIds.length) {
      db()
        .update(schema.sections)
        .set({ removedAt: ctx.now })
        .where(and(eq(schema.sections.courseId, course.id), notInArray(schema.sections.id, seenSectionIds), isNull(schema.sections.removedAt)))
        .run();
    }

    for (const r of recordings) ensureLecture(ctx, course, r.moduleId, r.sectionId);
  });

  bump(ctx, 'modules', seenModuleIds.length);
}

/** Creates the lecture-tracking row for a recording, and links it to the slides from the same week. */
export function ensureLecture(ctx: { now: number; quietCourses: Set<number> }, course: Course, moduleId: number, sectionId: number | null) {
  const mod = db().select().from(schema.modules).where(eq(schema.modules.id, moduleId)).get();
  if (!mod) return;
  const slides = findSlides(mod, sectionId);
  const existing = db().select().from(schema.lectures).where(eq(schema.lectures.moduleId, moduleId)).get();
  if (existing) {
    if (!existing.slidesModuleId && slides) {
      db().update(schema.lectures).set({ slidesModuleId: slides.id }).where(eq(schema.lectures.moduleId, moduleId)).run();
    }
    return;
  }
  const lectureDate =
    dateFromName(mod.name, mod.moodleTime ?? ctx.now) ?? (mod.moodleTime ? dayKey(mod.moodleTime) : ctx.quietCourses.has(course.id) ? null : dayKey(ctx.now));
  db()
    .insert(schema.lectures)
    .values({ moduleId, courseId: course.id, lectureDate, slidesModuleId: slides?.id ?? null, updatedAt: ctx.now })
    .run();
}

function findSlides(mod: Module, sectionId: number | null): Module | undefined {
  if (!sectionId) return undefined;
  const siblings = db()
    .select()
    .from(schema.modules)
    .where(and(eq(schema.modules.sectionId, sectionId), isNull(schema.modules.removedAt)))
    .all()
    .filter((m) => effectiveKind(m) === 'slides');
  if (!siblings.length) return undefined;
  const num = lectureNumber(mod.name);
  return (num !== null && siblings.find((s) => lectureNumber(s.name) === num)) || siblings[0];
}
