CREATE TABLE `profile` (
	`emoji` text,
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT "profile_single_row" CHECK("profile"."id" = 1)
);
