CREATE TABLE `member_repeat_orders` (
	`cursor` integer NOT NULL,
	`data` text NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_repeat_orders_cursor` ON `member_repeat_orders` (`cursor`);