CREATE TABLE `gas_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`usd_cents` integer NOT NULL,
	`gas` integer NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gas_purchases_order_id_unique` ON `gas_purchases` (`order_id`);--> statement-breakpoint
CREATE INDEX `gas_purchases_user_idx` ON `gas_purchases` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `usage` ADD `gas` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `gas_balance` integer DEFAULT 0 NOT NULL;