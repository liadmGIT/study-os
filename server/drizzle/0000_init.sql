CREATE TABLE `announcements` (
	`id` integer PRIMARY KEY NOT NULL,
	`course_id` integer NOT NULL,
	`forum_id` integer NOT NULL,
	`subject` text NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`author` text,
	`posted_at` integer NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`first_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `announcements_course_idx` ON `announcements` (`course_id`);--> statement-breakpoint
CREATE TABLE `changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`course_id` integer,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`title` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`seen` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `changes_created_idx` ON `changes` (`created_at`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY NOT NULL,
	`short_name` text DEFAULT '' NOT NULL,
	`full_name` text NOT NULL,
	`url` text,
	`start_date` integer,
	`end_date` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`credits` real,
	`last_access` integer,
	`baselined` integer DEFAULT false NOT NULL,
	`last_synced_at` integer,
	`first_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`section_id` integer,
	`filename` text NOT NULL,
	`filepath` text DEFAULT '/' NOT NULL,
	`file_url` text NOT NULL,
	`file_size` integer,
	`mime_type` text,
	`time_modified` integer,
	`local_path` text,
	`downloaded_at` integer,
	`skipped_reason` text,
	`error` text,
	`first_seen_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_module_path_idx` ON `files` (`module_id`,`filepath`,`filename`);--> statement-breakpoint
CREATE INDEX `files_course_idx` ON `files` (`course_id`);--> statement-breakpoint
CREATE TABLE `lectures` (
	`module_id` integer PRIMARY KEY NOT NULL,
	`course_id` integer NOT NULL,
	`lecture_date` text,
	`duration_min` integer,
	`position_min` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'unwatched' NOT NULL,
	`notes_md` text DEFAULT '' NOT NULL,
	`slides_module_id` integer,
	`ignored` integer DEFAULT false NOT NULL,
	`opened_at` integer,
	`watched_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lectures_course_idx` ON `lectures` (`course_id`);--> statement-breakpoint
CREATE TABLE `modules` (
	`id` integer PRIMARY KEY NOT NULL,
	`course_id` integer NOT NULL,
	`section_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`instance` integer,
	`modname` text NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`external_url` text,
	`description` text,
	`kind` text NOT NULL,
	`kind_override` text,
	`hash` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`completion_state` integer,
	`moodle_time` integer,
	`first_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE INDEX `modules_course_idx` ON `modules` (`course_id`);--> statement-breakpoint
CREATE TABLE `moodle_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`user_id` integer NOT NULL,
	`username` text,
	`full_name` text,
	`site_name` text,
	`token_enc` text NOT NULL,
	`private_token_enc` text,
	`functions` text DEFAULT '[]' NOT NULL,
	`connected_at` integer NOT NULL,
	`last_ok_at` integer,
	`token_invalid` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`pushed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_key_unique` ON `notifications` (`key`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `sections` (
	`id` integer PRIMARY KEY NOT NULL,
	`course_id` integer NOT NULL,
	`number` integer DEFAULT 0 NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE INDEX `sections_course_idx` ON `sections` (`course_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtasks_task_idx` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`error` text,
	`stats` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`moodle_id` integer,
	`cmid` integer,
	`course_id` integer,
	`title` text NOT NULL,
	`description` text,
	`url` text,
	`due_at` integer,
	`cutoff_at` integer,
	`opens_at` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`moodle_status` text,
	`grade` text,
	`graded_at` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`estimate_min` integer,
	`planned_date` text,
	`started_at` integer,
	`completed_at` integer,
	`prev_due_at` integer,
	`due_changed_at` integer,
	`hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`removed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_source_moodle_idx` ON `tasks` (`source`,`moodle_id`);--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_at`);