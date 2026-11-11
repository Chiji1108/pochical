CREATE TABLE `end_notice_outbox` (
	`due_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL
);
