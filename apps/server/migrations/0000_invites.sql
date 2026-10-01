CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_group_id_unique` ON `invites` (`group_id`);