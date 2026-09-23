ALTER TABLE `subscriptions` ADD `billing_cycle` text;--> statement-breakpoint
UPDATE `subscriptions` SET `billing_cycle` = 'monthly' WHERE `billing_cycle` IS NULL;--> statement-breakpoint
UPDATE `users` SET `billing_cycle` = 'monthly' WHERE `billing_cycle` IS NULL AND `paypal_subscription_id` IS NOT NULL AND `plan` != 'free' AND `subscription_status` IN ('ACTIVE', 'APPROVAL_PENDING', 'SUSPENDED');
