import { Check } from 'lucide-react';
import { patch } from '../lib/api';
import { formatDue, formatRelative, formatShortDate } from '../lib/format';
import { SOURCE, STATUS } from '../lib/labels';
import { useAction } from '../lib/queries';
import type { Task } from '../lib/types';
import { useOpenTask } from './Layout';
import { cn, CourseTag, Tag } from './ui';

const isFinished = (t: Task) => t.status === 'done' || t.status === 'submitted';

/** Square notebook checkbox: empty = not started, inner square = in progress, tick = done. 44px touch target. */
export function TaskCheck({ task }: { task: Task }) {
  const toggle = useAction((t: Task) => patch(`/api/tasks/${t.id}`, { status: isFinished(t) ? 'in_progress' : 'done' }));
  const finished = isFinished(task);
  const inProgress = task.status === 'in_progress';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={finished ? true : inProgress ? 'mixed' : false}
      aria-label={`${task.title} – ${STATUS[task.status]}`}
      onClick={() => toggle.run(task)}
      disabled={toggle.pending}
      className="relative z-10 -my-2.5 -ms-2.5 flex size-11 shrink-0 items-center justify-center rounded-md md:-my-1.5 md:-ms-1.5 md:size-8"
    >
      <span
        className={cn(
          'flex size-[18px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
          finished ? 'border-green bg-green text-paper' : inProgress ? 'border-ink' : 'border-ink-3 hover:border-ink',
        )}
      >
        {finished ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : inProgress ? <span className="size-2 rounded-[1.5px] bg-ink" /> : null}
      </span>
    </button>
  );
}

export function TaskRow({ task, showCourse = true }: { task: Task; showCourse?: boolean }) {
  const open = useOpenTask();
  const finished = isFinished(task);
  const doneSubs = task.subtasks.filter((s) => s.done).length;
  const recentlyMoved = !!task.dueChangedAt && !!task.prevDueAt && Date.now() / 1000 - task.dueChangedAt < 7 * 86400 && !finished;
  const hot = !finished && (task.urgency.bucket === 'overdue' || task.urgency.bucket === 'urgent');

  return (
    <li className="group relative flex items-start gap-3 border-b border-rule py-3.5 last:border-b-0">
      <TaskCheck task={task} />
      <div className="min-w-0 flex-1">
        {/* The title button stretches over the whole row, so the row is one big target. */}
        <button
          type="button"
          onClick={() => open(task.id)}
          className={cn(
            "block text-start text-[15.5px] leading-snug font-medium after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--c-focus)] group-hover:underline group-hover:decoration-rule-strong group-hover:underline-offset-4",
            finished && 'text-ink-3 line-through decoration-ink-3',
          )}
        >
          {task.title}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {showCourse && task.course ? <CourseTag name={task.course.name} color={task.course.color} className="max-w-56" /> : null}
          {task.subtasks.length ? (
            <span className="text-[13px] text-ink-2 tabular" aria-label={`${doneSubs} מתוך ${task.subtasks.length} תתי־משימות`}>
              {doneSubs}/{task.subtasks.length} שאלות
            </span>
          ) : null}
          {task.notStarted && !finished ? <Tag tone="accent">עוד לא התחלת</Tag> : null}
          {recentlyMoved ? (
            <Tag tone="amber" title={`היה: ${formatShortDate(task.prevDueAt!)}`}>
              התאריך זז
            </Tag>
          ) : null}
          {task.status === 'submitted' ? <Tag tone="green">הוגש</Tag> : null}
          {task.grade ? <Tag tone="green">ציון {task.grade}</Tag> : null}
          {task.source !== 'assign' ? <span className="text-[13px] text-ink-3">{SOURCE[task.source]}</span> : null}
          {task.priority === 3 && !finished ? <span className="text-[13px] font-medium text-accent">עדיפות גבוהה</span> : null}
        </div>
      </div>
      {task.dueAt ? (
        <div className="pointer-events-none shrink-0 pt-px text-end">
          <div className={cn('text-[14px] tabular', hot ? 'font-semibold text-accent' : finished ? 'text-ink-3' : 'text-ink')}>{formatDue(task.dueAt)}</div>
          {!finished ? <div className="text-[12.5px] text-ink-3">{formatRelative(task.dueAt)}</div> : null}
        </div>
      ) : null}
    </li>
  );
}

export function TaskList({ tasks, showCourse = true, label }: { tasks: Task[]; showCourse?: boolean; label?: string }) {
  return (
    <ul aria-label={label}>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} showCourse={showCourse} />
      ))}
    </ul>
  );
}
