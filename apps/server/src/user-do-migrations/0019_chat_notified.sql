CREATE TABLE `chat_notified` (
	`first_seq` integer NOT NULL,
	`group_id` text NOT NULL,
	`last_seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `thread_id`)
);
