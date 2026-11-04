// End-to-end sync against the mock Moodle: first sync is a quiet baseline, the second one reports what changed.
import fs from 'node:fs';
import path from 'node:path';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { db, initDb, schema } from '../src/db';
import { listLectures, computeLag } from '../src/domain/lectures';
import { listTasks } from '../src/domain/tasks';
import { saveConnection } from '../src/moodle/account';
import { loginWithPassword } from '../src/moodle/auth';
import { closeInterruptedRuns, runSync } from '../src/sync/engine';
import { applyScenario, startMockMoodle, type MockMoodle } from './mock-moodle';

let mock: MockMoodle;

beforeAll(async () => {
  mock = await startMockMoodle();
  initDb(':memory:');
  const tokens = await loginWithPassword(mock.url, 'student', 'password');
  await saveConnection(tokens, 'student', mock.url);
});

afterAll(() => mock.close());

describe('sync', () => {
  it('rejects a wrong password', async () => {
    await expect(loginWithPassword(mock.url, 'student', 'nope')).rejects.toMatchObject({ code: 'invalidlogin' });
  });

  it('first sync stores everything without announcing it', async () => {
    const r = await runSync('manual');
    expect(r.warnings).toEqual([]);
    expect(r.status).toBe('ok');

    const courses = db().select().from(schema.courses).all();
    expect(courses).toHaveLength(4);
    expect(courses.filter((c) => c.active).map((c) => c.id).sort()).toEqual([101, 102, 103]); // old course is inactive
    expect(courses.find((c) => c.id === 101)?.baselined).toBe(true);

    expect(db().select().from(schema.changes).all()).toHaveLength(0);

    const tasks = listTasks();
    const byMoodle = (source: string, id: number) => tasks.find((t) => t.source === source && t.moodleId === id)!;
    expect(byMoodle('assign', 501)).toMatchObject({ status: 'submitted', grade: '92.00 / 100.00' });
    expect(byMoodle('assign', 504)).toMatchObject({ status: 'in_progress', moodleStatus: 'draft' });
    expect(byMoodle('assign', 502).notStarted).toBe(true);
    expect(byMoodle('quiz', 601).dueAt).toBe(mock.state.quizzes[0].timeclose);
    expect(byMoodle('event', 9001).title).toBe('משוב אמצע סמסטר');
    expect(tasks.some((t) => t.source === 'event' && t.moodleId === 9002)).toBe(false); // assign events are not duplicated
    // Group assignment: the partner's (team) submission counts.
    expect(byMoodle('assign', 506)).toMatchObject({ status: 'submitted', moodleStatus: 'submitted' });
    // "-" means feedback without a grade.
    expect(byMoodle('assign', 505).grade).toBeNull();

    const lectures = listLectures();
    // 3 courses × 3 weeks × (lecture + tirgul) + one video file.
    expect(lectures).toHaveLength(19);
    const lec1 = lectures.find((l) => l.title === 'הקלטת הרצאה 1' && l.courseId === 101)!;
    expect(lec1.openUrl).toBe('https://bgu-il.zoom.us/rec/share/intro-lec-1');
    expect(lec1.slides?.name).toBe('הרצאה 1 - מצגת');
    expect(lec1.type).toBe('lecture');
    expect(lectures.find((l) => l.title === 'הקלטת תרגול 1')?.type).toBe('tirgul');
    expect(lectures.some((l) => l.title === 'מפגשי זום של הקורס')).toBe(false); // live meeting, not a recording

    const lag = computeLag(lectures);
    expect(lag.find((l) => l.courseId === 101)?.behind).toBe(6);

    // Names arrive HTML-escaped from Moodle and are stored as plain text.
    expect(db().select().from(schema.modules).where(eq(schema.modules.id, 1004)).get()?.name).toBe('שאלות & תשובות');

    const ann = db().select().from(schema.announcements).all();
    expect(ann).toHaveLength(2);
    expect(ann.map((a) => a.subject)).toContain('שינוי בשעות קבלה & תרגול');
    expect(ann.every((a) => a.read)).toBe(true); // baseline announcements start as read
  });

  it('downloads files but skips large videos', () => {
    const files = db().select().from(schema.files).all();
    const read = (rel: string) => fs.readFileSync(path.join(config.filesDir, rel), 'utf8');
    const pdf = files.find((f) => f.filename === 'intro_lecture1.pdf')!;
    expect(pdf.downloadedAt).toBeTruthy();
    expect(read(pdf.localPath!)).toContain('intro_lecture1.pdf');
    expect(pdf.localPath).toBe(path.join('מבוא למדעי המחשב', 'שבוע 1', 'intro_lecture1.pdf'));
    // Folder contents live under the folder's name.
    expect(files.find((f) => f.filename === 'examples.zip')?.localPath).toBe(path.join('מבוא למדעי המחשב', 'שבוע 3', 'חומרי עזר', 'code', 'examples.zip'));
    expect(files.find((f) => f.filename === 'lecture3.mp4')?.skippedReason).toBe('video');
  });

  it('keeps same-named files from different activities apart', () => {
    const ex = db().select().from(schema.files).all().filter((f) => f.filename === 'ex1.pdf');
    expect(ex).toHaveLength(2);
    const paths = ex.map((f) => f.localPath).sort();
    expect(paths).toEqual([path.join('מבוא למדעי המחשב', 'שבוע 1', 'ex1 (2).pdf'), path.join('מבוא למדעי המחשב', 'שבוע 1', 'ex1.pdf')]);
    for (const f of ex) expect(fs.readFileSync(path.join(config.filesDir, f.localPath!), 'utf8')).toContain(`/${f.moduleId}/`);
  });

  it('retries a failed download on the next sync instead of giving up', () => {
    const flaky = db().select().from(schema.files).all().find((f) => f.filename === 'flaky.pdf')!;
    expect(flaky).toMatchObject({ downloadedAt: null, skippedReason: null, downloadAttempts: 1 });
    expect(flaky.error).toContain('503');
  });

  it('second sync after lecturer changes reports them', async () => {
    const before = listTasks().find((t) => t.moodleId === 503)!.dueAt!;
    applyScenario(mock.state);
    const r = await runSync('manual');
    expect(r.status).toBe('ok');

    const changes = db().select().from(schema.changes).all();
    const types = changes.map((c) => c.type).sort();
    expect(types).toEqual(['announcement_new', 'due_changed', 'recording_new', 'submitted']);

    const due = changes.find((c) => c.type === 'due_changed')!;
    expect(due.payload).toEqual({ from: before, to: before + 3 * 86400 });
    const task503 = db().select().from(schema.tasks).where(eq(schema.tasks.moodleId, 503)).get()!;
    expect(task503.prevDueAt).toBe(before);

    expect(listTasks().find((t) => t.moodleId === 502)?.status).toBe('submitted');
    const flaky = db().select().from(schema.files).all().find((f) => f.filename === 'flaky.pdf')!;
    expect(flaky).toMatchObject({ skippedReason: null, downloadAttempts: 0, error: null });
    expect(flaky.downloadedAt).toBeTruthy();
    // The finished feedback form disappeared from Moodle's timeline, so it's no longer an open task.
    expect(listTasks().some((t) => t.source === 'event' && t.moodleId === 9001)).toBe(false);
    expect(listLectures().some((l) => l.title === 'הקלטת הרצאה 4')).toBe(true);
    const newAnn = db().select().from(schema.announcements).where(eq(schema.announcements.read, false)).all();
    expect(newAnn.map((a) => a.subject)).toEqual(['הפרויקט נדחה בשבוע']);

    const notes = db().select().from(schema.notifications).all();
    const keys = notes.map((n) => n.type);
    expect(keys).toEqual(expect.arrayContaining(['due_changed', 'recording_new', 'announcement_new', 'lecture_lag']));
  });

  it('a third sync with nothing new adds nothing', async () => {
    const count = db().select().from(schema.changes).all().length;
    await runSync('manual');
    expect(db().select().from(schema.changes).all().length).toBe(count);
  });

  it('marks the token invalid when Moodle rejects it', async () => {
    mock.state.token = 'ffffffffffffffffffffffffffffffff';
    const r = await runSync('manual');
    expect(r.status).toBe('error');
    expect(db().select().from(schema.moodleAccount).get()?.tokenInvalid).toBe(true);
    expect(db().select().from(schema.notifications).all().some((n) => n.type === 'reconnect')).toBe(true);
    // Cron syncs are skipped until the user reconnects.
    expect((await runSync('cron')).status).toBe('skipped');
  });

  it('asks to reconnect when the saved token cannot be decrypted', async () => {
    db().update(schema.moodleAccount).set({ tokenEnc: 'not-decryptable', tokenInvalid: false }).run();
    const r = await runSync('manual');
    expect(r.status).toBe('error');
    expect(db().select().from(schema.moodleAccount).get()?.tokenInvalid).toBe(true);
    const run = db().select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).get()!;
    expect(run).toMatchObject({ status: 'error' });
    expect(run.finishedAt).toBeTruthy();
    const note = db().select().from(schema.notifications).all().find((n) => n.key.startsWith('reconnect:key:'))!;
    expect(note.body).toContain('ENCRYPTION_KEY');
  });

  it('closes runs that were cut off by a restart', () => {
    db().insert(schema.syncRuns).values({ trigger: 'cron', startedAt: 1, status: 'running' }).run();
    closeInterruptedRuns();
    expect(db().select().from(schema.syncRuns).where(eq(schema.syncRuns.status, 'running')).all()).toHaveLength(0);
  });
});
