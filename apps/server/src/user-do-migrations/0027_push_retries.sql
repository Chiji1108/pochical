CREATE TABLE `push_retries` (
	`due_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`push` text NOT NULL,
	`sandbox` integer NOT NULL,
	`token` text NOT NULL,
	`tries` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_retries_due_at` ON `push_retries` (`due_at`);