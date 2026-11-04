// Date helpers. Times are unix seconds; "day keys" are YYYY-MM-DD in Israel time.
export const TZ = 'Asia/Jerusalem';
export const DAY = 86400;
export const HOUR = 3600;

export const nowSec = () => Math.floor(Date.now() / 1000);

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function zonedParts(ms: number) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(ms))) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** Offset of Israel time from UTC at this instant, in ms. */
function tzOffsetMs(ms: number): number {
  const p = zonedParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Israel wall-clock time -> unix seconds. */
export function zonedToUnix(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess - tzOffsetMs(guess);
  ts = guess - tzOffsetMs(ts); // second pass handles DST edges
  return Math.floor(ts / 1000);
}

export function dayKey(sec: number): string {
  const p = zonedParts(sec * 1000);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function todayKey(): string {
  return dayKey(nowSec());
}

export function israelHour(sec: number): number {
  return zonedParts(sec * 1000).hour;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

export function dayStart(key: string): number {
  const { year, month, day } = parseDayKey(key);
  return zonedToUnix(year, month, day);
}

export function addDays(key: string, n: number): string {
  const { year, month, day } = parseDayKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekday(key: string): number {
  const { year, month, day } = parseDayKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Israeli weeks start on Sunday. */
export function weekStart(key: string): string {
  return addDays(key, -weekday(key));
}

export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
