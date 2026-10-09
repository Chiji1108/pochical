ALTER TABLE `members` ADD `own_photo` text;--> statement-breakpoint
ALTER TABLE `members` ADD `usual_photo` text DEFAULT '' NOT NULL;