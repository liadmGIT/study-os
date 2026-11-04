import { clsx } from 'clsx';
import { Check, CircleDot, Circle, ListChecks } from 'lucide-react';
import { patch } from '../lib/api';
import { formatDue, formatRelative, formatShortDate } from '../lib/format';
import { BUCKETS, SOURCE } from '../lib/labels';
import { useAction } from '../lib/queries';
import type { Task } from '../lib/types';
import { useOpenTask } from './Layout';
import { Badge, CourseTag } from './ui';

export function StatusIcon({ task, onClick }: { task: Task; onClick?: () => void }) {
  const finished = task.status === 'done' || task.status === 'submitted';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={finished ? 'סמן כלא בוצע' : 'סמן כבוצע'}
      className={clsx(
        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
        finished ? 'bg-ok text-white' : 'text-faint hover:text-ink',
      )}
    >
      {finished ? <Check className="size-4" strokeWidth={3} /> : task.status === 'in_progress' ? <CircleDot className="size-[22px] text-brand" /> : <Circle className="size-[22px]" />}
    </button>
  );
}

export function TaskRow({ task, showCourse = true }: { task: Task; showCourse?: boolean }) {
  const open = useOpenTask();
  const toggle = useAction((t: Task) => patch(`/api/tasks/${t.id}`, { status: t.status === 'done' || t.status === 'submitted' ? 'in_progress' : 'done' }));
  const b = BUCKETS[task.urgency.bucket];
  const finished = task.status === 'done' || task.status === 'submitted';
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const recentlyMoved = task.dueChangedAt && Date.now() / 1000 - task.dueChangedAt < 7 * 86400;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open(task.id)}
      onKeyDown={(e) => e.key === 'Enter' && open(task.id)}
      className="group relative flex cursor-pointer gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-sunken"
    >
      <span className="absolute inset-y-2.5 start-0 w-[3px] rounded-full" style={{ background: finished ? 'transparent' : b.color }} />
      <StatusIcon task={task} onClick={() => toggle.run(task)} />
      <div className="min-w-0 flex-1">
        <div className={clsx('text-[14.5px] font-medium leading-snug', finished && 'text-muted line-through decoration-faint')}>{task.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {showCourse && task.course ? <CourseTag name={task.course.name} color={task.course.color} className="max-w-48" /> : null}
          {task.dueAt ? (
            <span className={clsx('text-xs tabular', task.urgency.bucket === 'overdue' ? 'text-overdue font-medium' : 'text-muted')} title={formatRelative(task.dueAt)}>
              {formatDue(task.dueAt)}
            </span>
          ) : null}
          {task.subtasks.length ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted tabular">
              <ListChecks className="size-3.5" />
              {doneSubs}/{task.subtasks.length}
            </span>
          ) : null}
          {task.notStarted && !finished ? <Badge tone="red">עוד לא התחלת</Badge> : null}
          {recentlyMoved && task.prevDueAt && !finished ? (
            <Badge tone="amber" title={`היה: ${formatShortDate(task.prevDueAt)}`}>
              התאריך זז
            </Badge>
          ) : null}
          {task.status === 'submitted' ? <Badge tone="green">הוגש</Badge> : null}
          {task.grade ? <Badge tone="green">ציון: {task.grade}</Badge> : null}
          {task.source !== 'assign' ? <Badge>{SOURCE[task.source]}</Badge> : null}
          {task.priority === 3 && !finished ? <Badge tone="orange">עדיפות גבוהה</Badge> : null}
        </div>
      </div>
    </div>
  );
}
