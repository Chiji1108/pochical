CREATE TABLE `admin_actions` (
	`action` text NOT NULL,
	`at` integer NOT NULL,
	`by` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`target` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_actions_at` ON `admin_actions` (`at`);--> statement-breakpoint
ALTER TABLE `reports` ADD `handled_at` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `handled_by` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `status` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
CREATE INDEX `reports_status` ON `reports` (`status`,`created_at`);