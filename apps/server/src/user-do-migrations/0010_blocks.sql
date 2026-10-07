CREATE TABLE `blocks` (
	`blocked` integer NOT NULL,
	`cursor` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blocks_cursor` ON `blocks` (`cursor`);