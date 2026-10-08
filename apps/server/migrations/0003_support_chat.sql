CREATE TABLE `support_chats` (
	`last_at` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	`user_read_at` integer
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`created_at` integer NOT NULL,
	`from_support` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`user_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_messages_user` ON `support_messages` (`user_id`,`created_at`);