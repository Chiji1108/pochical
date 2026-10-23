PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`cursor` integer NOT NULL,
	`hlc_counter` integer NOT NULL,
	`hlc_device` text NOT NULL,
	`hlc_ms` integer NOT NULL,
	`key` text PRIMARY KEY NOT NULL,
	`value` blob
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("cursor", "hlc_counter", "hlc_device", "hlc_ms", "key", "value") SELECT "cursor", "hlc_counter", "hlc_device", "hlc_ms", "key", "value" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `preferences_cursor` ON `preferences` (`cursor`);