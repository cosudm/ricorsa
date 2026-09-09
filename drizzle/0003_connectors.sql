CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`server_name` text NOT NULL,
	`preset` text,
	`url` text NOT NULL,
	`auth_type` text DEFAULT 'none' NOT NULL,
	`secret` text,
	`pending` text,
	`enabled` integer DEFAULT true NOT NULL,
	`allowed_tools` text,
	`tools` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`last_error` text,
	`last_checked_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `connectors_user_idx` ON `connectors` (`user_id`);