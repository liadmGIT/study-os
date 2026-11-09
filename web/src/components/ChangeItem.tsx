import { Link } from 'react-router';
import { formatAgo, formatShortDate } from '../lib/format';
import { CHANGE, TONE_COLOR } from '../lib/labels';
import type { Change } from '../lib/types';

export function changeLink(c: Change): string {
  if (c.entityType === 'task') return `?open=${c.entityId}`;
  if (c.type === 'recording_new') return `/lectures?course=${c.courseId}`;
  if (c.type === 'announcement_new') return `/updates?tab=announcements`;
  if (c.courseId) return `/courses/${c.courseId}`;
  return '/courses';
}

/** One line in the "what changed" log: kind in its colour, then what, then where and when. */
export function ChangeItem({ change }: { change: Change }) {
  const meta = CHANGE[change.type];
  const color = TONE_COLOR[meta.tone];
  const p = change.payload as { from?: number; to?: number; grade?: string };
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link to={changeLink(change)} className="group flex gap-3 py-3">
        <span aria-hidden className="mt-1 w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className="font-medium" style={{ color }}>
              {meta.label}
            </span>
            <span className="text-ink-3">
              <time dateTime={new Date(change.createdAt * 1000).toISOString()}>{formatAgo(change.createdAt)}</time>
            </span>
          </div>
          <div className="text-[15px] leading-snug group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4">{change.title}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
            {change.course ? <span>{change.course.name}</span> : null}
            {change.type === 'due_changed' && p.from && p.to ? (
              <span className="tabular">
                {formatShortDate(p.from)} ← {formatShortDate(p.to)}
              </span>
            ) : null}
            {change.type === 'grade_new' && p.grade ? <span>{p.grade}</span> : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
