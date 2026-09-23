ALTER TABLE `customers` ADD `billing_cycle` text;--> statement-breakpoint
ALTER TABLE `licenses` ADD `billing_cycle` text;--> statement-breakpoint
UPDATE `customers` SET `plan` = 'essentials' WHERE `plan` = 'pro';--> statement-breakpoint
UPDATE `customers` SET `plan` = 'professional' WHERE `plan` = 'team';--> statement-breakpoint
UPDATE `licenses` SET `plan` = 'essentials' WHERE `plan` = 'pro';--> statement-breakpoint
UPDATE `licenses` SET `plan` = 'professional' WHERE `plan` = 'team';--> statement-breakpoint
UPDATE `trials` SET `plan` = 'essentials' WHERE `plan` = 'pro';--> statement-breakpoint
UPDATE `trials` SET `plan` = 'professional' WHERE `plan` = 'team';--> statement-breakpoint
UPDATE `licenses` SET `billing_cycle` = CASE WHEN `ends_at` IS NOT NULL AND `ends_at` - `starts_at` >= 300 * 86400000 THEN 'annual' ELSE 'monthly' END WHERE `billing_cycle` IS NULL;
