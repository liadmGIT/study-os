import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { randomToken } from './crypto';

export interface NotifyPrefs {
  deadline: boolean;
  notStarted: boolean;
  dueChanged: boolean;
  newTask: boolean;
  announcement: boolean;
  recording: boolean;
  files: boolean;
  grade: boolean;
  lectureLag: boolean;
}

export interface AppSettings {
  dailyStudyMin: number; // daily time budget for lecture catch-up
  defaultLectureMin: number; // assumed length when a recording has no duration
  notStartedDays: number; // warn when a task is not started this many days before due
  lagThreshold: number; // warn when this many lectures are behind in a course
  quietHoursStart: number; // no pushes from this hour...
  quietHoursEnd: number; // ...until this hour
  downloadFiles: boolean;
  downloadVideos: boolean;
  maxFileMb: number;
  icsIncludePlan: boolean;
  notify: NotifyPrefs;
}

export const defaultSettings: AppSettings = {
  dailyStudyMin: 90,
  defaultLectureMin: 90,
  notStartedDays: 3,
  lagThreshold: 3,
  quietHoursStart: 23,
  quietHoursEnd: 7,
  downloadFiles: true,
  downloadVideos: false,
  maxFileMb: 50,
  icsIncludePlan: true,
  notify: {
    deadline: true,
    notStarted: true,
    dueChanged: true,
    newTask: true,
    announcement: true,
    recording: true,
    files: false,
    grade: true,
    lectureLag: true,
  },
};

export function getKV<T>(key: string): T | undefined {
  const row = db().select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value as T | undefined;
}

export function setKV(key: string, value: unknown) {
  db()
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export function getSettings(): AppSettings {
  const stored = getKV<Partial<AppSettings>>('app') ?? {};
  return { ...defaultSettings, ...stored, notify: { ...defaultSettings.notify, ...(stored.notify ?? {}) } };
}

export type SettingsPatch = Partial<Omit<AppSettings, 'notify'>> & { notify?: Partial<NotifyPrefs> };

export function updateSettings(patch: SettingsPatch): AppSettings {
  const current = getSettings();
  const next: AppSettings = { ...current, ...patch, notify: { ...current.notify, ...(patch.notify ?? {}) } };
  setKV('app', next);
  return next;
}

export function getIcsSecret(): string {
  let secret = getKV<string>('ics_secret');
  if (!secret) {
    secret = randomToken(18);
    setKV('ics_secret', secret);
  }
  return secret;
}

export function rotateIcsSecret(): string {
  const secret = randomToken(18);
  setKV('ics_secret', secret);
  return secret;
}
