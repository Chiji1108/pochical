CREATE TABLE `known_groups` (
	`group_id` text PRIMARY KEY NOT NULL,
	`news_cursor` integer DEFAULT 0 NOT NULL
);
