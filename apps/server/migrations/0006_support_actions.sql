CREATE TABLE `support_reactions` (
	`emoji` text NOT NULL,
	`from_support` integer NOT NULL,
	`message_id` text NOT NULL,
	PRIMARY KEY(`message_id`, `from_support`, `emoji`)
);
--> statement-breakpoint
ALTER TABLE `support_messages` ADD `reply_to` text;--> statement-breakpoint
ALTER TABLE `support_messages` ADD `slack_ts` text;--> statement-breakpoint
ALTER TABLE `support_messages` ADD `unsent` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `support_messages_slack` ON `support_messages` (`slack_ts`);