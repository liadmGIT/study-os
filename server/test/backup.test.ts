// Backup → lose the server → reconnect and sync → restore: personal data comes back, nothing is duplicated.
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { config } from '../src/config';
import { db, initDb, schema } from '../src/db';
import { saveConnection } from '../src/moodle/account';
import { loginWithPassword } from '../src/moodle/auth';
import { runSync } from '../src/sync/engine';
import { startMockMoodle, type MockMoodle } from './mock-moodle';

let mock: MockMoodle;
let app: FastifyInstance;
let cookie = '';

async function freshServer() {
  initDb(':memory:');
  await saveConnection(await loginWithPassword(mock.url, 'student', 'password'), 'student', mock.url);
  await runSync('manual', { skipDownloads: true });
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) {
  const res = await app.inject({ method, url, payload: body as object, headers: { cookie } });
  return { status: res.statusCode, json: () => res.json(), headers: res.headers, body: res.body };
}

beforeAll(async () => {
  mock = await startMockMoodle();
  (config as { moodleUrl: string }).moodleUrl = mock.url;
  await freshServer();
  app = await buildApp();
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { password: 'test-password' } });
  cookie = String(login.headers['set-cookie']).split(';')[0];
});

afterAll(async () => {
  await app.close();
  await mock.close();
});

describe('backup', () => {
  it('exports and restores everything that exists only here', async () => {
    // Things the student did by hand.
    const lecture = db().select().from(schema.lectures).all()[0];
    await call('PATCH', `/api/lectures/${lecture.moduleId}`, { notesMd: '# אינדוקציה\nבסיס וצעד', positionMin: 40, durationMin: 80 });
    const assign = db().select().from(schema.tasks).where(eq(schema.tasks.moodleId, 503)).get()!;
    await call('PATCH', `/api/tasks/${assign.id}`, { priority: 3, estimateMin: 300, plannedDate: '2026-11-20' });
    await call('POST', `/api/tasks/${assign.id}/split`, { count: 3 });
    const personal = (await call('POST', '/api/tasks', { title: 'לחזור על פרק 2', courseId: 101, priority: 2 })).json();
    await call('POST', `/api/tasks/${personal.id}/subtasks`, { title: 'סעיף א' });
    await call('PATCH', '/api/courses/102', { color: '#123456' });
    await call('PATCH', '/api/settings', { dailyStudyMin: 45 });
    const syllabus = db().select().from(schema.modules).where(eq(schema.modules.name, 'סילבוס הקורס')).get()!;
    await call('PATCH', `/api/modules/${syllabus.id}`, { kindOverride: 'recording' });

    const res = await call('GET', '/api/backup');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="study-os-backup-\d{4}-\d{2}-\d{2}\.json"/);
    const backup = JSON.parse(res.body);
    expect(backup).toMatchObject({ app: 'study-os', version: 1 });

    // The server is lost: a new database, reconnect, first sync.
    await freshServer();
    expect(db().select().from(schema.lectures).where(eq(schema.lectures.moduleId, lecture.moduleId)).get()?.notesMd).toBe('');

    const restored = await call('POST', '/api/backup/restore', backup);
    expect(restored.status).toBe(200);
    expect(restored.json().applied).toMatchObject({ settings: 1, personalTasks: 1, modules: 1 });

    const lec = db().select().from(schema.lectures).where(eq(schema.lectures.moduleId, lecture.moduleId)).get()!;
    expect(lec).toMatchObject({ notesMd: '# אינדוקציה\nבסיס וצעד', positionMin: 40, durationMin: 80, status: 'in_progress' });

    const task = db().select().from(schema.tasks).where(eq(schema.tasks.moodleId, 503)).get()!;
    expect(task).toMatchObject({ priority: 3, estimateMin: 300, plannedDate: '2026-11-20' });
    expect(db().select().from(schema.subtasks).where(eq(schema.subtasks.taskId, task.id)).all().map((s) => s.title)).toEqual(['שאלה 1', 'שאלה 2', 'שאלה 3']);

    const mine = db().select().from(schema.tasks).where(eq(schema.tasks.source, 'personal')).all();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'לחזור על פרק 2', courseId: 101, priority: 2 });
    expect(db().select().from(schema.subtasks).where(eq(schema.subtasks.taskId, mine[0].id)).all().map((s) => s.title)).toEqual(['סעיף א']);

    expect(db().select().from(schema.courses).where(eq(schema.courses.id, 102)).get()?.color).toBe('#123456');
    expect((await call('GET', '/api/settings')).json().settings.dailyStudyMin).toBe(45);
    expect(db().select().from(schema.lectures).where(eq(schema.lectures.moduleId, syllabus.id)).get()).toBeTruthy();

    // Restoring the same file again doesn't duplicate personal tasks.
    const again = (await call('POST', '/api/backup/restore', backup)).json();
    expect(again.skipped.personalTasks).toBe(1);
    expect(db().select().from(schema.tasks).where(eq(schema.tasks.source, 'personal')).all()).toHaveLength(1);
  });

  it('rejects files that are not a backup', async () => {
    expect((await call('POST', '/api/backup/restore', { hello: 'world' })).status).toBe(400);
  });
});
