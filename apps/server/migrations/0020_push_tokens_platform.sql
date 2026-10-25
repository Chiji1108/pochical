CREATE TABLE `push_tokens` (
	`platform` text NOT NULL,
	`sandbox` integer NOT NULL,
	`session_id` text NOT NULL,
	`token` text PRIMARY KEY NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_tokens_session` ON `push_tokens` (`session_id`);