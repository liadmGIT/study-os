import { describe, expect, it } from 'vitest';
import { buildCatchupPlan } from '../src/domain/catchup';
import { isNotStarted } from '../src/domain/alerts';
import { computeUrgency } from '../src/domain/urgency';
import { md5 } from '../src/lib/crypto';
import { cleanName, decodeEntities, stripHtml } from '../src/lib/html';
import { addDays, dayKey, weekStart, zonedToUnix } from '../src/lib/time';
import { parseLaunchToken } from '../src/moodle/auth';
import { flattenParams } from '../src/moodle/client';
import { classifyModule, dateFromName, isTirgul, lectureNumber } from '../src/sync/classify';
import { gradeText, needsStatusCheck } from '../src/sync/tasks';
import type { Task } from '../src/db/schema';

const HOUR = 3600;
const DAY = 86400;
const now = zonedToUnix(2026, 11, 4, 12, 0);

describe('classifyModule', () => {
  const url = (href: string) => [{ type: 'url', filename: 'url', fileurl: href }];
  const file = (filename: string, mimetype: string) => [{ type: 'file', filename, mimetype, fileurl: 'x' }];

  it('detects Zoom recording links', () => {
    expect(classifyModule({ modname: 'url', name: 'קישור', contents: url('https://bgu-il.zoom.us/rec/share/abc') })).toBe('recording');
  });
  it('detects recordings by Hebrew name even with an unknown host', () => {
    expect(classifyModule({ modname: 'url', name: 'הקלטת הרצאה 3', contents: url('https://example.com/x') })).toBe('recording');
    expect(classifyModule({ modname: 'url', name: 'הרצאה 4', contents: url('https://example.com/x') })).toBe('recording');
  });
  it('keeps ordinary links as links', () => {
    expect(classifyModule({ modname: 'url', name: 'אתר הקורס', contents: url('https://github.com/x') })).toBe('link');
  });
  it('classifies slides and other files', () => {
    expect(classifyModule({ modname: 'resource', name: 'הרצאה 2 - מצגת', contents: file('l2.pdf', 'application/pdf') })).toBe('slides');
    expect(classifyModule({ modname: 'resource', name: 'שקפים', contents: file('l2.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation') })).toBe('slides');
    expect(classifyModule({ modname: 'resource', name: 'תרגיל בית 1', contents: file('hw1.pdf', 'application/pdf') })).toBe('file');
    expect(classifyModule({ modname: 'resource', name: 'שיעור', contents: file('a.mp4', 'video/mp4') })).toBe('recording');
  });
  it('maps module types', () => {
    expect(classifyModule({ modname: 'assign', name: 'x' })).toBe('assignment');
    expect(classifyModule({ modname: 'zoom', name: 'מפגשי זום' })).toBe('meeting');
    expect(classifyModule({ modname: 'kalvidres', name: 'x' })).toBe('recording');
  });
});

describe('name parsing', () => {
  it('reads lecture numbers', () => {
    expect(lectureNumber('הקלטת הרצאה 5')).toBe(5);
    expect(lectureNumber('Lecture 07 - Trees')).toBe(7);
    expect(lectureNumber('תרגול מס׳ 3')).toBe(3);
    expect(lectureNumber('סילבוס')).toBeNull();
  });
  it('reads dates', () => {
    expect(dateFromName('הרצאה 12/03/2026', now)).toBe('2026-03-12');
    expect(dateFromName('תרגול 5.11.26', now)).toBe('2026-11-05');
    expect(dateFromName('שיעור 4-11', now)).toBe('2026-11-04');
    expect(dateFromName('הרצאה 3', now)).toBeNull();
  });
  it('ignores year-less "dates" far from when the item was posted (usually lecture numbers)', () => {
    expect(dateFromName('הקלטת הרצאה 12.1 - עצים', now)).toBeNull(); // posted in November
    expect(dateFromName('הרצאות 10-11', zonedToUnix(2026, 3, 1))).toBeNull();
    expect(dateFromName('הרצאה 3.11', now)).toBe('2026-11-03');
    // Across the new year: posted on Jan 5, the lecture was on Dec 28.
    expect(dateFromName('הרצאה 28.12', zonedToUnix(2027, 1, 5))).toBe('2026-12-28');
  });
  it('tells tirgul from lecture', () => {
    expect(isTirgul('הקלטת תרגול 2')).toBe(true);
    expect(isTirgul('הקלטת הרצאה 2')).toBe(false);
  });
});

