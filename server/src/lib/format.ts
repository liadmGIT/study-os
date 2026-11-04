import { TZ } from './time';

const dateTimeFmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDateTime = (sec: number | null | undefined) => (sec ? dateTimeFmt.format(new Date(sec * 1000)) : 'ללא תאריך');

export function formatTimeLeft(sec: number): string {
  if (sec <= 0) return 'עבר המועד';
  const hours = sec / 3600;
  if (hours < 1) return `${Math.max(1, Math.round(sec / 60))} דקות`;
  if (hours < 48) return `${Math.round(hours)} שעות`;
  return `${Math.round(hours / 24)} ימים`;
}
