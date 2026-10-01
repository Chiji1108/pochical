CREATE TABLE `pattern_order` (
	`cursor` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`ids` text NOT NULL,
	CONSTRAINT "pattern_order_single_row" CHECK("pattern_order"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `patterns` (
	`cursor` integer NOT NULL,
	`data` text,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patterns_cursor` ON `patterns` (`cursor`);