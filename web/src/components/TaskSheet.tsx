import { clsx } from 'clsx';
import { Check, ExternalLink, EyeOff, Plus, Split, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { del, patch, post } from '../lib/api';
import { formatDateTime, formatMinutes, formatRelative, fromLocalInput, toLocalInput } from '../lib/format';
import { BUCKETS, PRIORITY, SOURCE, STATUS } from '../lib/labels';
import { useAction, useCourses, useTask } from '../lib/queries';
import type { Task, TaskStatus } from '../lib/types';
import { Badge, Button, CourseTag, Field, Input, PageLoader, Progress, Segmented, Select, Sheet, Textarea } from './ui';

export function TaskSheet({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  const q = useTask(taskId);
  const task = q.data;
  return (
    <Sheet
      open={taskId !== null}
      onClose={onClose}
      title={task ? <TitleEditor task={task} /> : 'משימה'}
      footer={task ? <Footer task={task} onClose={onClose} /> : null}
    >
      {q.isLoading ? <PageLoader /> : task ? <TaskBody key={task.id} task={task} /> : <p className="text-sm text-muted">המשימה לא נמצאה.</p>}
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
      className="w-full rounded-lg bg-transparent px-1 -mx-1 focus:bg-sunken focus:outline-none"
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
        <a href={task.url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-medium text-canvas">
          <ExternalLink className="size-4" />
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
          {task.source === 'personal' ? <Trash2 className="size-4" /> : <EyeOff className="size-4" />}
          {task.source === 'personal' ? 'מחיקה' : 'הסתר'}
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {task.course ? <CourseTag name={task.course.name} color={task.course.color} /> : null}
        <Badge>{SOURCE[task.source]}</Badge>
        <Badge tone={b.tone}>{b.label}</Badge>
        {task.notStarted ? <Badge tone="red">עוד לא התחלת</Badge> : null}
        {task.grade ? <Badge tone="green">ציון: {task.grade}</Badge> : null}
      </div>

      <div className="rounded-2xl bg-sunken p-3.5">
        {personal ? (
          <Field label="תאריך הגשה">
            <Input type="datetime-local" defaultValue={toLocalInput(task.dueAt)} onBlur={(e) => update.run({ dueAt: fromLocalInput(e.target.value) })} />
          </Field>
        ) : task.dueAt ? (
          <div>
            <div className="text-xs text-muted">להגשה עד</div>
            <div className="text-lg font-semibold tabular">{formatDateTime(task.dueAt)}</div>
            <div className="text-sm text-muted">{formatRelative(task.dueAt)}</div>
          </div>
        ) : (
          <div className="text-sm text-muted">אין תאריך הגשה ב-Moodle</div>
        )}
        {task.prevDueAt && task.dueChangedAt ? (
          <div className="mt-2 text-xs text-week">
            התאריך השתנה ({formatRelative(task.dueChangedAt)}). היה: {formatDateTime(task.prevDueAt)}
          </div>
        ) : null}
        {task.cutoffAt && task.cutoffAt !== task.dueAt ? <div className="mt-1 text-xs text-muted">הגשה מאוחרת עד {formatDateTime(task.cutoffAt)}</div> : null}
        {task.moodleStatus ? <div className="mt-1 text-xs text-muted">מצב ב-Moodle: {moodleStatusLabel(task.moodleStatus)}</div> : null}
      </div>

      <Field label="מצב">
        <Segmented<TaskStatus>
          value={task.status}
          onChange={(status) => update.run({ status })}
          options={(['todo', 'in_progress', 'submitted', 'done'] as TaskStatus[]).map((s) => ({ value: s, label: STATUS[s] }))}
        />
      </Field>

      <Subtasks task={task} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="עדיפות" className="col-span-2">
          <Segmented
            value={String(task.priority)}
            onChange={(p) => update.run({ priority: Number(p) })}
            options={PRIORITY.map((label, i) => ({ value: String(i), label }))}
            size="sm"
          />
        </Field>
        <Field label="כמה זמן זה ייקח (שעות)" hint={task.urgency.remainingMin ? `נשארו בערך ${formatMinutes(task.urgency.remainingMin)}` : undefined}>
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
          <div className="mb-1 text-xs font-medium text-muted">תיאור מ-Moodle</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
        </div>
      ) : null}
    </div>
  );
}

function moodleStatusLabel(s: string) {
  return ({ new: 'לא הוגש', draft: 'טיוטה', submitted: 'הוגש', reopened: 'נפתח מחדש', finished: 'הושלם', inprogress: 'בניסיון' } as Record<string, string>)[s] ?? s;
}

function Subtasks({ task }: { task: Task }) {
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('5');
  const [showSplit, setShowSplit] = useState(false);
  const add = useAction((t: string) => post(`/api/tasks/${task.id}/subtasks`, { title: t }), { onDone: () => setTitle('') });
  const split = useAction((n: number) => post(`/api/tasks/${task.id}/split`, { count: n }), { onDone: () => setShowSplit(false) });
  const toggle = useAction((id: number, done: boolean) => patch(`/api/subtasks/${id}`, { done }));
  const remove = useAction((id: number) => del(`/api/subtasks/${id}`));
  const done = task.subtasks.filter((s) => s.done).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-muted">תתי־משימות</span>
        {task.subtasks.length ? <span className="text-xs text-faint tabular">{done}/{task.subtasks.length}</span> : null}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setShowSplit((x) => !x)}>
          <Split className="size-3.5" />
          פצל לשאלות
        </Button>
      </div>
      {task.subtasks.length ? <Progress value={done / task.subtasks.length} className="mb-2" color="var(--color-ok)" /> : null}

      {showSplit ? (
        <form
          className="mb-3 flex items-center gap-2 rounded-xl bg-sunken p-2.5 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            split.run(Number(count));
          }}
        >
          <span>פצל ל-</span>
          <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} className="!h-8 w-16 text-center" />
          <span>שאלות</span>
          <div className="flex-1" />
          <Button size="sm" variant="primary" loading={split.pending}>
            צור
          </Button>
        </form>
      ) : null}

      <ul className="space-y-0.5">
        {task.subtasks.map((s) => (
          <li key={s.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-sunken">
            <button
              onClick={() => toggle.run(s.id, !s.done)}
              aria-label={s.done ? 'בטל סימון' : 'סמן כבוצע'}
              className={clsx(
                'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                s.done ? 'border-ok bg-ok text-white' : 'border-line bg-surface',
              )}
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
            </button>
            <span className={clsx('flex-1 text-sm', s.done && 'text-muted line-through')}>{s.title}</span>
            <button onClick={() => remove.run(s.id)} aria-label="מחק" className="text-faint opacity-0 group-hover:opacity-100 hover:text-overdue max-md:opacity-60">
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.run(title.trim());
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="הוסף תת־משימה…" className="!h-9" />
        <Button size="sm" className="!h-9" disabled={!title.trim()} loading={add.pending} aria-label="הוסף">
          <Plus className="size-4" />
        </Button>
      </form>
    </div>
  );
}
