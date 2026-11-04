// Turns changes and approaching deadlines into notifications, then pushes them to the phone.
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Change } from '../db/schema';
import { isNotStarted } from '../domain/alerts';
import { computeLag, listLectures } from '../domain/lectures';
import { listTasks } from '../domain/tasks';
import { formatDateTime, formatTimeLeft } from '../lib/format';
import { getKV, getSettings, setKV, type AppSettings } from '../lib/settings';
import { DAY, israelHour, nowSec, todayKey, weekStart } from '../lib/time';
import { sendPush } from './push';

interface NewNotification {
  key: string;
  type: string;
  title: string;
  body?: string;
  url?: string | null;
}

/** Inserts unless a notification with the same key already exists. Returns true if new. */
export function addNotification(n: NewNotification, now = nowSec()): boolean {
  const res = db()
    .insert(schema.notifications)
    .values({ key: n.key, type: n.type, title: n.title, body: n.body ?? '', url: n.url ?? null, createdAt: now })
    .onConflictDoNothing({ target: schema.notifications.key })
    .run();
  return res.changes > 0;
}

function courseNames(): Map<number, string> {
  return new Map(db().select().from(schema.courses).all().map((c) => [c.id, c.fullName]));
}

function fromChanges(s: AppSettings, now: number) {
  const lastId = getKV<number>('notify_last_change_id') ?? 0;
  const list = db().select().from(schema.changes).where(gt(schema.changes.id, lastId)).orderBy(asc(schema.changes.id)).all();
  if (!list.length) return;
  setKV('notify_last_change_id', list[list.length - 1].id);
  const names = courseNames();
  const course = (c: Change) => (c.courseId ? (names.get(c.courseId) ?? '') : '');

  // Group file changes per course so a big upload is one notification.
  const fileGroups = new Map<number, Change[]>();

  for (const c of list) {
    const p = c.payload as Record<string, unknown>;
    switch (c.type) {
      case 'task_new':
        if (s.notify.newTask)
          addNotification(
            {
              key: `change:${c.id}`,
              type: c.type,
              title: `מטלה חדשה · ${course(c)}`,
              body: `${c.title}${p.dueAt ? ` – להגשה עד ${formatDateTime(p.dueAt as number)}` : ''}`,
              url: `/tasks?open=${c.entityId}`,
            },
            now,
          );
        break;
      case 'due_changed':
        if (s.notify.dueChanged)
          addNotification(
            {
              key: `change:${c.id}`,
              type: c.type,
              title: `תאריך ההגשה השתנה · ${course(c)}`,
              body: `${c.title}: ${formatDateTime(p.from as number)} ← ${formatDateTime(p.to as number)}`,
              url: `/tasks?open=${c.entityId}`,
            },
            now,
          );
        break;
      case 'recording_new':
        if (s.notify.recording)
          addNotification(
            { key: `change:${c.id}`, type: c.type, title: `הקלטה חדשה · ${course(c)}`, body: c.title, url: `/lectures?course=${c.courseId}` },
            now,
          );
        break;
      case 'announcement_new':
        if (s.notify.announcement)
          addNotification(
            {
              key: `change:${c.id}`,
              type: c.type,
              title: `הודעה חדשה · ${course(c)}`,
              body: `${c.title}${p.author ? ` (${p.author})` : ''}`,
              url: `/updates?announcement=${c.entityId}`,
            },
            now,
          );
        break;
      case 'grade_new':
        if (s.notify.grade)
          addNotification(
            { key: `change:${c.id}`, type: c.type, title: `ציון חדש · ${course(c)}`, body: `${c.title}: ${p.grade}`, url: `/tasks?open=${c.entityId}` },
            now,
          );
        break;
      case 'course_new':
        addNotification({ key: `change:${c.id}`, type: c.type, title: 'קורס חדש נוסף', body: c.title, url: '/courses' }, now);
        break;
      case 'file_new':
      case 'file_updated':
      case 'module_new':
        if (s.notify.files && c.courseId) fileGroups.set(c.courseId, [...(fileGroups.get(c.courseId) ?? []), c]);
        break;
    }
  }

  for (const [courseId, group] of fileGroups) {
    const name = names.get(courseId) ?? '';
    addNotification(
      {
        key: `files:${group[0].id}`,
        type: 'file_new',
        title: group.length === 1 ? `חומר חדש · ${name}` : `${group.length} פריטים חדשים · ${name}`,
        body: group
          .slice(0, 3)
          .map((g) => g.title)
          .join(', '),
        url: `/courses/${courseId}`,
      },
      now,
    );
  }
}

