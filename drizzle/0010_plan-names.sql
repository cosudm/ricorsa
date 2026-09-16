-- Plans renamed in September 2026: Pro became Essentials and Team became Professional (Enterprise is new).
-- Rows keep granting the same access under the new keys; PayPal ids from the old plans stay mapped in code.
UPDATE `users` SET `plan` = 'essentials' WHERE `plan` = 'pro';
--> statement-breakpoint
UPDATE `users` SET `plan` = 'professional' WHERE `plan` = 'team';
--> statement-breakpoint
UPDATE `grants` SET `plan` = 'essentials' WHERE `plan` = 'pro';
--> statement-breakpoint
UPDATE `grants` SET `plan` = 'professional' WHERE `plan` = 'team';
--> statement-breakpoint
UPDATE `subscriptions` SET `plan_key` = 'essentials' WHERE `plan_key` = 'pro';
--> statement-breakpoint
UPDATE `subscriptions` SET `plan_key` = 'professional' WHERE `plan_key` = 'team';
