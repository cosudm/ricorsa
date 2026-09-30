CREATE TABLE `browse_sessions` (
	`turn_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`session_id` text NOT NULL,
	`mode` text DEFAULT 'model' NOT NULL,
	`url` text,
	`title` text,
	`hosts` text,
	`sign_in_seen` integer DEFAULT false NOT NULL,
	`person_started_at` integer,
	`person_last_at` integer,
	`person_minutes` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `browse_sessions_user_idx` ON `browse_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `browse_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`host` text NOT NULL,
	`label` text,
	`cookies` text NOT NULL,
	`cookie_count` integer DEFAULT 0 NOT NULL,
	`saved_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `browse_sites_user_idx` ON `browse_sites` (`user_id`,`host`);