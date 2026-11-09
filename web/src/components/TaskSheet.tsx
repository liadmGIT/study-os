import { Check, ExternalLink, EyeOff, Plus, Split, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { del, patch, post } from '../lib/api';
import { dayKeyOf, formatDateTime, formatFullDate, formatMinutes, formatRelative, formatTime, fromLocalInput, todayKey, toLocalInput } from '../lib/format';
import { BUCKETS, PRIORITY, SOURCE, STATUS } from '../lib/labels';
import { useAction, useCourses, useTask } from '../lib/queries';
import type { Task, TaskStatus } from '../lib/types';
import { Button, buttonClass, cn, CourseTag, Field, Input, PageLoader, Progress, Segmented, Select, Sheet, Tag, Textarea } from './ui';

export function TaskSheet({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  const q = useTask(taskId);
  const task = q.data;
  return (
    <Sheet
      open={taskId !== null}
      onClose={onClose}
      label={task?.title ?? 'משימה'}
      title={task ? <TitleEditor task={task} /> : 'משימה'}
      footer={task ? <Footer task={task} onClose={onClose} /> : null}
    >
      {q.isLoading ? <PageLoader /> : task ? <TaskBody key={task.id} task={task} /> : <p className="text-ink-2">המשימה לא נמצאה.</p>}
    </Sheet>
  );
}

function TitleEditor({ task }: { task: Task }) {
  const [title, setTitle] = useState(task.title);
  const save = useAction((t: string) => patch(`/api/tasks/${task.id}`, { title: t }));
  useEffect(() => {
    setTitle(task.title);
  }, [task.title]);
  if (task.source !== 'personal') return <span>{task.title}</span>;
  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={() => title.trim() && title !== task.title && save.run(title.trim())}
      className="display -mx-1 w-full rounded-md bg-transparent px-1 text-[21px] hover:bg-sunken/60 focus:bg-sunken focus:outline-none"
      aria-label="שם המשימה"
    />
  );
}

function Footer({ task, onClose }: { task: Task; onClose: () => void }) {
  const remove = useAction(() => del(`/api/tasks/${task.id}`), { success: task.source === 'personal' ? 'המשימה נמחקה' : 'המשימה הוסתרה', onDone: onClose });
  const unhide = useAction(() => patch(`/api/tasks/${task.id}`, { hidden: false }), { success: 'המשימה מוצגת שוב' });
  return (
    <div className="flex items-center gap-2">
      {task.url ? (
        <a href={task.url} target="_blank" rel="noreferrer" className={buttonClass('primary')}>
          <ExternalLink className="size-4" aria-hidden />
          פתח ב-Moodle
        </a>
      ) : null}
      <div className="flex-1" />
      {task.hidden ? (
        <Button variant="ghost" onClick={() => unhide.run()}>
          הצג שוב
        </Button>
      ) : (
        <Button variant="danger" onClick={() => remove.run()} loading={remove.pending}>
          {task.source === 'personal' ? <Trash2 className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
          {task.source === 'personal' ? 'מחיקה' : 'הסתר מהרשימה'}
        </Button>
      )}
    </div>
  );
}

function TaskBody({ task }: { task: Task }) {
  const courses = useCourses();
  const update = useAction((body: Record<string, unknown>) => patch(`/api/tasks/${task.id}`, body));
  const b = BUCKETS[task.urgency.bucket];
  const personal = task.source === 'personal';
  const [estimate, setEstimate] = useState(task.estimateMin ? String(task.estimateMin / 60) : '');
  useEffect(() => {
    setEstimate(task.estimateMin ? String(task.estimateMin / 60) : '');
  }, [task.estimateMin]);
  const today = todayKey();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {task.course ? <CourseTag name={task.course.name} color={task.course.color} /> : null}
        <span className="text-[13px] text-ink-3">{SOURCE[task.source]}</span>
        <Tag tone={b.tone}>{b.label}</Tag>
        {task.notStarted ? <Tag tone="accent">עוד לא התחלת</Tag> : null}
        {task.grade ? <Tag tone="green">ציון {task.grade}</Tag> : null}
      </div>

      {/* The due date, set large: it's the one fact that matters most. */}
      <div className="border-y border-rule py-4">
        {personal ? (
          <Field label="תאריך הגשה">
            <Input type="datetime-local" defaultValue={toLocalInput(task.dueAt)} onBlur={(e) => update.run({ dueAt: fromLocalInput(e.target.value) })} />
          </Field>
        ) : task.dueAt ? (
          <div>
            <p className="eyebrow">להגשה עד</p>
            <p className={cn('display mt-1 text-[26px]', (b.tone === 'accent') && 'text-accent')}>
              {formatFullDate(dayKeyOf(task.dueAt))}, <span className="tabular">{formatTime(task.dueAt)}</span>
            </p>
            <p className="mt-0.5 text-[14px] text-ink-2">{formatRelative(task.dueAt)}</p>
          </div>
        ) : (
          <p className="text-ink-2">אין תאריך הגשה ב-Moodle.</p>
        )}
        <div className="mt-3 space-y-1 text-[13.5px] text-ink-2 empty:hidden">
          {task.prevDueAt && task.dueChangedAt ? (
            <div className="text-amber">
              התאריך השתנה {formatRelative(task.dueChangedAt)}. קודם היה {formatDateTime(task.prevDueAt)}.
            </div>
          ) : null}
          {task.cutoffAt && task.cutoffAt !== task.dueAt ? <div>הגשה מאוחרת אפשרית עד {formatDateTime(task.cutoffAt)}.</div> : null}
          {task.moodleStatus ? <div>במודל: {moodleStatusLabel(task.moodleStatus)}</div> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-ink-2">מצב</p>
        <Segmented<TaskStatus>
          label="מצב המשימה"
          value={task.status}
          onChange={(status) => update.run({ status })}
          options={(['todo', 'in_progress', 'submitted', 'done'] as TaskStatus[]).map((s) => ({ value: s, label: STATUS[s] }))}
        />
      </div>

      <Subtasks task={task} />

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <p className="text-[13px] font-medium text-ink-2">עדיפות</p>
          <Segmented
            label="עדיפות"
            size="sm"
            value={String(task.priority)}
            onChange={(p) => update.run({ priority: Number(p) })}
            options={PRIORITY.map((label, i) => ({ value: String(i), label }))}
          />
        </div>
        <Field label="כמה שעות זה ייקח" hint={task.urgency.remainingMin ? `נשארו בערך ${formatMinutes(task.urgency.remainingMin)}` : undefined}>
          <Input
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            value={estimate}
            placeholder="3"
            onChange={(e) => setEstimate(e.target.value)}
            onBlur={() => update.run({ estimateMin: estimate ? Math.round(Number(estimate) * 60) : null })}
          />
        </Field>
        <Field label="מתי לעבוד על זה">
          <Input type="date" value={task.plannedDate ?? ''} onChange={(e) => update.run({ plannedDate: e.target.value || null })} />
        </Field>
        {task.plannedDate !== today ? (
          <div className="col-span-2 -mt-2">
            <Button size="sm" variant="ghost" onClick={() => update.run({ plannedDate: today })}>
              לעבוד על זה היום
            </Button>
          </div>
        ) : null}
        {personal ? (
          <Field label="קורס" className="col-span-2">
            <Select value={task.courseId ?? ''} onChange={(e) => update.run({ courseId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">ללא קורס</option>
              {courses.data
                ?.filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {personal ? (
        <Field label="הערות">
          <Textarea defaultValue={task.description ?? ''} onBlur={(e) => e.target.value !== (task.description ?? '') && update.run({ description: e.target.value || null })} />
        </Field>
      ) : task.description ? (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">תיאור מ-Moodle</p>
          <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{task.description}</p>
        </div>
      ) : null}
    </div>
  );
}

function moodleStatusLabel(s: string) {
  return ({ new: 'עוד לא הוגש', draft: 'טיוטה', submitted: 'הוגש', reopened: 'נפתח מחדש', finished: 'הושלם', inprogress: 'בניסיון' } as Record<string, string>)[s] ?? s;
}

function Subtasks({ task }: { task: Task }) {
  const id = useId();
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('5');
  const [showSplit, setShowSplit] = useState(false);
  const add = useAction((t: string) => post(`/api/tasks/${task.id}/subtasks`, { title: t }), { onDone: () => setTitle('') });
  const split = useAction((n: number) => post(`/api/tasks/${task.id}/split`, { count: n }), { onDone: () => setShowSplit(false) });
  const toggle = useAction((sid: number, done: boolean) => patch(`/api/subtasks/${sid}`, { done }));
  const remove = useAction((sid: number) => del(`/api/subtasks/${sid}`));
  const done = task.subtasks.filter((s) => s.done).length;

  return (
    <div role="group" aria-labelledby={`${id}-h`}>
      <div className="mb-2 flex items-center gap-2">
        <p id={`${id}-h`} className="text-[13px] font-medium text-ink-2">
          תתי־משימות
        </p>
        {task.subtasks.length ? <span className="text-[13px] text-ink-3 tabular">{done}/{task.subtasks.length}</span> : null}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setShowSplit((x) => !x)} aria-expanded={showSplit}>
          <Split className="size-3.5" aria-hidden />
          פצל לשאלות
        </Button>
      </div>
      {task.subtasks.length ? <Progress value={done / task.subtasks.length} color="var(--c-green)" label="התקדמות בתתי־המשימות" className="mb-2" /> : null}

      {showSplit ? (
        <form
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-sunken p-3 text-[14.5px]"
          onSubmit={(e) => {
            e.preventDefault();
            split.run(Number(count));
          }}
        >
          <label htmlFor={`${id}-n`}>פצל ל-</label>
          <Input id={`${id}-n`} type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} className="h-9 w-20 text-center md:h-9" />
          <span>שאלות</span>
          <div className="flex-1" />
          <Button size="sm" variant="primary" loading={split.pending}>
            צור
          </Button>
        </form>
      ) : null}

      <ul>
        {task.subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-1 border-b border-rule last:border-b-0">
            <button
              type="button"
              role="checkbox"
              aria-checked={s.done}
              onClick={() => toggle.run(s.id, !s.done)}
              className="flex min-h-11 flex-1 items-center gap-3 text-start"
            >
              <span
                className={cn(
                  'flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
                  s.done ? 'border-green bg-green text-paper' : 'border-ink-3',
                )}
              >
                {s.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
              </span>
              <span className={cn('text-[14.5px]', s.done && 'text-ink-3 line-through')}>{s.title}</span>
            </button>
            <button
              type="button"
              onClick={() => remove.run(s.id)}
              aria-label={`מחק את "${s.title}"`}
              className="flex size-11 items-center justify-center rounded-md text-ink-3 hover:text-accent md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.run(title.trim());
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="הוסף תת־משימה…" aria-label="תת־משימה חדשה" />
        <Button disabled={!title.trim()} loading={add.pending} aria-label="הוסף תת־משימה">
          <Plus className="size-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
