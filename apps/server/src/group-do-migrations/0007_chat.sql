CREATE TABLE `chat_lines` (
	`author_id` text NOT NULL,
	`created_cursor` integer NOT NULL,
	`cursor` integer NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	`op_id` text NOT NULL,
	`sent_at` integer NOT NULL,
	`seq` integer NOT NULL,
	`text` text NOT NULL,
	`thread_id` text NOT NULL,
	`unsent` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`thread_id`, `seq`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_lines_cursor` ON `chat_lines` (`cursor`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_lines_op` ON `chat_lines` (`op_id`);--> statement-breakpoint
CREATE TABLE `read_marks` (
	`cursor` integer NOT NULL,
	`last_read_seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `thread_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `read_marks_cursor` ON `read_marks` (`cursor`);