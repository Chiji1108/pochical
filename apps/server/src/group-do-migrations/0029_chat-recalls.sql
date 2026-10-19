CREATE TABLE `chat_recalls` (
	`op_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `op_id`)
);
