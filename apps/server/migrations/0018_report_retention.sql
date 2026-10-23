CREATE TABLE `deleted_accounts` (
	`deleted_at` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reports` ADD `slack_tried` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `slack_ts` text;