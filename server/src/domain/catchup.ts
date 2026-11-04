import { addDays } from '../lib/time';

export interface CatchupLecture {
  moduleId: number;
  courseId: number;
  title: string;
  lectureDate: string | null; // null = date unknown, treated as oldest
  remainingMin: number;
}

export interface PlanItem {
  moduleId: number;
  courseId: number;
  title: string;
  minutes: number;
  part: number; // 1-based; >1 means continuing a lecture split across days
  parts: number;
}

export interface PlanDay {
  date: string;
  items: PlanItem[];
  totalMin: number;
}

export interface CatchupPlan {
  days: PlanDay[];
  unscheduledMin: number;
  unscheduledCount: number;
}

const MIN_CHUNK = 30;

/**
 * Spreads unwatched lectures (oldest first) over the coming days within a daily time budget.
 * A lecture longer than what's left of a day is split into chunks of at least 30 minutes.
 */
export function buildCatchupPlan(
  lectures: CatchupLecture[],
  opts: { startDate: string; days: number; dailyMin: number; busyMin?: Record<string, number> },
): CatchupPlan {
  const queue = [...lectures]
    .filter((l) => l.remainingMin > 0)
    .sort((a, b) => (a.lectureDate ?? '').localeCompare(b.lectureDate ?? '') || a.courseId - b.courseId || a.moduleId - b.moduleId)
    .map((l) => ({ ...l, left: l.remainingMin, chunks: [] as { day: number; minutes: number }[] }));

  const days: PlanDay[] = Array.from({ length: opts.days }, (_, i) => ({ date: addDays(opts.startDate, i), items: [], totalMin: 0 }));
  let qi = 0;
  for (let d = 0; d < days.length && qi < queue.length; d++) {
    let capacity = Math.max(0, opts.dailyMin - (opts.busyMin?.[days[d].date] ?? 0));
    while (qi < queue.length && capacity > 0) {
      const lec = queue[qi];
      if (lec.left <= capacity) {
        lec.chunks.push({ day: d, minutes: lec.left });
        capacity -= lec.left;
        lec.left = 0;
        qi++;
      } else if (capacity >= MIN_CHUNK && lec.left - capacity >= MIN_CHUNK / 2) {
        lec.chunks.push({ day: d, minutes: capacity });
        lec.left -= capacity;
        capacity = 0;
      } else {
        break; // too little time left today; continue tomorrow
      }
    }
  }

  for (const lec of queue) {
    const parts = lec.chunks.length + (lec.left > 0 ? 1 : 0);
    lec.chunks.forEach((c, i) => {
      days[c.day].items.push({
        moduleId: lec.moduleId,
        courseId: lec.courseId,
        title: lec.title,
        minutes: c.minutes,
        part: i + 1,
        parts,
      });
      days[c.day].totalMin += c.minutes;
    });
  }

  const unscheduled = queue.filter((l) => l.left > 0);
  return {
    days,
    unscheduledMin: unscheduled.reduce((s, l) => s + l.left, 0),
    unscheduledCount: unscheduled.length,
  };
}
