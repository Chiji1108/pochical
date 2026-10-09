CREATE TABLE `profile` (
	`cursor` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT "profile_one_row" CHECK("profile"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_cursor` ON `profile` (`cursor`);