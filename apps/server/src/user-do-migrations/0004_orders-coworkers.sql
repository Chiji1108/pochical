CREATE TABLE `coworker_order` (
	`cursor` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`ids` text NOT NULL,
	CONSTRAINT "coworker_order_single_row" CHECK("coworker_order"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `coworkers` (
	`cursor` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coworkers_cursor` ON `coworkers` (`cursor`);--> statement-breakpoint
CREATE TABLE `repeat_orders` (
	`cursor` integer NOT NULL,
	`data` text NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	CONSTRAINT "repeat_orders_single_row" CHECK("repeat_orders"."id" = 1)
);
