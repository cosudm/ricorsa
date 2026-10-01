ALTER TABLE `gas_purchases` ADD `provider` text DEFAULT 'paypal' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `provider` text DEFAULT 'paypal' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `subscription_provider` text;--> statement-breakpoint
ALTER TABLE `users` ADD `finix_identity_id` text;