CREATE TABLE `chat_reactions` (
	`emoji` text NOT NULL,
	`made_cursor` integer NOT NULL,
	`seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `seq`, `user_id`, `emoji`)
);
