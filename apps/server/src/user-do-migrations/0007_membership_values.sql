ALTER TABLE `memberships` ADD `cursor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `emoji` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `name` text DEFAULT '' NOT NULL;