describe('urgency', () => {
  const base = { status: 'todo' as const, priority: 0, estimateMin: null, subtasksTotal: 0, subtasksDone: 0, cutoffAt: null };
  it('buckets by time left', () => {
    expect(computeUrgency({ ...base, dueAt: now + 20 * HOUR }, now).bucket).toBe('urgent');
    expect(computeUrgency({ ...base, dueAt: now + 5 * DAY }, now).bucket).toBe('week');
    expect(computeUrgency({ ...base, dueAt: now + 20 * DAY }, now).bucket).toBe('later');
    expect(computeUrgency({ ...base, dueAt: null }, now).bucket).toBe('nodate');
    expect(computeUrgency({ ...base, dueAt: now - 2 * DAY }, now).bucket).toBe('overdue');
    expect(computeUrgency({ ...base, dueAt: now - 10 * DAY }, now).bucket).toBe('expired');
    expect(computeUrgency({ ...base, status: 'submitted', dueAt: now + HOUR }, now).bucket).toBe('done');
  });
  it('a big unstarted task is urgent earlier', () => {
    expect(computeUrgency({ ...base, dueAt: now + 5 * DAY, estimateMin: 30 * 60 }, now).bucket).toBe('urgent');
  });
  it('sooner deadlines score higher', () => {
    const a = computeUrgency({ ...base, dueAt: now + 10 * HOUR }, now).score;
    const b = computeUrgency({ ...base, dueAt: now + 4 * DAY }, now).score;
    expect(a).toBeGreaterThan(b);
  });
  it('subtasks reduce remaining work', () => {
    const u = computeUrgency({ ...base, dueAt: now + 3 * DAY, estimateMin: 300, subtasksTotal: 5, subtasksDone: 2 }, now);
    expect(u.progress).toBeCloseTo(0.4);
    expect(u.remainingMin).toBe(180);
  });
});

describe('isNotStarted', () => {
  const t = { status: 'todo' as const, moodleStatus: 'new', dueAt: now + 2 * DAY, estimateMin: null, hidden: false, removedAt: null };
  it('warns when close and untouched', () => expect(isNotStarted(t, 0, now, 3)).toBe(true));
  it('not when far away', () => expect(isNotStarted({ ...t, dueAt: now + 10 * DAY }, 0, now, 3)).toBe(false));
  it('not when a subtask is done', () => expect(isNotStarted(t, 1, now, 3)).toBe(false));
  it('not when there is a draft in Moodle', () => expect(isNotStarted({ ...t, moodleStatus: 'draft' }, 0, now, 3)).toBe(false));
  it('earlier for big tasks', () => expect(isNotStarted({ ...t, dueAt: now + 6 * DAY, estimateMin: 600 }, 0, now, 3)).toBe(true));
});

