import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { post } from '../lib/api';
import { fromLocalInput, todayKey } from '../lib/format';
import { useAction, useCourses } from '../lib/queries';
import { Button, cn, Field, Input, Select } from './ui';

/**
 * Add a personal task: what, which course, when it's due, and optionally "work on it today".
 * `stacked` lays the fields out vertically (inside the dialog); otherwise one row.
 */
export function QuickAdd({ onDone, defaultCourseId, stacked }: { onDone?: () => void; defaultCourseId?: number; stacked?: boolean }) {
  const courses = useCourses();
  const id = useId();
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState<string>(defaultCourseId ? String(defaultCourseId) : '');
  const [due, setDue] = useState('');
  const [today, setToday] = useState(false);
  const add = useAction(
    () =>
      post('/api/tasks', {
        title: title.trim(),
        courseId: courseId ? Number(courseId) : null,
        dueAt: due ? fromLocalInput(due.includes('T') ? due : `${due}T23:59`) : null,
        plannedDate: today ? todayKey() : null,
      }),
    {
      success: 'המשימה נוספה',
      onDone: () => {
        setTitle('');
        setDue('');
        setToday(false);
        onDone?.();
      },
    },
  );
  const active = courses.data?.filter((c) => c.active) ?? [];

  const courseSelect = (
    <Select id={`${id}-course`} value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label={stacked ? undefined : 'קורס'}>
      <option value="">ללא קורס</option>
      {active.map((c) => (
        <option key={c.id} value={c.id}>
          {c.fullName}
        </option>
      ))}
    </Select>
  );
  const dueInput = (
    <Input id={`${id}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label={stacked ? undefined : 'תאריך הגשה'} />
  );

  return (
    <form
      className={cn(stacked ? 'space-y-4' : 'flex flex-col gap-2 sm:flex-row sm:items-center')}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) add.run();
      }}
    >
      {stacked ? (
        <>
          <Field label="מה צריך לעשות?">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: לחזור על הרצאה 4" />
          </Field>
          <Field label="קורס">{courseSelect}</Field>
          <Field label="תאריך הגשה (לא חובה)">{dueInput}</Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14.5px]">
            <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} className="size-5 accent-[var(--c-ink)]" />
            לעבוד על זה היום
          </label>
          <Button variant="primary" className="w-full" disabled={!title.trim()} loading={add.pending}>
            הוספה
          </Button>
        </>
      ) : (
        <>
          <div className="relative sm:flex-1">
            <Plus className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="משימה חדשה…"
              aria-label="משימה חדשה"
              className="ps-9"
            />
          </div>
          {title ? (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">{courseSelect}</div>
              <div className="min-w-0 flex-1 sm:w-52 sm:flex-none">{dueInput}</div>
              <Button variant="primary" disabled={!title.trim()} loading={add.pending}>
                הוספה
              </Button>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
