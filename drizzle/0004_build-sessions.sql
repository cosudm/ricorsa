ALTER TABLE `builds` ADD `root_id` text;--> statement-breakpoint
ALTER TABLE `builds` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `builds` ADD `messages` text DEFAULT '[]' NOT NULL;