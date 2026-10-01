CREATE TABLE `member_days` (
	`cursor` integer NOT NULL,
	`date` text NOT NULL,
	`field` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`user_id` text NOT NULL,
	`value` text,
	PRIMARY KEY(`user_id`, `date`, `field`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_days_cursor` ON `member_days` (`cursor`);--> statement-breakpoint
CREATE TABLE `member_patterns` (
	`cursor` integer NOT NULL,
	`data` text,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`pattern_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `pattern_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_patterns_cursor` ON `member_patterns` (`cursor`);