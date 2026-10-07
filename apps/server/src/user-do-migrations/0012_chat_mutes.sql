CREATE TABLE `chat_mutes` (
	`cursor` integer NOT NULL,
	`group_id` text NOT NULL,
	`muted` integer NOT NULL,
	`thread_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `thread_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_mutes_cursor` ON `chat_mutes` (`cursor`);--> statement-breakpoint
CREATE TABLE `chat_settings` (
	`cursor` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`mentions_when_muted` integer NOT NULL,
	CONSTRAINT "chat_settings_one_row" CHECK("chat_settings"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_settings_cursor` ON `chat_settings` (`cursor`);--> statement-breakpoint
ALTER TABLE `unread_counts` ADD `mentions` integer DEFAULT 0 NOT NULL;