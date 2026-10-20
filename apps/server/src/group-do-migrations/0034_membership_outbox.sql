CREATE TABLE `membership_outbox` (
	`cursor` integer NOT NULL,
	`due_at` integer NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`in_group` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL
);
