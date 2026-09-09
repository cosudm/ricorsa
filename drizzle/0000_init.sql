CREATE TABLE `discover_cache` (
	`category` text NOT NULL,
	`day` text NOT NULL,
	`items` text NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	PRIMARY KEY(`category`, `day`)
);
--> statement-breakpoint
CREATE TABLE `graphs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text DEFAULT '🗂️' NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spaces_user_idx` ON `spaces` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_key` text NOT NULL,
	`paypal_plan_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`next_billing_at` integer,
	`cancelled_at` integer,
	`raw` text,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscriptions_user_idx` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`space_id` text,
	`title` text NOT NULL,
	`turns` text DEFAULT '[]' NOT NULL,
	`origin` text,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `threads_user_updated_idx` ON `threads` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `usage` (
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`questions` integer DEFAULT 0 NOT NULL,
	`research` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `period`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`name` text,
	`picture` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`paypal_subscription_id` text,
	`subscription_status` text,
	`plan_renews_at` integer,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`received_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`payload` text
);
