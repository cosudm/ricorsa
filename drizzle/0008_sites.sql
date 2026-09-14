CREATE TABLE `site_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`connector_id` text NOT NULL,
	`user_id` text NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	`url` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`chars` integer DEFAULT 0 NOT NULL,
	`rendered` integer DEFAULT false NOT NULL,
	`fetched_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `site_pages_connector` ON `site_pages` (`connector_id`);--> statement-breakpoint
CREATE TABLE `sites` (
	`connector_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`root_url` text NOT NULL,
	`max_pages` integer DEFAULT 40 NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	`chars` integer DEFAULT 0 NOT NULL,
	`rendered` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`error` text,
	`crawled_at` integer,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL
);
