ALTER TABLE `gas_purchases` ADD `kind` text DEFAULT 'recharge' NOT NULL;--> statement-breakpoint
ALTER TABLE `gas_purchases` ADD `agreement_version` text;--> statement-breakpoint
ALTER TABLE `users` ADD `welcome_gas_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `finix_instrument_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `card_brand` text;--> statement-breakpoint
ALTER TABLE `users` ADD `card_last_four` text;--> statement-breakpoint
ALTER TABLE `users` ADD `auto_recharge` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `auto_recharge_threshold` integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `auto_recharge_usd` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `auto_recharge_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `auto_recharge_last_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `recharge_agreed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `recharge_agreement_version` text;