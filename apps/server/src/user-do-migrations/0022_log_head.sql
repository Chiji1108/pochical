CREATE TABLE `log_head` (
	`cursor` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	CONSTRAINT "log_head_single_row" CHECK("log_head"."id" = 1)
);
