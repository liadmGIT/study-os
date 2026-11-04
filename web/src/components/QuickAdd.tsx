import { Plus } from 'lucide-react';
import { useState } from 'react';
import { post } from '../lib/api';
import { fromLocalInput } from '../lib/format';
import { useAction, useCourses } from '../lib/queries';
import { Button, Input, Select } from './ui';

/** One-line "add a personal task": title, course, due date. */
export function QuickAdd({ onDone, defaultCourseId }: { onDone?: () => void; defaultCourseId?: number }) {
  const courses = useCourses();
  const [title, setTitle] = useState('');
  const [courseId, setCourseId] = useState<string>(defaultCourseId ? String(defaultCourseId) : '');
  const [due, setDue] = useState('');
  const add = useAction(
    () =>
      post('/api/tasks', {
        title: title.trim(),
        courseId: courseId ? Number(courseId) : null,
        dueAt: due ? fromLocalInput(due.includes('T') ? due : `${due}T23:59`) : null,
      }),
    {
      success: 'המשימה נוספה',
      onDone: () => {
        setTitle('');
        setDue('');
        onDone?.();
      },
    },
  );
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) add.run();
      }}
    >
      <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="מה צריך לעשות? למשל: לחזור על הרצאה 4" className="sm:flex-1" />
      <div className="flex gap-2">
        <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="sm:w-44" aria-label="קורס">
          <option value="">ללא קורס</option>
          {courses.data
            ?.filter((c) => c.active)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
              </option>
            ))}
        </Select>
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="sm:w-48" aria-label="תאריך הגשה" />
        <Button variant="primary" disabled={!title.trim()} loading={add.pending} aria-label="הוסף">
          <Plus className="size-4" />
          <span className="max-sm:hidden">הוסף</span>
        </Button>
      </div>
    </form>
  );
}
