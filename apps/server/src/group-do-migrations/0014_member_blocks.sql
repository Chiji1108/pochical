CREATE TABLE `member_blocks` (
	`blocked_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `blocked_id`)
);
--> statement-breakpoint
ALTER TABLE `chat_lines` ADD `hidden_from` text;