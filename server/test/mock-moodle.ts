// A small HTTP server that answers like Moodle's web services, for tests and local demos.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { md5 } from '../src/lib/crypto';
import { buildFixture, type MockState } from './fixtures/data';

/** Turns PHP-style form keys (courseids[0]=1, a[b][c]=2) into nested objects/arrays. */
export function parsePhpForm(body: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of body) {
    const parts = key.split(/\[|\]\[|\]/).filter((p) => p !== '');
    let cur: Record<string, unknown> = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) cur[p] = value;
      else {
        cur[p] ??= {};
        cur = cur[p] as Record<string, unknown>;
      }
    });
  }
  const arrayify = (v: unknown): unknown => {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length && keys.every((k) => /^\d+$/.test(k))) return keys.sort((a, b) => +a - +b).map((k) => arrayify(o[k]));
      for (const k of keys) o[k] = arrayify(o[k]);
    }
    return v;
  };
  return arrayify(out) as Record<string, unknown>;
}

const exception = (errorcode: string, message = errorcode) => ({ exception: 'moodle_exception', errorcode, message });

function handleWs(state: MockState, fn: string, p: Record<string, unknown>): unknown {
  const ids = (p.courseids as string[] | undefined)?.map(Number) ?? [];
  switch (fn) {
    case 'core_webservice_get_site_info':
      return state.siteInfo;
    case 'core_enrol_get_users_courses':
      return state.courses;
    case 'core_course_get_contents':
      return state.contents[Number(p.courseid)] ?? exception('invalidrecord', 'Course not found');
    case 'mod_assign_get_assignments':
      return {
        courses: state.courses
          .filter((c) => !ids.length || ids.includes(c.id))
          .map((c) => ({ id: c.id, fullname: c.fullname, assignments: state.assignments.filter((a) => a.course === c.id) })),
        warnings: [],
      };
    case 'mod_assign_get_submission_status':
      return state.submissions[Number(p.assignid)] ?? { lastattempt: { submission: { status: 'new' } } };
    case 'mod_quiz_get_quizzes_by_courses':
      return { quizzes: state.quizzes.filter((q) => !ids.length || ids.includes(q.course)), warnings: [] };
    case 'mod_quiz_get_user_attempts':
      return { attempts: state.attempts[Number(p.quizid)] ?? [], warnings: [] };
    case 'core_calendar_get_action_events_by_timesort':
      return { events: state.events.filter((e) => (e.timesort ?? e.timestart) >= Number(p.timesortfrom ?? 0)) };
    case 'mod_forum_get_forums_by_courses':
      return state.forums.filter((f) => !ids.length || ids.includes(f.course));
    case 'mod_forum_get_forum_discussions':
      return { discussions: state.discussions[Number(p.forumid)] ?? [], warnings: [] };
    default:
      return exception('accessexception', `Access control exception (${fn})`);
  }
}

export interface MockMoodle {
  url: string;
  state: MockState;
  calls: string[];
  close: () => Promise<void>;
}

export async function startMockMoodle(opts: { port?: number; state?: (baseUrl: string) => MockState } = {}): Promise<MockMoodle> {
  const calls: string[] = [];
  let state!: MockState;

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    if (u.pathname === '/login/token.php') {
      const f = new URLSearchParams(raw);
      if (f.get('username') === state.username && f.get('password') === state.password) {
        return json(200, { token: state.token, privatetoken: 'private-' + state.token });
      }
      return json(200, { error: 'פרטי ההתחברות שגויים, נסו שוב.', errorcode: 'invalidlogin' });
    }

    if (u.pathname === '/lib/ajax/service-nologin.php') {
      return json(200, [{ error: false, data: { wwwroot: state.baseUrl, sitename: state.siteInfo.sitename, typeoflogin: 1, release: '4.3.2' } }]);
    }

    if (u.pathname === '/admin/tool/mobile/launch.php') {
      const passport = u.searchParams.get('passport') ?? '';
      const payload = Buffer.from(`${md5(state.baseUrl + passport)}:::${state.token}`).toString('base64');
      res.writeHead(302, { Location: `moodlemobile://token=${payload}` });
      return res.end();
    }

    if (u.pathname === '/webservice/rest/server.php') {
      const params = parsePhpForm(new URLSearchParams(raw));
      const fn = u.searchParams.get('wsfunction') ?? String(params.wsfunction ?? '');
      calls.push(fn);
      if (params.wstoken !== state.token) return json(200, exception('invalidtoken', 'Invalid token - token not found'));
      return json(200, handleWs(state, fn, params));
    }

    if (u.pathname.startsWith('/webservice/pluginfile.php/')) {
      if (u.searchParams.get('token') !== state.token) return json(200, { error: 'Invalid token', errorcode: 'invalidtoken' });
      const name = decodeURIComponent(u.pathname.split('/').pop() ?? 'file');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      return res.end(state.files[name] ?? `mock content of ${name}\n`);
    }

    // Demo helper: POST /__mock/scenario moves a deadline, posts a recording and an announcement.
    if (u.pathname === '/__mock/scenario' && req.method === 'POST') {
      applyScenario(state);
      return json(200, { ok: true });
    }

    json(404, { error: 'not found' });
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state = opts.state ? opts.state(url) : buildFixture(url);

  return {
    url,
    get state() {
      return state;
    },
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** "The lecturer updates the course": deadline moves, new recording, new announcement, assignment submitted. */
export function applyScenario(state: MockState) {
  const now = Math.floor(Date.now() / 1000);
  const a = state.assignments.find((x) => x.id === 503);
  if (a) a.duedate += 3 * 86400;
  const week3 = state.contents[102]?.[3];
  week3?.modules.push({
    id: state.nextId++,
    name: 'הקלטת הרצאה 4',
    modname: 'url',
    instance: 1,
    visible: 1,
    uservisible: true,
    url: `${state.baseUrl}/mod/url/view.php?id=${state.nextId}`,
    contents: [{ type: 'url', filename: 'url', fileurl: 'https://bgu-il.zoom.us/rec/share/linalg-lec-4', timecreated: now, timemodified: now }],
  });
  state.discussions[703] = [
    {
      id: state.nextId++,
      discussion: state.nextId++,
      subject: 'הפרויקט נדחה בשבוע',
      message: '<p>בעקבות בקשות, מועד הגשת הפרויקט נדחה.</p>',
      userfullname: 'ד״ר מזרחי',
      created: now,
    },
    ...(state.discussions[703] ?? []),
  ];
  state.submissions[502] = { lastattempt: { submission: { status: 'submitted', timemodified: now } } };
}
