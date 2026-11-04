// Fake but realistic Moodle data (Hebrew course names, Zoom recording links, weekly sections).
import type {
  ActionEvent,
  ForumDiscussion,
  MoodleAssignment,
  MoodleCourse,
  MoodleForum,
  MoodleQuiz,
  MoodleSection,
  SiteInfo,
  SubmissionStatusResponse,
} from '../../src/moodle/types';

const DAY = 86400;

export interface MockState {
  baseUrl: string;
  username: string;
  password: string;
  token: string;
  siteInfo: SiteInfo;
  courses: MoodleCourse[];
  contents: Record<number, MoodleSection[]>;
  assignments: MoodleAssignment[];
  submissions: Record<number, SubmissionStatusResponse>;
  quizzes: MoodleQuiz[];
  attempts: Record<number, { id: number; state: string; timefinish?: number }[]>;
  events: ActionEvent[];
  forums: MoodleForum[];
  discussions: Record<number, ForumDiscussion[]>;
  files: Record<string, string>; // path -> content
  nextId: number;
}

export const FUNCTIONS = [
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'mod_quiz_get_quizzes_by_courses',
  'mod_quiz_get_user_attempts',
  'core_calendar_get_action_events_by_timesort',
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
];

export function buildFixture(baseUrl: string, now = Math.floor(Date.now() / 1000)): MockState {
  const file = (ctx: number, area: string, name: string, mimetype: string, size = 1200, time = now - 10 * DAY) => ({
    type: 'file',
    filename: name,
    filepath: '/',
    filesize: size,
    fileurl: `${baseUrl}/webservice/pluginfile.php/${ctx}/${area}/content/0/${encodeURIComponent(name)}?forcedownload=1`,
    timecreated: time,
    timemodified: time,
    mimetype,
  });
  const url = (href: string, time: number) => ({
    type: 'url',
    filename: 'url',
    filepath: null,
    filesize: 0,
    fileurl: href,
    timecreated: time,
    timemodified: time,
  });
  const mod = (id: number, modname: string, name: string, extra: Partial<MoodleSection['modules'][number]> = {}) => ({
    id,
    name,
    modname,
    instance: id + 5000,
    visible: 1,
    uservisible: true,
    url: `${baseUrl}/mod/${modname}/view.php?id=${id}`,
    ...extra,
  });

  const weeks = (courseId: number, base: number, prefix: string) => {
    const secs: MoodleSection[] = [
      {
        id: courseId * 100,
        name: 'כללי',
        section: 0,
        visible: 1,
        modules: [
          mod(base + 1, 'forum', 'לוח מודעות'),
          mod(base + 2, 'resource', 'סילבוס הקורס', { contents: [file(base + 2, 'mod_resource', 'syllabus.pdf', 'application/pdf')] as never }),
          mod(base + 3, 'zoom', 'מפגשי זום של הקורס'),
        ],
      },
    ];
    for (let w = 1; w <= 3; w++) {
      const t = now - (4 - w) * 7 * DAY;
      secs.push({
        id: courseId * 100 + w,
        name: `שבוע ${w}`,
        section: w,
        visible: 1,
        modules: [
          mod(base + w * 10 + 1, 'resource', `הרצאה ${w} - מצגת`, {
            contents: [file(base + w * 10 + 1, 'mod_resource', `${prefix}_lecture${w}.pdf`, 'application/pdf', 250000, t)] as never,
          }),
          mod(base + w * 10 + 2, 'url', `הקלטת הרצאה ${w}`, {
            contents: [url(`https://bgu-il.zoom.us/rec/share/${prefix}-lec-${w}`, t + 3600)] as never,
          }),
          mod(base + w * 10 + 3, 'url', `הקלטת תרגול ${w}`, {
            contents: [url(`https://bgu-il.zoom.us/rec/share/${prefix}-tir-${w}`, t + DAY)] as never,
          }),
          mod(base + w * 10 + 4, 'label', 'שימו לב: התרגול ביום ג׳'),
        ],
      });
    }
    return secs;
  };

  const cs1 = weeks(101, 1000, 'intro');
  cs1[1].modules.push(mod(1015, 'assign', 'תרגיל בית 1'));
  cs1[2].modules.push(mod(1025, 'assign', 'תרגיל בית 2'));
  cs1[3].modules.push(
    mod(1035, 'assign', 'תרגיל בית 3'),
    mod(1036, 'folder', 'חומרי עזר', {
      contents: [
        file(1036, 'mod_folder', 'cheatsheet.pdf', 'application/pdf'),
        { ...file(1036, 'mod_folder', 'examples.zip', 'application/zip'), filepath: '/code/' },
      ] as never,
    }),
  );
  const la = weeks(102, 2000, 'linalg');
  la[2].modules.push(mod(2025, 'quiz', 'בוחן אמצע'));
  la[3].modules.push(mod(2035, 'assign', 'מטלה 3 - מרחבים וקטוריים'));
  const ds = weeks(103, 3000, 'ds');
  ds[3].modules.push(
    mod(3036, 'resource', 'הרצאה 3 - וידאו', { contents: [file(3036, 'mod_resource', 'lecture3.mp4', 'video/mp4', 300_000_000)] as never }),
    mod(3037, 'assign', 'פרויקט: עץ AVL'),
  );

  return {
    baseUrl,
    username: 'student',
    password: 'password',
    token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    siteInfo: {
      sitename: 'Moodle - אוניברסיטת בן-גוריון (דמו)',
      username: 'student',
      fullname: 'סטודנט לדוגמה',
      userid: 777,
      siteurl: baseUrl,
      release: '4.3.2 (Build: 20231222)',
      functions: FUNCTIONS.map((name) => ({ name, version: '2023100900' })),
    },
    courses: [
      { id: 101, shortname: '202-1-1011', fullname: 'מבוא למדעי המחשב', startdate: now - 30 * DAY, enddate: now + 90 * DAY, visible: 1 },
      { id: 102, shortname: '201-1-9771', fullname: 'אלגברה לינארית', startdate: now - 30 * DAY, enddate: now + 90 * DAY, visible: 1 },
      { id: 103, shortname: '202-1-1031', fullname: 'מבני נתונים', startdate: now - 30 * DAY, enddate: now + 90 * DAY, visible: 1 },
      { id: 105, shortname: '201-1-0001', fullname: 'חדו״א 1 (תשפ״ה)', startdate: now - 400 * DAY, enddate: now - 250 * DAY, visible: 1 },
    ],
    contents: { 101: cs1, 102: la, 103: ds, 105: [] },
    assignments: [
      { id: 501, cmid: 1015, course: 101, name: 'תרגיל בית 1', intro: '<p>מימוש מחסנית.</p>', duedate: now - 3 * DAY, cutoffdate: 0 },
      { id: 502, cmid: 1025, course: 101, name: 'תרגיל בית 2', intro: '<p>רקורסיה – 5 שאלות.</p>', duedate: now + 2 * DAY },
      { id: 503, cmid: 1035, course: 101, name: 'תרגיל בית 3', intro: '<p>מיונים.</p>', duedate: now + 13 * DAY },
      { id: 504, cmid: 2035, course: 102, name: 'מטלה 3 - מרחבים וקטוריים', intro: '', duedate: now + 5 * DAY },
      { id: 505, cmid: 3037, course: 103, name: 'פרויקט: עץ AVL', intro: '<p>פרויקט זוגות.</p>', duedate: now + 20 * DAY },
    ],
    submissions: {
      501: { lastattempt: { submission: { status: 'submitted', timemodified: now - 4 * DAY } }, feedback: { gradefordisplay: '92.00 / 100.00' } },
      502: { lastattempt: { submission: { status: 'new' } } },
      503: { lastattempt: { submission: { status: 'new' } } },
      504: { lastattempt: { submission: { status: 'draft' } } },
      505: { lastattempt: { submission: { status: 'new' } } },
    },
    quizzes: [{ id: 601, coursemodule: 2025, course: 102, name: 'בוחן אמצע', timeopen: now + 8 * DAY, timeclose: now + 8 * DAY + 2 * 3600 }],
    attempts: { 601: [] },
    events: [
      {
        id: 9001,
        name: 'משוב אמצע סמסטר נפתח',
        activityname: 'משוב אמצע סמסטר',
        modulename: 'feedback',
        instance: 77,
        timestart: now + 4 * DAY,
        timesort: now + 4 * DAY,
        course: { id: 103, fullname: 'מבני נתונים' },
        url: `${baseUrl}/mod/feedback/view.php?id=3090`,
      },
      {
        id: 9002,
        name: 'תרגיל בית 2 להגשה',
        modulename: 'assign',
        instance: 502,
        timestart: now + 2 * DAY,
        timesort: now + 2 * DAY,
        course: { id: 101 },
      },
    ],
    forums: [
      { id: 701, course: 101, type: 'news', name: 'לוח מודעות', cmid: 1001 },
      { id: 702, course: 102, type: 'news', name: 'לוח מודעות', cmid: 2001 },
      { id: 703, course: 103, type: 'news', name: 'לוח מודעות', cmid: 3001 },
      { id: 704, course: 101, type: 'general', name: 'פורום שאלות', cmid: 1009 },
    ],
    discussions: {
      701: [
        {
          id: 8101,
          discussion: 8001,
          subject: 'ברוכים הבאים לקורס',
          message: '<p>שלום לכולם, ההרצאות בימי א׳ ב-10:00.</p>',
          userfullname: 'ד״ר כהן',
          created: now - 25 * DAY,
        },
      ],
      702: [
        {
          id: 8102,
          discussion: 8002,
          subject: 'שינוי בשעות קבלה',
          message: '<p>שעות הקבלה עוברות ליום ד׳.</p>',
          userfullname: 'פרופ׳ לוי',
          created: now - 2 * DAY,
        },
      ],
      703: [],
    },
    files: {},
    nextId: 90000,
  };
}
