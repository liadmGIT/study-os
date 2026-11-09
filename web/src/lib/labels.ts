import type { Tone } from '../components/ui';
import type { Bucket, ChangeType, ModuleKind, TaskSource, TaskStatus } from './types';

// Red pen is reserved for what needs attention now; everything else stays in ink.
export const BUCKETS: Record<Bucket, { label: string; tone: Tone; color: string }> = {
  overdue: { label: 'באיחור', tone: 'accent', color: 'var(--c-accent)' },
  urgent: { label: 'דחוף', tone: 'accent', color: 'var(--c-accent)' },
  week: { label: 'השבוע', tone: 'amber', color: 'var(--c-amber)' },
  later: { label: 'בהמשך', tone: 'neutral', color: 'var(--c-ink-3)' },
  nodate: { label: 'ללא תאריך', tone: 'neutral', color: 'var(--c-rule-strong)' },
  done: { label: 'הוגש / בוצע', tone: 'green', color: 'var(--c-green)' },
  expired: { label: 'עבר המועד', tone: 'neutral', color: 'var(--c-rule-strong)' },
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
  course_new: { label: 'קורס חדש', tone: 'blue' },
  task_new: { label: 'מטלה חדשה', tone: 'amber' },
  due_changed: { label: 'תאריך הגשה השתנה', tone: 'accent' },
  submitted: { label: 'הוגש', tone: 'green' },
  grade_new: { label: 'ציון חדש', tone: 'green' },
  recording_new: { label: 'הקלטה חדשה', tone: 'blue' },
  file_new: { label: 'חומר חדש', tone: 'neutral' },
  file_updated: { label: 'קובץ עודכן', tone: 'neutral' },
  module_new: { label: 'פריט חדש', tone: 'neutral' },
  announcement_new: { label: 'הודעה', tone: 'amber' },
};

export const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--c-ink-2)',
  accent: 'var(--c-accent)',
  green: 'var(--c-green)',
  amber: 'var(--c-amber)',
  blue: 'var(--c-blue)',
};
