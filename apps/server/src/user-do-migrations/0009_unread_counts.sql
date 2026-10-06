CREATE TABLE `unread_counts` (
	`count` integer NOT NULL,
	`cursor` integer NOT NULL,
	`group_cursor` integer NOT NULL,
	`group_id` text NOT NULL,
	`thread_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `thread_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unread_counts_cursor` ON `unread_counts` (`cursor`);