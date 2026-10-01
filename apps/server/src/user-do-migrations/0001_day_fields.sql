CREATE TABLE `day_fields` (
	`cursor` integer NOT NULL,
	`date` text NOT NULL,
	`field` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`value` text,
	PRIMARY KEY(`date`, `field`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_fields_cursor` ON `day_fields` (`cursor`);