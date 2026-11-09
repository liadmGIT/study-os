import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type CSSProperties, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useOpenTask } from '../components/Layout';
import { buttonClass, cn, CourseMark, IconButton, PageHeader, PageLoader } from '../components/ui';
import { patch } from '../lib/api';
import { dayOfMonth, formatDayMonth, formatMinutes, formatTime, formatWeekday } from '../lib/format';
import { useAction, useWeek } from '../lib/queries';
import type { PlanItem, Task } from '../lib/types';

export function WeekPage() {
  const [params, setParams] = useSearchParams();
  const start = params.get('start') ?? undefined;
  const q = useWeek(start);
  const plan = useAction((id: number, plannedDate: string | null) => patch(`/api/tasks/${id}`, { plannedDate }));
  const [dragOver, setDragOver] = useState<string | null>(null);

  if (q.isLoading || !q.data) return <PageLoader />;
  const w = q.data;
  const go = (s: string | null) => {
    if (s) params.set('start', s);
    else params.delete('start');
    setParams(params, { replace: true });
  };
  const dropProps = (date: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes('text/task-id')) {
        e.preventDefault();
        setDragOver(date ?? 'tray');
      }
    },
    onDragLeave: () => setDragOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const id = Number(e.dataTransfer.getData('text/task-id'));
      if (id) plan.run(id, date);
    },
  });
  const isCurrentWeek = w.days.some((d) => d.date === w.today);

  return (
    <div>
      <PageHeader
        eyebrow={`${formatDayMonth(w.days[0].date)} – ${formatDayMonth(w.days[6].date)}`}
        title={isCurrentWeek ? 'השבוע' : 'שבוע'}
        actions={
          <>
            <IconButton label="שבוע קודם" onClick={() => go(w.prev)}>
              <ChevronRight className="size-5" aria-hidden />
            </IconButton>
            {!isCurrentWeek ? (
              <button type="button" onClick={() => go(null)} className={buttonClass('secondary', 'sm')}>
                חזרה להיום
              </button>
            ) : null}
            <IconButton label="שבוע הבא" onClick={() => go(w.next)}>
              <ChevronLeft className="size-5" aria-hidden />
            </IconButton>
            <Link to="/settings#calendar" className={cn(buttonClass('ghost', 'sm'), 'ms-2')}>
              <CalendarPlus className="size-4" aria-hidden />
              <span className="max-sm:hidden">לחבר ליומן גוגל</span>
            </Link>
          </>
        }
      />

      {/* A planner spread: seven columns on desktop, a list of days on phones. */}
      <ol className="rise grid border-t-2 border-ink lg:grid-cols-7 lg:divide-x lg:divide-x-reverse lg:divide-rule" style={{ '--i': 1 } as CSSProperties} aria-label="ימי השבוע">
        {w.days.map((day) => {
          const isToday = day.date === w.today;
          const past = day.date < w.today;
          const planned = day.planned.filter((t) => !day.deadlines.some((d) => d.id === t.id));
          const load = day.lectures.reduce((s, i) => s + i.minutes, 0);
          const empty = !day.deadlines.length && !planned.length && !day.lectures.length;
          return (
            <li
              key={day.date}
              {...dropProps(day.date)}
              aria-current={isToday ? 'date' : undefined}
              className={cn(
                'flex flex-col border-b border-rule px-1 py-4 transition-colors lg:min-h-[460px] lg:border-b-0 lg:px-3',
                dragOver === day.date && 'bg-blue/8',
                isToday && 'bg-surface/70',
              )}
            >
              <div className="mb-3 flex items-baseline gap-2.5 lg:flex-col lg:gap-0">
                <span className={cn('display text-[30px] leading-none tabular', isToday ? 'text-accent' : past && 'text-ink-3')}>
                  <span className={cn(isToday && 'pen-underline')}>{dayOfMonth(day.date)}</span>
                </span>
                <span className={cn('text-[14px] lg:mt-1.5', isToday ? 'font-semibold text-ink' : past ? 'text-ink-3' : 'text-ink-2')}>
                  {formatWeekday(day.date)}
                  {isToday ? ' · היום' : ''}
                </span>
              </div>
              <ul className="flex flex-1 flex-col gap-2">
                {day.deadlines.map((t) => (
                  <Deadline key={`d${t.id}`} task={t} />
                ))}
                {planned.map((t) => (
                  <Planned key={`p${t.id}`} task={t} />
                ))}
                {day.lectures.map((i) => (
                  <LectureBlock key={`${i.moduleId}-${i.part}`} item={i} />
                ))}
                {empty ? <li className="text-[13px] text-ink-3 lg:pt-1">{past ? '—' : 'פנוי'}</li> : null}
              </ul>
              {load ? <p className="mt-3 text-[12.5px] text-ink-3">הרצאות: {formatMinutes(load)}</p> : null}
            </li>
          );
        })}
      </ol>

      <section
        aria-labelledby="unscheduled"
        {...dropProps(null)}
        className={cn('rise mt-10 border-t border-rule pt-4 transition-colors', dragOver === 'tray' && 'bg-blue/8')}
        style={{ '--i': 2 } as CSSProperties}
      >
        <h2 id="unscheduled" className="display text-[19px]">
          לא משובץ
        </h2>
        <p className="mb-3 text-[13.5px] text-ink-2">גוררים משימה ליום שבו תעבדו עליה. בטלפון: פותחים את המשימה ובוחרים "מתי לעבוד על זה".</p>
        {w.unscheduled.length ? (
          <ul className="flex flex-wrap gap-2">
            {w.unscheduled.map((t) => (
              <Planned key={t.id} task={t} wide />
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-3">הכול משובץ.</p>
        )}
      </section>
    </div>
  );
}

function dragProps(task: Task) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData('text/task-id', String(task.id));
      e.dataTransfer.effectAllowed = 'move';
    },
  };
}

