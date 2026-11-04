import type { Tone } from '../components/ui';
import type { Bucket, ChangeType, ModuleKind, TaskSource, TaskStatus } from './types';

export const BUCKETS: Record<Bucket, { label: string; tone: Tone; color: string }> = {
  overdue: { label: 'באיחור', tone: 'red', color: 'var(--color-overdue)' },
  urgent: { label: 'דחוף', tone: 'orange', color: 'var(--color-urgent)' },
  week: { label: 'השבוע', tone: 'amber', color: 'var(--color-week)' },
  later: { label: 'בהמשך', tone: 'slate', color: 'var(--color-later)' },
  nodate: { label: 'ללא תאריך', tone: 'neutral', color: 'var(--color-faint)' },
  done: { label: 'הוגש / בוצע', tone: 'green', color: 'var(--color-ok)' },
  expired: { label: 'עבר המועד', tone: 'neutral', color: 'var(--color-faint)' },
};

export const STATUS: Record<TaskStatus, string> = {
  todo: 'לא התחלתי',
  in_progress: 'בעבודה',
  submitted: 'הוגש',
  done: 'בוצע',
};

export const SOURCE: Record<TaskSource, string> = {
  assign: 'מטלה',
  quiz: 'בוחן',
  event: 'פעילות',
  personal: 'אישי',
};

export const PRIORITY = ['ללא', 'נמוכה', 'בינונית', 'גבוהה'];

export const KIND: Record<ModuleKind, string> = {
  recording: 'הקלטה',
  slides: 'מצגת',
  file: 'קובץ',
  folder: 'תיקייה',
  assignment: 'מטלה',
  quiz: 'בוחן',
  forum: 'פורום',
  link: 'קישור',
  page: 'דף',
  meeting: 'מפגש חי',
  label: 'תווית',
  other: 'אחר',
};

export const CHANGE: Record<ChangeType, { label: string; tone: Tone }> = {
  course_new: { label: 'קורס חדש', tone: 'brand' },
  task_new: { label: 'מטלה חדשה', tone: 'orange' },
  due_changed: { label: 'תאריך הגשה השתנה', tone: 'red' },
  submitted: { label: 'הוגש', tone: 'green' },
  grade_new: { label: 'ציון חדש', tone: 'green' },
  recording_new: { label: 'הקלטה חדשה', tone: 'brand' },
  file_new: { label: 'חומר חדש', tone: 'slate' },
  file_updated: { label: 'קובץ עודכן', tone: 'slate' },
  module_new: { label: 'פריט חדש', tone: 'slate' },
  announcement_new: { label: 'הודעה', tone: 'amber' },
};
