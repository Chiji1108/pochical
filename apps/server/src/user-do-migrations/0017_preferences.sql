CREATE TABLE `preferences` (
	`cursor` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_cursor` ON `preferences` (`cursor`);