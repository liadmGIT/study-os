// Decides what a Moodle activity is (recording, slides, file, ...) from its type, link, file type and name.
import type { ModuleKind } from '../db/schema';
import type { MoodleContent } from '../moodle/types';

const RECORDING_WORDS = /הקלט|recording|record|וידאו|video|סרטון|panopto|kaltura|zoom|זום|youtube|יוטיוב|צפייה/i;
const LECTURE_WORDS = /הרצא|lecture|שיעור|lesson|תרגול|tirgul|recitation|tutorial|class|מפגש|session/i;
const SLIDES_WORDS = /מצגת|מצגות|שקפ|slides|presentation|הרצא|lecture|תרגול|tirgul|recitation|summary|סיכום/i;
const TIRGUL_WORDS = /תרגול|tirgul|recitation|tutorial|תרגיל כיתה/i;

const VIDEO_HOSTS =
  /(^|\.)(zoom\.us|youtube\.com|youtu\.be|vimeo\.com|panopto\.(com|eu)|kaltura\.com|mediaspace|loom\.com|vidgrid|stream\.microsoft\.com)$/i;
const VIDEO_PATHS = /\/rec\/|\/play\/|\/watch|\/video|\/Panopto\/|\/media\//i;
const SLIDE_MIME = /pdf|powerpoint|presentation|keynote|vnd\.ms-pps/i;

const MODNAME_KIND: Record<string, ModuleKind> = {
  assign: 'assignment',
  quiz: 'quiz',
  forum: 'forum',
  hsuforum: 'forum',
  label: 'label',
  page: 'page',
  book: 'page',
  folder: 'folder',
  zoom: 'meeting',
  bigbluebuttonbn: 'meeting',
  kalvidres: 'recording',
  kalvidpres: 'recording',
  kalvidassign: 'assignment',
  panopto: 'recording',
  videotime: 'recording',
  mediagallery: 'recording',
};

export interface ClassifyInput {
  modname: string;
  name: string;
  contents?: MoodleContent[];
}

export function externalUrlOf(modname: string, contents?: MoodleContent[]): string | null {
  if (modname !== 'url') return null;
  const c = contents?.find((x) => x.type === 'url');
  return c?.fileurl ?? null;
}

function isVideoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return VIDEO_HOSTS.test(u.hostname) || (/drive\.google\.com|sharepoint\.com/.test(u.hostname) && VIDEO_PATHS.test(u.pathname));
  } catch {
    return false;
  }
}

export function classifyModule({ modname, name, contents }: ClassifyInput): ModuleKind {
  const direct = MODNAME_KIND[modname];
  if (direct) {
    if (direct === 'meeting' && RECORDING_WORDS.test(name) && /הקלט|recording/i.test(name)) return 'recording';
    return direct;
  }

  if (modname === 'url') {
    const ext = externalUrlOf(modname, contents);
    if (ext && isVideoUrl(ext)) return 'recording';
    if (RECORDING_WORDS.test(name)) return 'recording';
    if (LECTURE_WORDS.test(name) && !/מצגת|שקפ|slides|pdf/i.test(name)) return 'recording';
    return 'link';
  }

  if (modname === 'resource') {
    const files = (contents ?? []).filter((c) => c.type === 'file');
    const mime = files[0]?.mimetype ?? '';
    const fname = files[0]?.filename ?? '';
    if (/^(video|audio)\//.test(mime) || /\.(mp4|mov|mkv|webm|m4v|mp3|m4a)$/i.test(fname)) return 'recording';
    if ((SLIDE_MIME.test(mime) || /\.(pdf|pptx?|key|pps)$/i.test(fname)) && SLIDES_WORDS.test(name)) return 'slides';
    if (/powerpoint|presentation/i.test(mime) || /\.pptx?$/i.test(fname)) return 'slides';
    return 'file';
  }

  if (modname === 'lti' && RECORDING_WORDS.test(name)) return 'recording';
  return 'other';
}

export function isTirgul(name: string): boolean {
  return TIRGUL_WORDS.test(name);
}

/** Pulls a lecture number ("הרצאה 5", "Lecture 05", "שיעור 3") from a name. */
export function lectureNumber(name: string): number | null {
  const m = name.match(/(?:הרצאה|הקלטה|שיעור|תרגול|lecture|lesson|tirgul|recitation|week|שבוע)\s*(?:מס['׳]?\s*|#|no\.?\s*)?(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

/** Finds a date like 12/03/2026, 12.3.26 or 12-03 in a name. Returns YYYY-MM-DD. */
export function dateFromName(name: string, refYear: number): string | null {
  const m = name.match(/(?<!\d)(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?(?!\d)/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : refYear;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
