import type { Task } from '../db/schema';
import { DAY } from '../lib/time';
import { DEFAULT_ESTIMATE_MIN } from './urgency';

/** Roughly how much focused study time fits in a day, for estimating how early to start. */
const STUDY_MIN_PER_DAY = 180;

/**
 * "You haven't started this yet and the deadline is close":
 * still todo, no subtask done, nothing submitted/drafted in Moodle, and fewer days left than
 * max(notStartedDays, 2 × the days the estimate needs).
 */
export function isNotStarted(
  task: Pick<Task, 'status' | 'moodleStatus' | 'dueAt' | 'estimateMin' | 'hidden' | 'removedAt'>,
  subtasksDone: number,
  now: number,
  notStartedDays: number,
): boolean {
  if (task.hidden || task.removedAt) return false;
  if (task.status !== 'todo' || subtasksDone > 0) return false;
  if (task.moodleStatus && ['submitted', 'finished', 'draft', 'inprogress'].includes(task.moodleStatus)) return false;
  if (!task.dueAt || task.dueAt <= now) return false;
  const daysLeft = (task.dueAt - now) / DAY;
  const daysNeeded = (task.estimateMin ?? DEFAULT_ESTIMATE_MIN) / STUDY_MIN_PER_DAY;
  return daysLeft <= Math.max(notStartedDays, 2 * daysNeeded);
}
