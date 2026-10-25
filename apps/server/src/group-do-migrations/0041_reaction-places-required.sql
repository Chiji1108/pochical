PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_reactions` (
	`emoji` text NOT NULL,
	`made_cursor` integer NOT NULL,
	`placed_cursor` integer NOT NULL,
	`seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `seq`, `user_id`, `emoji`)
);
--> statement-breakpoint
INSERT INTO `__new_chat_reactions`("emoji", "made_cursor", "placed_cursor", "seq", "thread_id", "user_id") SELECT "emoji", "made_cursor", "placed_cursor", "seq", "thread_id", "user_id" FROM `chat_reactions`;--> statement-breakpoint
DROP TABLE `chat_reactions`;--> statement-breakpoint
ALTER TABLE `__new_chat_reactions` RENAME TO `chat_reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;