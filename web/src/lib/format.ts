const TZ = 'Asia/Jerusalem';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, ...opts });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit' });
const shortDateFmt = fmt({ day: 'numeric', month: 'numeric' });
const weekdayFmt = fmt({ weekday: 'long' });
const weekdayShortFmt = fmt({ weekday: 'short' });
const fullDateFmt = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const dateTimeFmt = fmt({ weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const nowSec = () => Math.floor(Date.now() / 1000);
export const dayKeyOf = (sec: number) => keyFmt.format(new Date(sec * 1000));
export const todayKey = () => dayKeyOf(nowSec());

/** Noon of a day key, safe for formatting the date in any timezone. */
const keyToDate = (key: string) => new Date(`${key}T12:00:00Z`);

export function addDays(key: string, n: number): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const formatTime = (sec: number) => timeFmt.format(new Date(sec * 1000));
export const formatDateTime = (sec: number) => dateTimeFmt.format(new Date(sec * 1000));
export const formatShortDate = (sec: number) => shortDateFmt.format(new Date(sec * 1000));
export const formatDayKey = (key: string) => shortDateFmt.format(keyToDate(key));
export const formatWeekday = (key: string) => weekdayFmt.format(keyToDate(key));
export const formatWeekdayShort = (key: string) => weekdayShortFmt.format(keyToDate(key));
export const formatFullDate = (key: string) => fullDateFmt.format(keyToDate(key));

/** "היום 23:59", "מחר 10:00", "יום ה׳ 12:00", "12.11 23:59", "לפני 3 ימים" */
export function formatDue(sec: number): string {
  const key = dayKeyOf(sec);
  const today = todayKey();
  const diffDays = Math.round((keyToDate(key).getTime() - keyToDate(today).getTime()) / 86400000);
  const time = formatTime(sec);
  if (diffDays === 0) return `היום ${time}`;
  if (diffDays === 1) return `מחר ${time}`;
  if (diffDays === -1) return `אתמול ${time}`;
  if (diffDays > 1 && diffDays < 7) return `${weekdayShortFmt.format(keyToDate(key))} ${time}`;
  return `${formatDayKey(key)} ${time}`;
}

export function formatRelative(sec: number): string {
  const diff = sec - nowSec();
  const abs = Math.abs(diff);
  const past = diff < 0;
  let s: string;
  if (abs < 3600) s = `${Math.max(1, Math.round(abs / 60))} דק׳`;
  else if (abs < 48 * 3600) {
    const h = Math.round(abs / 3600);
    s = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  } else {
    const d = Math.round(abs / 86400);
    s = d === 2 ? 'יומיים' : `${d} ימים`;
  }
  return past ? `לפני ${s}` : `בעוד ${s}`;
}

export function formatAgo(sec: number): string {
  const diff = nowSec() - sec;
  if (diff < 60) return 'עכשיו';
  return formatRelative(sec);
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} דק׳`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return m ? `${hours} ו-${m} דק׳` : hours;
}

export function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

/** datetime-local input value (Israel time) <-> unix seconds */
export function toLocalInput(sec: number | null): string {
  if (!sec) return '';
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(sec * 1000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const [date, time = '23:59'] = value.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  // Find the UTC instant whose Israel wall-clock time matches.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (ms: number) => {
    const local = toLocalInput(Math.floor(ms / 1000));
    const [ld, lt] = local.split('T');
    const [ly, lm, lday] = ld.split('-').map(Number);
    const [lh, lmin] = lt.split(':').map(Number);
    return Date.UTC(ly, lm - 1, lday, lh, lmin) - ms;
  };
  let ts = guess - offset(guess);
  ts = guess - offset(ts);
  return Math.floor(ts / 1000);
}
