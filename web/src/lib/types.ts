// Shapes returned by the server API.

export type Bucket = 'overdue' | 'urgent' | 'week' | 'later' | 'nodate' | 'done' | 'expired';
export type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'done';
export type TaskSource = 'assign' | 'quiz' | 'event' | 'personal';
export type LectureStatus = 'unwatched' | 'in_progress' | 'watched';
export type ModuleKind =
  | 'recording'
  | 'slides'
  | 'file'
  | 'folder'
  | 'assignment'
  | 'quiz'
  | 'forum'
  | 'link'
  | 'page'
  | 'meeting'
  | 'label'
  | 'other';

export interface CourseRef {
  id?: number;
  name: string;
  color: string;
}

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: number;
  source: TaskSource;
  moodleId: number | null;
  courseId: number | null;
  title: string;
  description: string | null;
  url: string | null;
  dueAt: number | null;
  cutoffAt: number | null;
  opensAt: number | null;
  status: TaskStatus;
  moodleStatus: string | null;
  grade: string | null;
  priority: number;
  estimateMin: number | null;
  plannedDate: string | null;
  prevDueAt: number | null;
  dueChangedAt: number | null;
  hidden: boolean;
  createdAt: number;
  subtasks: Subtask[];
  course: { id: number; name: string; color: string } | null;
  urgency: { score: number; bucket: Bucket; hoursLeft: number | null; remainingMin: number; progress: number };
  notStarted: boolean;
}

export interface Lecture {
  moduleId: number;
  courseId: number;
  lectureDate: string | null;
  durationMin: number | null;
  positionMin: number;
  status: LectureStatus;
  notesMd: string;
  ignored: boolean;
  openedAt: number | null;
  watchedAt: number | null;
  title: string;
  url: string | null;
  openUrl: string | null;
  sectionName: string | null;
  sectionNumber: number | null;
  courseName: string;
  courseColor: string;
  number: number | null;
  type: 'lecture' | 'tirgul';
  effectiveDurationMin: number;
  remainingMin: number;
  slides: { moduleId: number; name: string; url: string | null; fileId: number | null } | null;
  completedInMoodle: boolean;
}

export interface CourseLag {
  courseId: number;
  courseName: string;
  color: string;
  total: number;
  watched: number;
  behind: number;
  behindMin: number;
}

export interface PlanItem {
  moduleId: number;
  courseId: number;
  title: string;
  minutes: number;
  part: number;
  parts: number;
  course?: CourseRef | null;
}

export interface PlanDay {
  date: string;
  items: PlanItem[];
  totalMin: number;
}

export type ChangeType =
  | 'course_new'
  | 'task_new'
  | 'due_changed'
  | 'submitted'
  | 'grade_new'
  | 'recording_new'
  | 'file_new'
  | 'file_updated'
  | 'module_new'
  | 'announcement_new';

export interface Change {
  id: number;
  type: ChangeType;
  courseId: number | null;
  entityType: string;
  entityId: number;
  title: string;
  payload: Record<string, unknown>;
  createdAt: number;
  seen: boolean;
  course: CourseRef | null;
}

export interface Announcement {
  id: number;
  courseId: number;
  subject: string;
  message: string;
  author: string | null;
  postedAt: number;
  pinned: boolean;
  read: boolean;
  course: CourseRef | null;
}

export interface Course {
  id: number;
  shortName: string;
  fullName: string;
  url: string | null;
  active: boolean;
  color: string;
  credits: number | null;
  startDate: number | null;
  endDate: number | null;
  lastSyncedAt: number | null;
  openTasks: number;
  nextDue: { id: number; title: string; dueAt: number } | null;
  lag: CourseLag | null;
  unreadAnnouncements: number;
}

export interface SyncRun {
  id: number;
  trigger: string;
  startedAt: number;
  finishedAt: number | null;
  status: 'running' | 'ok' | 'partial' | 'error';
  error: string | null;
  stats: Record<string, number>;
}

export interface SyncStatus {
  running: boolean;
  last: SyncRun | null;
  connected: boolean;
  tokenInvalid: boolean;
}

export interface Dashboard {
  today: string;
  sync: SyncStatus;
  counts: Partial<Record<Bucket, number>>;
  notStarted: number;
  focus: Task[];
  thisWeek: Task[];
  plannedToday: Task[];
  todayLectures: PlanItem[];
  lag: CourseLag[];
  recentChanges: Change[];
  announcements: { unread: number; latest: Announcement[] };
  unreadNotifications: number;
}

export interface WeekData {
  start: string;
  today: string;
  prev: string;
  next: string;
  days: { date: string; deadlines: Task[]; planned: Task[]; lectures: PlanItem[] }[];
  unscheduled: Task[];
  planUnscheduledMin: number;
}

export interface ModuleView {
  id: number;
  name: string;
  modname: string;
  kind: ModuleKind;
  autoKind: ModuleKind;
  kindOverride: ModuleKind | null;
  url: string | null;
  externalUrl: string | null;
  visible: boolean;
  firstSeenAt: number;
  isNew: boolean;
  files: { id: number; filename: string; fileSize: number | null; downloadedAt: number | null; skippedReason: string | null }[];
}

export interface CourseDetail {
  course: Course;
  sections: { id: number; number: number; name: string; modules: ModuleView[] }[];
  tasks: Task[];
  lectures: Lecture[];
  lag: CourseLag | null;
  announcements: Announcement[];
}

export interface FileItem {
  id: number;
  moduleId: number;
  courseId: number;
  sectionId: number | null;
  filename: string;
  filepath: string;
  fileSize: number | null;
  mimeType: string | null;
  timeModified: number | null;
  downloadedAt: number | null;
  skippedReason: string | null;
  error: string | null;
  firstSeenAt: number;
  moduleName: string | null;
  sectionName: string | null;
  sectionNumber: number | null;
  courseName: string;
  courseColor: string;
  state: 'downloaded' | 'pending' | 'video' | 'too_large' | 'error';
  isNew: boolean;
}

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
  dailyStudyMin: number;
  defaultLectureMin: number;
  notStartedDays: number;
  lagThreshold: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  downloadFiles: boolean;
  downloadVideos: boolean;
  maxFileMb: number;
  icsIncludePlan: boolean;
  notify: NotifyPrefs;
}

export interface SettingsResponse {
  settings: AppSettings;
  icsUrl: string;
  moodleUrl: string;
}

export interface MoodleStatus {
  connected: boolean;
  baseUrl: string;
  fullName?: string;
  username?: string;
  siteName?: string;
  tokenInvalid?: boolean;
  connectedAt?: number;
  lastOkAt?: number | null;
  functionsCount?: number;
  missingFunctions?: string[];
}

export interface Ping {
  reachable: boolean;
  ms: number;
  baseUrl: string;
  siteName?: string | null;
  typeOfLogin?: number | null;
  identityProviders?: string[];
  error?: string;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: number;
  read: boolean;
}
