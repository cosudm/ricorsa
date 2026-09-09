CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_id` text,
	`idea_id` text,
	`graph_hash` text,
	`category` text,
	`kind` text DEFAULT 'App' NOT NULL,
	`title` text NOT NULL,
	`spec` text NOT NULL,
	`changes` text,
	`status` text DEFAULT 'building' NOT NULL,
	`plan` text DEFAULT '' NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`error` text,
	`lineage` text,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `builds_user_idx` ON `builds` (`user_id`,`updated_at`);