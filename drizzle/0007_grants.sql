CREATE TABLE `grants` (
	`email` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`status` text DEFAULT 'LICENSED' NOT NULL,
	`ends_at` integer,
	`note` text,
	`created_by` text,
	`applied_to` text,
	`applied_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
