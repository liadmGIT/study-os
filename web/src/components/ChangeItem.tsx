import { CalendarClock, CheckCheck, FileText, GraduationCap, ListPlus, Megaphone, PlayCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { formatAgo, formatShortDate } from '../lib/format';
import { CHANGE } from '../lib/labels';
import type { Change } from '../lib/types';
import { CourseTag } from './ui';

const ICONS = {
  course_new: Sparkles,
  task_new: ListPlus,
  due_changed: CalendarClock,
  submitted: CheckCheck,
  grade_new: GraduationCap,
  recording_new: PlayCircle,
  file_new: FileText,
  file_updated: FileText,
  module_new: Sparkles,
  announcement_new: Megaphone,
};

const toneColor: Record<string, string> = {
  red: 'var(--color-overdue)',
  orange: 'var(--color-urgent)',
  amber: 'var(--color-week)',
  green: 'var(--color-ok)',
  brand: 'var(--color-brand)',
  slate: 'var(--color-later)',
  neutral: 'var(--color-muted)',
};

export function changeLink(c: Change): string {
  if (c.entityType === 'task') return `?open=${c.entityId}`;
  if (c.type === 'recording_new') return `/lectures?course=${c.courseId}`;
  if (c.type === 'announcement_new') return `/updates?tab=announcements`;
  if (c.courseId) return `/courses/${c.courseId}`;
  return '/courses';
}

export function ChangeItem({ change }: { change: Change }) {
  const meta = CHANGE[change.type];
  const Icon = ICONS[change.type] ?? Sparkles;
  const p = change.payload as { from?: number; to?: number; grade?: string };
  return (
    <Link to={changeLink(change)} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${toneColor[meta.tone]} 14%, transparent)`, color: toneColor[meta.tone] }}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium" style={{ color: toneColor[meta.tone] }}>
            {meta.label}
          </span>
          <span className="text-[11px] text-faint">{formatAgo(change.createdAt)}</span>
        </div>
        <div className="truncate text-sm">{change.title}</div>
        {change.type === 'due_changed' && p.from && p.to ? (
          <div className="text-xs text-muted tabular">
            {formatShortDate(p.from)} ← {formatShortDate(p.to)}
          </div>
        ) : null}
        {change.type === 'grade_new' && p.grade ? <div className="text-xs text-muted">{p.grade}</div> : null}
        {change.course ? <CourseTag name={change.course.name} color={change.course.color} className="mt-0.5" /> : null}
      </div>
    </Link>
  );
}
