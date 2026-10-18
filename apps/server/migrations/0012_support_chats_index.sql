CREATE TABLE `support_slack` (
	`seq` integer NOT NULL,
	`ts` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`ts`, `seq`)
);
--> statement-breakpoint
ALTER TABLE `support_chats` ADD `last_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `support_chats` ADD `last_from_pochical` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `support_chats` ADD `last_unsent` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `support_chats` ADD `unanswered` integer DEFAULT 0 NOT NULL;