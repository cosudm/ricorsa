CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`thread_id` text,
	`turn_id` text,
	`file_id` text,
	`title` text DEFAULT '' NOT NULL,
	`text` text NOT NULL,
	`terms` text DEFAULT '' NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	`embedded` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memories_user_idx` ON `memories` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `memories_thread_idx` ON `memories` (`thread_id`);--> statement-breakpoint
CREATE INDEX `memories_file_idx` ON `memories` (`file_id`);