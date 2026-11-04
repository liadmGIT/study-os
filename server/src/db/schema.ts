import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// All timestamps are unix seconds. Moodle ids are used as primary keys where they exist.

const bool = (name: string) => integer(name, { mode: 'boolean' });

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export const moodleAccount = sqliteTable('moodle_account', {
  id: integer('id').primaryKey(), // always 1
  baseUrl: text('base_url').notNull(),
  userId: integer('user_id').notNull(),
  username: text('username'),
  fullName: text('full_name'),
  siteName: text('site_name'),
  tokenEnc: text('token_enc').notNull(),
  privateTokenEnc: text('private_token_enc'),
  functions: text('functions', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  connectedAt: integer('connected_at').notNull(),
  lastOkAt: integer('last_ok_at'),
  tokenInvalid: bool('token_invalid').notNull().default(false),
});

export const courses = sqliteTable('courses', {
  id: integer('id').primaryKey(),
  shortName: text('short_name').notNull().default(''),
  fullName: text('full_name').notNull(),
  url: text('url'),
  startDate: integer('start_date'),
  endDate: integer('end_date'),
  hidden: bool('hidden').notNull().default(false),
  active: bool('active').notNull().default(true),
  color: text('color').notNull().default('#6366f1'),
  credits: real('credits'),
  lastAccess: integer('last_access'),
  baselined: bool('baselined').notNull().default(false),
  lastSyncedAt: integer('last_synced_at'),
  firstSeenAt: integer('first_seen_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  removedAt: integer('removed_at'),
});

export const sections = sqliteTable(
  'sections',
  {
    id: integer('id').primaryKey(),
    courseId: integer('course_id').notNull(),
    number: integer('number').notNull().default(0),
    name: text('name').notNull().default(''),
    visible: bool('visible').notNull().default(true),
    removedAt: integer('removed_at'),
  },
  (t) => [index('sections_course_idx').on(t.courseId)],
);

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

export const modules = sqliteTable(
  'modules',
  {
    id: integer('id').primaryKey(), // course module id (cmid)
    courseId: integer('course_id').notNull(),
    sectionId: integer('section_id'),
    position: integer('position').notNull().default(0),
    instance: integer('instance'),
    modname: text('modname').notNull(),
    name: text('name').notNull(),
    url: text('url'),
    externalUrl: text('external_url'),
    description: text('description'),
    kind: text('kind').$type<ModuleKind>().notNull(),
    kindOverride: text('kind_override').$type<ModuleKind>(),
    hash: text('hash').notNull(),
    visible: bool('visible').notNull().default(true),
    completionState: integer('completion_state'),
    moodleTime: integer('moodle_time'),
    firstSeenAt: integer('first_seen_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    removedAt: integer('removed_at'),
  },
  (t) => [index('modules_course_idx').on(t.courseId)],
);

export const files = sqliteTable(
  'files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    moduleId: integer('module_id').notNull(),
    courseId: integer('course_id').notNull(),
    sectionId: integer('section_id'),
    filename: text('filename').notNull(),
    filepath: text('filepath').notNull().default('/'),
    fileUrl: text('file_url').notNull(),
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),
    timeModified: integer('time_modified'),
    localPath: text('local_path'),
    downloadedAt: integer('downloaded_at'),
    skippedReason: text('skipped_reason'),
    error: text('error'),
    firstSeenAt: integer('first_seen_at').notNull(),
    removedAt: integer('removed_at'),
  },
  (t) => [
    uniqueIndex('files_module_path_idx').on(t.moduleId, t.filepath, t.filename),
    index('files_course_idx').on(t.courseId),
  ],
);

export const announcements = sqliteTable(
  'announcements',
  {
    id: integer('id').primaryKey(), // discussion id
    courseId: integer('course_id').notNull(),
    forumId: integer('forum_id').notNull(),
    subject: text('subject').notNull(),
    message: text('message').notNull().default(''),
    author: text('author'),
    postedAt: integer('posted_at').notNull(),
    pinned: bool('pinned').notNull().default(false),
    read: bool('read').notNull().default(false),
    firstSeenAt: integer('first_seen_at').notNull(),
  },
  (t) => [index('announcements_course_idx').on(t.courseId)],
);

export type TaskSource = 'assign' | 'quiz' | 'event' | 'personal';
export type TaskStatus = 'todo' | 'in_progress' | 'submitted' | 'done';

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').$type<TaskSource>().notNull(),
    moodleId: integer('moodle_id'),
    cmid: integer('cmid'),
    courseId: integer('course_id'),
    title: text('title').notNull(),
    description: text('description'),
    url: text('url'),
    dueAt: integer('due_at'),
    cutoffAt: integer('cutoff_at'),
    opensAt: integer('opens_at'),
    status: text('status').$type<TaskStatus>().notNull().default('todo'),
    moodleStatus: text('moodle_status'),
    grade: text('grade'),
    gradedAt: integer('graded_at'),
    priority: integer('priority').notNull().default(0), // 0 none, 1 low, 2 medium, 3 high
    estimateMin: integer('estimate_min'),
    plannedDate: text('planned_date'),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    prevDueAt: integer('prev_due_at'),
    dueChangedAt: integer('due_changed_at'),
    hidden: bool('hidden').notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    removedAt: integer('removed_at'),
  },
  (t) => [
    uniqueIndex('tasks_source_moodle_idx').on(t.source, t.moodleId),
    index('tasks_due_idx').on(t.dueAt),
  ],
);

export const subtasks = sqliteTable(
  'subtasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    done: bool('done').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('subtasks_task_idx').on(t.taskId)],
);

export type LectureStatus = 'unwatched' | 'in_progress' | 'watched';

export const lectures = sqliteTable(
  'lectures',
  {
    moduleId: integer('module_id').primaryKey(),
    courseId: integer('course_id').notNull(),
    lectureDate: text('lecture_date'), // YYYY-MM-DD, null = unknown (treated as past)
    durationMin: integer('duration_min'),
    positionMin: integer('position_min').notNull().default(0),
    status: text('status').$type<LectureStatus>().notNull().default('unwatched'),
    notesMd: text('notes_md').notNull().default(''),
    slidesModuleId: integer('slides_module_id'),
    ignored: bool('ignored').notNull().default(false),
    openedAt: integer('opened_at'),
    watchedAt: integer('watched_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('lectures_course_idx').on(t.courseId)],
);

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

export const changes = sqliteTable(
  'changes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').$type<ChangeType>().notNull(),
    courseId: integer('course_id'),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    title: text('title').notNull(),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    createdAt: integer('created_at').notNull(),
    seen: bool('seen').notNull().default(false),
  },
  (t) => [index('changes_created_idx').on(t.createdAt)],
);

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  url: text('url'),
  createdAt: integer('created_at').notNull(),
  read: bool('read').notNull().default(false),
  pushedAt: integer('pushed_at'),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
});

export const syncRuns = sqliteTable('sync_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  trigger: text('trigger').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  status: text('status').$type<'running' | 'ok' | 'partial' | 'error'>().notNull(),
  error: text('error'),
  stats: text('stats', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
});

export type Course = typeof courses.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Module = typeof modules.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Subtask = typeof subtasks.$inferSelect;
export type Lecture = typeof lectures.$inferSelect;
export type Change = typeof changes.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
