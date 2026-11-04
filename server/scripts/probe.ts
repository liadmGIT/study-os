// Run on your own computer: checks that BGU Moodle allows app access and what the sync will see.
//   npm run moodle:probe
//   npm run moodle:probe -- --token <32-char token>      (if your login is via SSO)
//   npm run moodle:probe -- --public                      (only checks the site is reachable; no login)
// Without a terminal (e.g. a cloud session) it reads MOODLE_TOKEN, or MOODLE_USERNAME + MOODLE_PASSWORD,
// from the environment. Nothing is saved; the password is only sent to Moodle.
import readline from 'node:readline';
import { getPublicConfig, loginWithPassword } from '../src/moodle/auth';
import { MoodleClient } from '../src/moodle/client';
import type { AssignmentsResponse, MoodleCourse, MoodleSection, SiteInfo } from '../src/moodle/types';
import { classifyModule } from '../src/sync/classify';
import { IMPORTANT_FUNCTIONS } from '../src/routes/moodle';

const base = (process.env.MOODLE_URL ?? 'https://moodle.bgu.ac.il/moodle').replace(/\/+$/, '');
const args = process.argv.slice(2);
const tokenArg = (args.includes('--token') ? args[args.indexOf('--token') + 1] : undefined) ?? process.env.MOODLE_TOKEN;
const publicOnly = args.includes('--public');

function ask(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => out.output.write(s.includes(question) ? s : '*');
  }
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    }),
  );
}

const ok = (msg: string) => console.log(`  ✅ ${msg}`);
const warn = (msg: string) => console.log(`  ⚠️  ${msg}`);
const fail = (msg: string) => console.log(`  ❌ ${msg}`);

console.log(`\nבודק את ${base}\n`);

console.log('1. האם האתר זמין?');
try {
  const pc = await getPublicConfig(base);
  ok(`זמין: ${pc.sitename ?? ''} (Moodle ${pc.release ?? '?'})`);
  if (pc.typeoflogin === 1) ok('התחברות עם שם משתמש וסיסמה נתמכת');
  else warn(`ההתחברות היא דרך הדפדפן (SSO, typeoflogin=${pc.typeoflogin}). במערכת השתמש ב"התחברות דרך הדפדפן".`);
} catch (err) {
  fail(`לא הצלחתי לקבל את הגדרות האתר: ${err instanceof Error ? err.message : err}`);
}

if (publicOnly) {
  console.log('\nבדיקה ציבורית בלבד (--public), בלי התחברות.\n');
  process.exit(0);
}

let token = tokenArg;
if (!token) {
  console.log('\n2. התחברות (הסיסמה נשלחת רק ל-Moodle ולא נשמרת)');
  const fromEnv = process.env.MOODLE_USERNAME && process.env.MOODLE_PASSWORD;
  if (!fromEnv && !process.stdin.isTTY) {
    fail('אין טרמינל להקלדת סיסמה. הגדר MOODLE_USERNAME ו-MOODLE_PASSWORD (או MOODLE_TOKEN), או הרץ עם --public.');
    process.exit(1);
  }
  const username = process.env.MOODLE_USERNAME || (await ask('  שם משתמש BGU: '));
  const password = process.env.MOODLE_PASSWORD || (await ask('  סיסמה: ', true));
  try {
    token = (await loginWithPassword(base, username, password)).token;
    ok('קיבלתי טוקן');
  } catch (err) {
    fail(`ההתחברות נכשלה: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

const client = new MoodleClient({ baseUrl: base, token: token! });
console.log('\n3. מה מותר לנו לקרוא?');
const info = await client.call<SiteInfo>('core_webservice_get_site_info');
ok(`מחובר בתור ${info.fullname} (מזהה ${info.userid})`);
const fns = new Set((info.functions ?? []).map((f) => f.name));
for (const fn of IMPORTANT_FUNCTIONS) (fns.has(fn) ? ok : warn)(fn);

console.log('\n4. מה הסנכרון יראה?');
const courses = await client.call<MoodleCourse[]>('core_enrol_get_users_courses', { userid: info.userid });
ok(`${courses.length} קורסים`);
for (const c of courses.slice(0, 15)) console.log(`     • ${c.fullname}`);

const recent = courses.filter((c) => !c.enddate || c.enddate > Date.now() / 1000 - 30 * 86400).slice(0, 3);
if (fns.has('mod_assign_get_assignments') && recent.length) {
  const a = await client.call<AssignmentsResponse>('mod_assign_get_assignments', { courseids: recent.map((c) => c.id) });
  ok(`${a.courses.reduce((s, c) => s + c.assignments.length, 0)} מטלות ב-${recent.length} קורסים אחרונים`);
}
for (const c of recent) {
  try {
    const sections = await client.call<MoodleSection[]>('core_course_get_contents', { courseid: c.id });
    const kinds: Record<string, number> = {};
    const recs: string[] = [];
    for (const s of sections)
      for (const m of s.modules) {
        const k = classifyModule(m);
        kinds[k] = (kinds[k] ?? 0) + 1;
        if (k === 'recording' && recs.length < 3) recs.push(m.name);
      }
    ok(`${c.fullname}: ${Object.entries(kinds).map(([k, n]) => `${k}=${n}`).join(', ')}`);
    for (const r of recs) console.log(`       🎬 ${r}`);
  } catch (err) {
    warn(`${c.fullname}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log('\nסיימתי. אם הכול ירוק – המערכת תעבוד מול ה-Moodle שלך.\n');