function fromDeadlines(s: AppSettings, now: number) {
  for (const t of listTasks()) {
    if (!t.dueAt || t.dueAt <= now || t.status === 'done' || t.status === 'submitted') continue;
    const left = t.dueAt - now;
    const courseName = t.course?.name ? ` · ${t.course.name}` : '';
    if (s.notify.deadline && left <= DAY) {
      addNotification(
        {
          key: `due24:${t.id}:${t.dueAt}`,
          type: 'deadline',
          title: `נשארו ${formatTimeLeft(left)} להגשה${courseName}`,
          body: t.title,
          url: `/tasks?open=${t.id}`,
        },
        now,
      );
    }
    const done = t.subtasks.filter((x) => x.done).length;
    if (s.notify.notStarted && isNotStarted(t, done, now, s.notStartedDays)) {
      addNotification(
        {
          key: `notstarted:${t.id}:${t.dueAt}`,
          type: 'not_started',
          title: `עוד לא התחלת${courseName}`,
          body: `${t.title} – ההגשה ${formatDateTime(t.dueAt)} (בעוד ${formatTimeLeft(left)})`,
          url: `/tasks?open=${t.id}`,
        },
        now,
      );
    }
  }
}

function fromLectureLag(s: AppSettings, now: number) {
  if (!s.notify.lectureLag) return;
  const week = weekStart(todayKey());
  for (const lag of computeLag(listLectures())) {
    if (lag.behind < s.lagThreshold) continue;
    addNotification(
      {
        key: `lag:${lag.courseId}:${week}`,
        type: 'lecture_lag',
        title: `${lag.behind} הרצאות מחכות לך · ${lag.courseName}`,
        body: `בערך ${Math.round(lag.behindMin / 60)} שעות צפייה. תוכנית ההשלמה מחכה בלוח השבועי.`,
        url: `/lectures?course=${lag.courseId}`,
      },
      now,
    );
  }
}

export function inQuietHours(s: AppSettings, now: number): boolean {
  const h = israelHour(now);
  return s.quietHoursStart > s.quietHoursEnd ? h >= s.quietHoursStart || h < s.quietHoursEnd : h >= s.quietHoursStart && h < s.quietHoursEnd;
}

async function pushPending(s: AppSettings, now: number) {
  if (inQuietHours(s, now)) return;
  const pending = db()
    .select()
    .from(schema.notifications)
    .where(and(isNull(schema.notifications.pushedAt), gt(schema.notifications.createdAt, now - 12 * 3600)))
    .orderBy(desc(schema.notifications.createdAt))
    .all();
  if (!pending.length) return;
  if (pending.length > 4) {
    await sendPush({
      title: `${pending.length} עדכונים חדשים`,
      body: pending
        .slice(0, 3)
        .map((n) => n.title)
        .join(' · '),
      url: '/updates',
      tag: 'summary',
    });
  } else {
    for (const n of pending) await sendPush({ title: n.title, body: n.body, url: n.url, tag: n.key });
  }
  for (const n of pending) db().update(schema.notifications).set({ pushedAt: now }).where(eq(schema.notifications.id, n.id)).run();
}

async function runOnce(now: number) {
  const s = getSettings();
  fromChanges(s, now);
  fromDeadlines(s, now);
  fromLectureLag(s, now);
  await pushPending(s, now);
}

// The sync and the half-hourly reminder job both call this; running them one after the other
// keeps two runs from pushing the same pending notifications twice.
let queue: Promise<void> = Promise.resolve();

export function runNotifications(now?: number): Promise<void> {
  const run = queue.then(() => runOnce(now ?? nowSec()));
  queue = run.catch(() => {});
  return run;
}
