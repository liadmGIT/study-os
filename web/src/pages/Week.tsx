import { clsx } from 'clsx';
import { CalendarPlus, ChevronLeft, ChevronRight, CirclePlay, Flag, GripVertical } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useOpenTask } from '../components/Layout';
import { Button, Card, PageHeader, PageLoader } from '../components/ui';
import { patch } from '../lib/api';
import { formatDayKey, formatMinutes, formatTime, formatWeekday, formatWeekdayShort } from '../lib/format';
import { BUCKETS } from '../lib/labels';
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
  const go = (s: string) => {
    params.set('start', s);
    setParams(params, { replace: true });
  };
  const onDrop = (date: string | null) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/task-id'));
    if (id) plan.run(id, date);
  };
  const dropProps = (date: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('text/task-id')) {
        e.preventDefault();
        setDragOver(date ?? 'tray');
      }
    },
    onDragLeave: () => setDragOver(null),
    onDrop: onDrop(date),
  });

  return (
    <div>
      <PageHeader
        title="השבוע"
        subtitle={`${formatDayKey(w.days[0].date)} – ${formatDayKey(w.days[6].date)}`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => go(w.prev)} aria-label="שבוע קודם">
              <ChevronRight className="size-4" />
              קודם
            </Button>
            {!w.days.some((d) => d.date === w.today) ? (
              <Button size="sm" onClick={() => (params.delete('start'), setParams(params, { replace: true }))}>
                היום
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => go(w.next)} aria-label="שבוע הבא">
              הבא
              <ChevronLeft className="size-4" />
            </Button>
            <Link to="/settings#calendar" className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface px-2.5 text-[13px] font-medium">
              <CalendarPlus className="size-4" />
              <span className="max-sm:hidden">חבר ל-Google Calendar</span>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-7">
        {w.days.map((day) => {
          const isToday = day.date === w.today;
          const past = day.date < w.today;
          const planned = day.planned.filter((t) => !day.deadlines.some((d) => d.id === t.id));
          const load = day.lectures.reduce((s, i) => s + i.minutes, 0);
          return (
            <div
              key={day.date}
              {...dropProps(day.date)}
              className={clsx(
                'flex min-h-28 flex-col rounded-2xl border bg-surface p-2 transition-colors lg:min-h-[420px]',
                isToday ? 'border-brand' : 'border-line',
                dragOver === day.date && 'bg-brand-soft',
                past && 'opacity-70',
              )}
            >
              <div className="mb-2 flex items-baseline gap-2 px-1.5 pt-1">
                <span className={clsx('text-sm font-semibold', isToday && 'text-brand')}>
                  <span className="lg:hidden">{formatWeekday(day.date)}</span>
                  <span className="hidden lg:inline">{formatWeekdayShort(day.date)}</span>
                </span>
                <span className="text-xs text-muted tabular">{formatDayKey(day.date)}</span>
                {isToday ? <span className="rounded-md bg-brand px-1.5 text-[10px] font-semibold text-canvas">היום</span> : null}
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {day.deadlines.map((t) => (
                  <DeadlineChip key={`d${t.id}`} task={t} />
                ))}
                {planned.map((t) => (
                  <PlannedChip key={`p${t.id}`} task={t} />
                ))}
                {day.lectures.map((i) => (
                  <LectureBlock key={`${i.moduleId}-${i.part}`} item={i} />
                ))}
                {!day.deadlines.length && !planned.length && !day.lectures.length ? (
                  <div className="hidden flex-1 items-center justify-center text-xs text-faint lg:flex">גרור לכאן</div>
                ) : null}
              </div>
              {load ? <div className="mt-2 px-1.5 text-[11px] text-faint">הרצאות: {formatMinutes(load)}</div> : null}
            </div>
          );
        })}
      </div>

      <Card className={clsx('mt-5 p-3 transition-colors', dragOver === 'tray' && 'bg-brand-soft')} {...dropProps(null)}>
        <div className="mb-2 px-1 text-sm font-semibold">
          לא משובץ <span className="font-normal text-muted">· גרור משימה ליום שבו תעבוד עליה (בטלפון: פתח את המשימה ובחר יום)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {w.unscheduled.length ? (
            w.unscheduled.map((t) => <PlannedChip key={t.id} task={t} wide />)
          ) : (
            <span className="px-1 text-sm text-muted">הכול משובץ.</span>
          )}
        </div>
      </Card>
    </div>
  );
}

function DeadlineChip({ task }: { task: Task }) {
  const open = useOpenTask();
  const finished = task.status === 'done' || task.status === 'submitted';
  return (
    <button
      onClick={() => open(task.id)}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/task-id', String(task.id))}
      className={clsx('rounded-xl border px-2.5 py-2 text-start text-[13px] transition-colors hover:bg-sunken', finished ? 'border-line text-muted' : 'border-transparent')}
      style={finished ? undefined : { background: `color-mix(in srgb, ${BUCKETS[task.urgency.bucket].color} 10%, transparent)` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: finished ? undefined : BUCKETS[task.urgency.bucket].color }}>
        <Flag className="size-3" />
        {finished ? 'הוגש' : 'הגשה'} {task.dueAt ? formatTime(task.dueAt) : ''}
      </div>
      <div className={clsx('mt-0.5 leading-snug font-medium', finished && 'line-through')}>{task.title}</div>
      {task.course ? (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
          <span className="size-1.5 rounded-full" style={{ background: task.course.color }} />
          <span className="truncate">{task.course.name}</span>
        </div>
      ) : null}
    </button>
  );
}

function PlannedChip({ task, wide }: { task: Task; wide?: boolean }) {
  const open = useOpenTask();
  return (
    <button
      onClick={() => open(task.id)}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/task-id', String(task.id))}
      className={clsx('flex cursor-grab items-start gap-1.5 rounded-xl border border-line bg-surface px-2 py-1.5 text-start text-[13px] hover:bg-sunken active:cursor-grabbing', wide && 'max-w-xs')}
    >
      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-faint" />
      <span className="min-w-0">
        <span className="block leading-snug">{task.title}</span>
        {task.course ? (
          <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
            <span className="size-1.5 rounded-full" style={{ background: task.course.color }} />
            <span className="truncate">{task.course.name}</span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

function LectureBlock({ item }: { item: PlanItem }) {
  return (
    <Link to={`/lectures?course=${item.courseId}`} className="flex items-start gap-1.5 rounded-xl bg-sunken px-2 py-1.5 text-[13px] hover:opacity-80">
      <CirclePlay className="mt-0.5 size-3.5 shrink-0" style={{ color: item.course?.color }} />
      <span className="min-w-0">
        <span className="block leading-snug">{item.title}</span>
        <span className="text-[11px] text-muted tabular">
          {formatMinutes(item.minutes)}
          {item.parts > 1 ? ` · חלק ${item.part}/${item.parts}` : ''}
        </span>
      </span>
    </Link>
  );
}