describe('catch-up plan', () => {
  const lec = (id: number, date: string | null, min: number) => ({ moduleId: id, courseId: 1, title: `L${id}`, lectureDate: date, remainingMin: min });
  it('fills days in order within the budget and splits long lectures', () => {
    const plan = buildCatchupPlan([lec(2, '2026-11-02', 90), lec(1, '2026-11-01', 90), lec(3, '2026-11-03', 150)], {
      startDate: '2026-11-04',
      days: 7,
      dailyMin: 120,
    });
    const day = (d: number) => plan.days[d].items.map((i) => [i.moduleId, i.minutes, i.part, i.parts]);
    // Oldest first; the 30 spare minutes of day 1 start lecture 2.
    expect(day(0)).toEqual([
      [1, 90, 1, 1],
      [2, 30, 1, 2],
    ]);
    expect(day(1)).toEqual([
      [2, 60, 2, 2],
      [3, 60, 1, 2],
    ]);
    expect(day(2)).toEqual([[3, 90, 2, 2]]);
    expect(plan.days[0].totalMin).toBe(120);
    expect(plan.unscheduledMin).toBe(0);
  });
  it('reports what does not fit', () => {
    const plan = buildCatchupPlan([lec(1, null, 90), lec(2, null, 90)], { startDate: '2026-11-04', days: 1, dailyMin: 90 });
    expect(plan.unscheduledCount).toBe(1);
    expect(plan.unscheduledMin).toBe(90);
  });
});

describe('moodle helpers', () => {
  it('flattens params PHP-style', () => {
    expect(flattenParams({ courseids: [1, 2], options: [{ name: 'x', value: true }] }).toString()).toBe(
      'courseids%5B0%5D=1&courseids%5B1%5D=2&options%5B0%5D%5Bname%5D=x&options%5B0%5D%5Bvalue%5D=1',
    );
  });
  it('parses the launch redirect', () => {
    const base = 'https://moodle.bgu.ac.il/moodle';
    const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const b64 = Buffer.from(`${md5(base + 'pp')}:::${token}:::priv`).toString('base64');
    const r = parseLaunchToken(`moodlemobile://token=${b64}`, { baseUrl: base, passport: 'pp' });
    expect(r).toMatchObject({ token, privateToken: 'priv', signatureOk: true });
    expect(parseLaunchToken(token).token).toBe(token);
    expect(() => parseLaunchToken('moodlemobile://token=bad')).toThrow();
  });
});

describe('time', () => {
  it('uses Israel days', () => {
    // 23:30 UTC on Nov 4 is already Nov 5 in Israel (UTC+2).
    expect(dayKey(Date.UTC(2026, 10, 4, 23, 30) / 1000)).toBe('2026-11-05');
    expect(weekStart('2026-11-04')).toBe('2026-11-01'); // Wednesday -> Sunday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('html helpers', () => {
  it('decodes entities once', () => {
    expect(decodeEntities('R&amp;D &lt;3 &quot;x&quot; &#1488;&#x5d1;')).toBe('R&D <3 "x" אב');
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('&bogus; & plain')).toBe('&bogus; & plain');
  });
  it('cleans names and HTML', () => {
    expect(cleanName('  <span class="multilang">מבוא &amp; עוד</span>  ')).toBe('מבוא & עוד');
    expect(stripHtml('<p>שורה 1</p><p>שורה&nbsp;2</p>')).toBe('שורה 1\nשורה 2');
  });
  it('treats "-" as no grade', () => {
    expect(gradeText('-')).toBeNull();
    expect(gradeText('')).toBeNull();
    expect(gradeText(undefined)).toBeNull();
    expect(gradeText('<b>85.00</b> / 100.00')).toBe('85.00 / 100.00');
  });
});

describe('status check cadence', () => {
  const task = (id: number, dueAt: number | null, extra: Partial<Task> = {}) => ({ id, dueAt, grade: null, moodleStatus: 'new', ...extra }) as Task;
  it('checks near deadlines every sync and the rest hourly', () => {
    const near = task(9001, now + 3 * DAY);
    const far = task(9002, now + 40 * DAY);
    const oldGraded = task(9003, now - 20 * DAY, { grade: '90' });
    for (const t of [near, far, oldGraded]) expect(needsStatusCheck(t, now)).toBe(true); // first time: always
    expect(needsStatusCheck(near, now + 60)).toBe(true);
    expect(needsStatusCheck(far, now + 60)).toBe(false);
    expect(needsStatusCheck(far, now + HOUR + 60)).toBe(true);
    expect(needsStatusCheck(oldGraded, now + 2 * HOUR)).toBe(false);
  });
});
