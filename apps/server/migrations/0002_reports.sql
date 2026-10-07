CREATE TABLE `reports` (
	`context` text NOT NULL,
	`created_at` integer NOT NULL,
	`group_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`reporter_id` text NOT NULL,
	`target_id` text NOT NULL,
	`thread_id` text,
	`seq` integer
);
