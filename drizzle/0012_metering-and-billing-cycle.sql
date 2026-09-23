ALTER TABLE `usage` ADD `builds` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage` ADD `ideas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `billing_cycle` text;