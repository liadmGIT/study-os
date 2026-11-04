// Queries and stats for lecture tracking.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Lecture } from '../db/schema';
import { getSettings } from '../lib/settings';
import { todayKey } from '../lib/time';
import { isTirgul, lectureNumber } from '../sync/classify';
import { buildCatchupPlan, type CatchupPlan } from './catchup';

export interface LectureView extends Lecture {
  title: string;
  url: string | null;
  openUrl: string | null;
  modname: string;
  sectionName: string | null;
  sectionNumber: number | null;
  courseName: string;
  courseColor: string;
  number: number | null;
  type: 'lecture' | 'tirgul';
  effectiveDurationMin: number;
  remainingMin: number;
  slides: { moduleId: number; name: string; url: string | null; fileId: number | null } | null;
  completedInMoodle: boolean;
}

export function listLectures(opts: { courseId?: number; includeIgnored?: boolean } = {}): LectureView[] {
  const s = getSettings();
  const conds = [
    isNull(schema.modules.removedAt),
    eq(schema.courses.active, true),
    isNull(schema.courses.removedAt),
    sql`coalesce(${schema.modules.kindOverride}, ${schema.modules.kind}) = 'recording'`,
  ];
  if (opts.courseId) conds.push(eq(schema.lectures.courseId, opts.courseId));
  if (!opts.includeIgnored) conds.push(eq(schema.lectures.ignored, false));

  const rows = db()
    .select({ lecture: schema.lectures, module: schema.modules, course: schema.courses, section: schema.sections })
    .from(schema.lectures)
    .innerJoin(schema.modules, eq(schema.lectures.moduleId, schema.modules.id))
    .innerJoin(schema.courses, eq(schema.lectures.courseId, schema.courses.id))
    .leftJoin(schema.sections, eq(schema.modules.sectionId, schema.sections.id))
    .where(and(...conds))
    .all();

  const slideIds = rows.map((r) => r.lecture.slidesModuleId).filter((x): x is number => !!x);
  const slideModules = new Map(
    slideIds.length
      ? db()
          .select()
          .from(schema.modules)
          .where(inArray(schema.modules.id, slideIds))
          .all()
          .map((m) => [m.id, m])
      : [],
  );
  const slideFiles = new Map(
    slideIds.length
      ? db()
          .select()
          .from(schema.files)
          .where(and(inArray(schema.files.moduleId, slideIds), isNull(schema.files.removedAt)))
          .all()
          .map((f) => [f.moduleId, f.id])
      : [],
  );

  return rows
    .map(({ lecture, module, course, section }) => {
      const duration = lecture.durationMin ?? s.defaultLectureMin;
      const remaining = lecture.status === 'watched' ? 0 : Math.max(0, duration - lecture.positionMin);
      const slidesMod = lecture.slidesModuleId ? slideModules.get(lecture.slidesModuleId) : undefined;
      return {
        ...lecture,
        title: module.name,
        url: module.url,
        openUrl: module.externalUrl ?? module.url,
        modname: module.modname,
        sectionName: section?.name ?? null,
        sectionNumber: section?.number ?? null,
        courseName: course.fullName,
        courseColor: course.color,
        number: lectureNumber(module.name),
        type: isTirgul(module.name) ? ('tirgul' as const) : ('lecture' as const),
        effectiveDurationMin: duration,
        remainingMin: remaining,
        slides: slidesMod
          ? { moduleId: slidesMod.id, name: slidesMod.name, url: slidesMod.url, fileId: slideFiles.get(slidesMod.id) ?? null }
          : null,
        completedInMoodle: (module.completionState ?? 0) > 0,
      };
    })
    .sort(
      (a, b) =>
        a.courseId - b.courseId ||
        (a.sectionNumber ?? 0) - (b.sectionNumber ?? 0) ||
        (a.lectureDate ?? '').localeCompare(b.lectureDate ?? '') ||
        a.moduleId - b.moduleId,
    );
}

export interface CourseLag {
  courseId: number;
  courseName: string;
  color: string;
  total: number;
  watched: number;
  behind: number; // past lectures not fully watched
  behindMin: number;
}

/** A lecture counts as "behind" once its date has passed (unknown date = past) and it isn't watched. */
export function computeLag(lectures: LectureView[], today = todayKey()): CourseLag[] {
  const map = new Map<number, CourseLag>();
  for (const l of lectures) {
    let c = map.get(l.courseId);
    if (!c) {
      c = { courseId: l.courseId, courseName: l.courseName, color: l.courseColor, total: 0, watched: 0, behind: 0, behindMin: 0 };
      map.set(l.courseId, c);
    }
    c.total++;
    if (l.status === 'watched') c.watched++;
    else if (!l.lectureDate || l.lectureDate <= today) {
      c.behind++;
      c.behindMin += l.remainingMin;
    }
  }
  return [...map.values()].sort((a, b) => b.behind - a.behind || a.courseName.localeCompare(b.courseName));
}

export function catchupPlanFor(startDate = todayKey(), days = 7, lectures = listLectures()): CatchupPlan {
  const s = getSettings();
  const behind = lectures.filter((l) => l.status !== 'watched' && (!l.lectureDate || l.lectureDate <= startDate));
  return buildCatchupPlan(
    behind.map((l) => ({
      moduleId: l.moduleId,
      courseId: l.courseId,
      title: l.title,
      lectureDate: l.lectureDate,
      remainingMin: l.remainingMin,
    })),
    { startDate, days, dailyMin: s.dailyStudyMin },
  );
}
