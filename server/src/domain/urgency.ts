import type { TaskStatus } from '../db/schema';
import { DAY, HOUR } from '../lib/time';

export type UrgencyBucket = 'overdue' | 'urgent' | 'week' | 'later' | 'nodate' | 'done' | 'expired';

export interface UrgencyInput {
  dueAt: number | null;
  cutoffAt?: number | null;
  status: TaskStatus;
  priority: number; // 0-3
  estimateMin: number | null;
  subtasksTotal: number;
  subtasksDone: number;
}

export interface Urgency {
  score: number; // 0-100+, higher = do it sooner
  bucket: UrgencyBucket;
  hoursLeft: number | null;
  remainingMin: number;
  progress: number; // 0-1
}

export const DEFAULT_ESTIMATE_MIN = 180;

export function taskProgress(t: Pick<UrgencyInput, 'status' | 'subtasksTotal' | 'subtasksDone'>): number {
  if (t.status === 'done' || t.status === 'submitted') return 1;
  if (t.subtasksTotal > 0) return t.subtasksDone / t.subtasksTotal;
  return t.status === 'in_progress' ? 0.25 : 0;
}

export function computeUrgency(t: UrgencyInput, now: number): Urgency {
  const progress = taskProgress(t);
  const remainingMin = Math.round((t.estimateMin ?? DEFAULT_ESTIMATE_MIN) * (1 - progress));
  const hoursLeft = t.dueAt ? (t.dueAt - now) / HOUR : null;

  if (t.status === 'done' || t.status === 'submitted') return { score: 0, bucket: 'done', hoursLeft, remainingMin: 0, progress };
  if (hoursLeft === null) return { score: 10 + t.priority * 10, bucket: 'nodate', hoursLeft, remainingMin, progress };

  if (hoursLeft < 0) {
    const longOverdue = -hoursLeft > (7 * DAY) / HOUR;
    const cutoffOpen = t.cutoffAt ? t.cutoffAt > now : false;
    if (longOverdue && !cutoffOpen) return { score: 5, bucket: 'expired', hoursLeft, remainingMin, progress };
    return { score: 100 + t.priority * 5, bucket: 'overdue', hoursLeft, remainingMin, progress };
  }

  // How much of the remaining time the remaining work would eat (assuming ~1/4 of the clock is study time).
  const pressure = remainingMin / 60 / Math.max(hoursLeft * 0.25, 1);
  const timeScore = 100 * Math.exp(-hoursLeft / 72);
  const score = Math.min(99, Math.round(timeScore * 0.7 + Math.min(pressure, 1) * 20 + t.priority * 5 + (t.status === 'todo' ? 5 : 0)));

  let bucket: UrgencyBucket = 'later';
  if (hoursLeft <= 48 || pressure >= 0.8 || (t.priority >= 3 && hoursLeft <= 96)) bucket = 'urgent';
  else if (hoursLeft <= (7 * DAY) / HOUR) bucket = 'week';

  return { score, bucket, hoursLeft, remainingMin, progress };
}

export const BUCKET_ORDER: UrgencyBucket[] = ['overdue', 'urgent', 'week', 'later', 'nodate', 'done', 'expired'];
