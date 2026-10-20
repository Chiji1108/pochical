CREATE TABLE `group_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'unsent' NOT NULL,
	`uploaded_at` integer DEFAULT 0 NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
DROP TABLE `chat_photos`;