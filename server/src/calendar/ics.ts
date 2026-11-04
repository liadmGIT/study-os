// iCalendar feed for Google / Apple / Outlook "subscribe by URL".
import { catchupPlanFor } from '../domain/lectures';
import { listTasks } from '../domain/tasks';
import { getSettings } from '../lib/settings';
import { addDays, nowSec, todayKey } from '../lib/time';

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** Lines longer than 75 octets must be folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch);
    if (size + len > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utc = (sec: number) =>
  new Date(sec * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dateOnly = (key: string) => key.replace(/-/g, '');

export function buildIcs(baseUrl: string): string {
  const s = getSettings();
  const stamp = utc(nowSec());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//study-os//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:לימודים – דדליינים',
    'X-WR-TIMEZONE:Asia/Jerusalem',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const t of listTasks()) {
    if (!t.dueAt || t.urgency.bucket === 'expired') continue;
    const done = t.status === 'done' || t.status === 'submitted';
    const prefix = done ? '✓ ' : '📌 ';
    const course = t.course ? ` · ${t.course.name}` : '';
    const desc = [t.course?.name, t.description?.slice(0, 500), `${baseUrl}/tasks?open=${t.id}`].filter(Boolean).join('\n\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${t.id}@study-os`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(t.dueAt - 30 * 60)}`,
      `DTEND:${utc(t.dueAt)}`,
      `SUMMARY:${esc(prefix + t.title + course)}`,
      `DESCRIPTION:${esc(desc)}`,
      ...(t.url ? [`URL:${t.url}`] : []),
      'TRANSP:TRANSPARENT',
      ...(done
        ? []
        : ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, 'TRIGGER:-PT24H', 'END:VALARM']),
      'END:VEVENT',
    );
  }

  if (s.icsIncludePlan) {
    const plan = catchupPlanFor(todayKey(), 7);
    for (const day of plan.days) {
      if (!day.items.length) continue;
      const summary = `🎬 השלמת הרצאות (${day.totalMin} דק׳)`;
      const desc = day.items.map((i) => `• ${i.title} – ${i.minutes} דק׳${i.parts > 1 ? ` (חלק ${i.part}/${i.parts})` : ''}`).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:plan-${day.date}@study-os`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateOnly(day.date)}`,
        `DTEND;VALUE=DATE:${dateOnly(addDays(day.date, 1))}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(desc + `\n\n${baseUrl}/week`)}`,
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
