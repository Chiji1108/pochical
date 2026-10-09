ALTER TABLE `members` ADD `own_name` text;--> statement-breakpoint
ALTER TABLE `members` ADD `usual_name` text DEFAULT '' NOT NULL;