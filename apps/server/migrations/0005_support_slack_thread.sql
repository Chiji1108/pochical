ALTER TABLE `support_chats` ADD `slack_thread_ts` text;--> statement-breakpoint
CREATE INDEX `support_chats_slack_thread` ON `support_chats` (`slack_thread_ts`);