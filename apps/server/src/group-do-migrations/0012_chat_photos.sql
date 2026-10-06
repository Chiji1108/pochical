CREATE TABLE `chat_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`sent` integer DEFAULT false NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chat_lines` ADD `photo` text;