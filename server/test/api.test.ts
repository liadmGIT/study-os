import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { initDb } from '../src/db';
import { runSync } from '../src/sync/engine';
import { startMockMoodle, type MockMoodle } from './mock-moodle';

let app: FastifyInstance;
let mock: MockMoodle;
let cookie = '';

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  const res = await app.inject({ method, url, payload: body as object, headers: cookie ? { cookie } : {} });
  return { status: res.statusCode, json: res.headers['content-type']?.includes('json') ? res.json() : null, text: res.body, headers: res.headers };
}

beforeAll(async () => {
  mock = await startMockMoodle();
  (config as { moodleUrl: string }).moodleUrl = mock.url;
  initDb(':memory:');
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await mock.close();
});

describe('api', () => {
  it('requires login', async () => {
    expect((await call('GET', '/api/dashboard')).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { password: 'wrong' })).status).toBe(401);
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'test-password' } });
    expect(res.statusCode).toBe(200);
    cookie = String(res.headers['set-cookie']).split(';')[0];
    expect((await call('GET', '/api/auth/me')).json).toEqual({ authed: true });
  });

  it('pings Moodle and connects with username + password', async () => {
    const ping = await call('GET', '/api/moodle/ping');
    expect(ping.json).toMatchObject({ reachable: true, typeOfLogin: 1 });

    const bad = await call('POST', '/api/moodle/login', { username: 'student', password: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('שם המשתמש או הסיסמה שגויים.');

    const ok = await call('POST', '/api/moodle/login', { username: 'student', password: 'password' });
    expect(ok.json).toMatchObject({ ok: true, fullName: 'סטודנט לדוגמה' });
    await runSync('manual'); // joins the sync started by connect
    const status = await call('GET', '/api/moodle/status');
    expect(status.json).toMatchObject({ connected: true, tokenInvalid: false, missingFunctions: [] });
  });

  it('connects through the browser launch flow', async () => {
    const start = await call('POST', '/api/moodle/launch/start');
    const launch = await fetch(start.json.url, { redirect: 'manual' });
    const location = launch.headers.get('location')!;
    expect(location).toMatch(/^moodlemobile:\/\/token=/);
    const fin = await call('POST', '/api/moodle/launch/finish', { value: location });
    expect(fin.json).toMatchObject({ ok: true });
  });

  it('serves the dashboard', async () => {
    const d = (await call('GET', '/api/dashboard')).json;
    expect(d.focus.length).toBeGreaterThan(0);
    expect(d.lag.length).toBe(3);
    expect(d.todayLectures.length).toBeGreaterThan(0);
    expect(d.sync.connected).toBe(true);
  });

  it('creates personal tasks with subtasks and splits', async () => {
    const created = await call('POST', '/api/tasks', { title: 'לקרוא פרק 3', dueAt: Math.floor(Date.now() / 1000) + 86400, priority: 2 });
    expect(created.json).toMatchObject({ source: 'personal', status: 'todo', priority: 2 });
    const id = created.json.id;

    const split = await call('POST', `/api/tasks/${id}/split`, { count: 5 });
    expect(split.json.subtasks.map((s: { title: string }) => s.title)).toEqual(['שאלה 1', 'שאלה 2', 'שאלה 3', 'שאלה 4', 'שאלה 5']);

    const first = split.json.subtasks[0].id;
    const ticked = await call('PATCH', `/api/subtasks/${first}`, { done: true });
    expect(ticked.json.status).toBe('in_progress'); // ticking a subtask means it started
    expect(ticked.json.urgency.progress).toBeCloseTo(0.2);

    const done = await call('PATCH', `/api/tasks/${id}`, { status: 'done' });
    expect(done.json.completedAt).toBeTruthy();
    expect((await call('DELETE', `/api/tasks/${id}`)).json).toEqual({ ok: true });
    expect((await call('GET', `/api/tasks/${id}`)).status).toBe(404);
  });

  it('protects Moodle-owned fields', async () => {
    const tasks = (await call('GET', '/api/tasks')).json;
    const moodleTask = tasks.find((t: { source: string }) => t.source === 'assign');
    expect((await call('PATCH', `/api/tasks/${moodleTask.id}`, { dueAt: 1 })).status).toBe(400);
    expect((await call('PATCH', `/api/tasks/${moodleTask.id}`, { estimateMin: 240, plannedDate: '2026-11-05' })).json).toMatchObject({
      estimateMin: 240,
      plannedDate: '2026-11-05',
    });
  });

  it('tracks lecture progress and notes', async () => {
    const { lectures } = (await call('GET', '/api/lectures')).json;
    const lec = lectures[0];
    const opened = await call('POST', `/api/lectures/${lec.moduleId}/open`);
    expect(opened.json.url).toBe(lec.openUrl);
    expect(opened.json.lecture.status).toBe('in_progress');

    const pos = await call('PATCH', `/api/lectures/${lec.moduleId}`, { positionMin: 45, durationMin: 90, notesMd: '# סיכום\nמשפט האינדוקציה' });
    expect(pos.json).toMatchObject({ positionMin: 45, remainingMin: 45, notesMd: '# סיכום\nמשפט האינדוקציה' });
    const end = await call('PATCH', `/api/lectures/${lec.moduleId}`, { positionMin: 90 });
    expect(end.json.status).toBe('watched');
    expect(end.json.watchedAt).toBeTruthy();
  });

  it('lets the user reclassify a module as a recording', async () => {
    const course = (await call('GET', '/api/courses/101')).json;
    const syllabus = course.sections[0].modules.find((m: { name: string }) => m.name === 'סילבוס הקורס');
    expect(syllabus.kind).toBe('file');
    await call('PATCH', `/api/modules/${syllabus.id}`, { kindOverride: 'recording' });
    const { lectures } = (await call('GET', '/api/lectures?courseId=101')).json;
    expect(lectures.some((l: { moduleId: number }) => l.moduleId === syllabus.id)).toBe(true);
    await call('PATCH', `/api/modules/${syllabus.id}`, { kindOverride: null });
  });

  it('builds the week view', async () => {
    const w = (await call('GET', '/api/week')).json;
    expect(w.days).toHaveLength(7);
    expect(w.days.flatMap((d: { deadlines: unknown[] }) => d.deadlines).length).toBeGreaterThan(0);
  });

  it('serves an ICS feed behind a secret URL', async () => {
    const s = (await call('GET', '/api/settings')).json;
    const path = new URL(s.icsUrl).pathname;
    const saved = cookie;
    cookie = ''; // calendar apps don't log in
    const ics = await call('GET', path);
    expect(ics.status).toBe(200);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VCALENDAR');
    expect(ics.text).toContain('UID:task-');
    expect(ics.text.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect((await call('GET', '/cal/wrong.ics')).status).toBe(404);
    cookie = saved;
  });

  it('downloads files and zips a course', async () => {
    const files = (await call('GET', '/api/files?courseId=101')).json;
    const pdf = files.find((f: { filename: string }) => f.filename === 'intro_lecture1.pdf');
    expect(pdf.state).toBe('downloaded');
    const dl = await call('GET', `/api/files/${pdf.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain("filename*=UTF-8''intro_lecture1.pdf");
    const zip = await app.inject({ method: 'GET', url: '/api/files/zip?courseId=101', headers: { cookie } });
    expect(zip.statusCode).toBe(200);
    expect(zip.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('updates settings', async () => {
    const s = (await call('PATCH', '/api/settings', { dailyStudyMin: 60, notify: { files: true } })).json;
    expect(s.settings.dailyStudyMin).toBe(60);
    expect(s.settings.notify.files).toBe(true);
    expect(s.settings.notify.deadline).toBe(true);
    expect((await call('PATCH', '/api/settings', { dailyStudyMin: -5 })).status).toBe(400);
  });
});
