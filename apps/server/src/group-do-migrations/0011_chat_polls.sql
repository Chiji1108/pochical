CREATE TABLE `chat_votes` (
	`day` text NOT NULL,
	`made_cursor` integer NOT NULL,
	`seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `seq`, `day`, `user_id`)
);
--> statement-breakpoint
ALTER TABLE `chat_lines` ADD `decided` text;--> statement-breakpoint
ALTER TABLE `chat_lines` ADD `poll` integer DEFAULT false NOT NULL;