function Deadline({ task }: { task: Task }) {
  const open = useOpenTask();
  const finished = task.status === 'done' || task.status === 'submitted';
  return (
    <li>
      <button
        type="button"
        onClick={() => open(task.id)}
        {...dragProps(task)}
        className={cn(
          'block w-full border-s-2 py-1 ps-2.5 text-start transition-colors hover:bg-sunken/70',
          finished ? 'border-green' : 'border-accent',
        )}
      >
        <span className={cn('block text-[12.5px] font-medium tabular', finished ? 'text-green' : 'text-accent')}>
          {finished ? 'הוגש' : 'הגשה'} · {task.dueAt ? formatTime(task.dueAt) : ''}
        </span>
        <span className={cn('block text-[14px] leading-snug', finished && 'text-ink-3 line-through')}>{task.title}</span>
        {task.course ? <span className="block truncate text-[12.5px] text-ink-2">{task.course.name}</span> : null}
      </button>
    </li>
  );
}

function Planned({ task, wide }: { task: Task; wide?: boolean }) {
  const open = useOpenTask();
  return (
    <li>
      <button
        type="button"
        onClick={() => open(task.id)}
        {...dragProps(task)}
        className={cn(
          'flex w-full cursor-grab items-start gap-2 rounded-md border border-rule-strong bg-surface px-2.5 py-1.5 text-start hover:border-ink-3 active:cursor-grabbing',
          wide && 'w-auto max-w-xs',
        )}
      >
        {task.course ? <CourseMark color={task.course.color} className="mt-1" /> : null}
        <span className="min-w-0">
          <span className="block text-[14px] leading-snug">{task.title}</span>
          {task.course ? <span className="block truncate text-[12.5px] text-ink-2">{task.course.name}</span> : null}
        </span>
      </button>
    </li>
  );
}

function LectureBlock({ item }: { item: PlanItem }) {
  return (
    <li>
      <Link to={`/lectures?course=${item.courseId}`} className="flex items-start gap-2 rounded-md px-1 py-1 text-start hover:bg-sunken/70">
        <CourseMark color={item.course?.color ?? 'var(--c-ink-3)'} className="mt-1 opacity-60" />
        <span className="min-w-0">
          <span className="block text-[13.5px] leading-snug text-ink-2">{item.title}</span>
          <span className="block text-[12.5px] text-ink-3 tabular">
            {formatMinutes(item.minutes)}
            {item.parts > 1 ? ` · חלק ${item.part}/${item.parts}` : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}
