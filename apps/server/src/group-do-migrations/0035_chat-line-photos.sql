DROP INDEX `chat_lines_photos`;--> statement-breakpoint
ALTER TABLE `chat_lines` ADD `photos` text;--> statement-breakpoint
CREATE INDEX `chat_lines_photos` ON `chat_lines` (`thread_id`,`seq`) WHERE "chat_lines"."photos" is not null;--> statement-breakpoint
ALTER TABLE `chat_lines` DROP COLUMN `album`;--> statement-breakpoint
ALTER TABLE `chat_lines` DROP COLUMN `photo`;