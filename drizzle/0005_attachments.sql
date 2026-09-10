CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text,
	`name` text NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`chars` integer DEFAULT 0 NOT NULL,
	`via` text DEFAULT 'direct' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_user_idx` ON `attachments` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attachments_thread_idx` ON `attachments` (`thread_id`);