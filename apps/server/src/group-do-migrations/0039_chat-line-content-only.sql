PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_lines` (
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_cursor` integer NOT NULL,
	`cursor` integer NOT NULL,
	`device` text,
	`hidden_from` text,
	`op_id` text NOT NULL,
	`pinned_at` integer,
	`reply_to` integer,
	`sent_at` integer NOT NULL,
	`seq` integer NOT NULL,
	`thread_id` text NOT NULL,
	PRIMARY KEY(`thread_id`, `seq`),
	CONSTRAINT "chat_lines_content" CHECK(coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0))
);
--> statement-breakpoint
INSERT INTO `__new_chat_lines`("author_id", "content", "created_cursor", "cursor", "device", "hidden_from", "op_id", "pinned_at", "reply_to", "sent_at", "seq", "thread_id") SELECT "author_id", "content", "created_cursor", "cursor", "device", "hidden_from", "op_id", "pinned_at", "reply_to", "sent_at", "seq", "thread_id" FROM `chat_lines`;--> statement-breakpoint
DROP TABLE `chat_lines`;--> statement-breakpoint
ALTER TABLE `__new_chat_lines` RENAME TO `chat_lines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_lines_cursor` ON `chat_lines` (`cursor`);--> statement-breakpoint
CREATE UNIQUE INDEX `chat_lines_op` ON `chat_lines` (`op_id`);--> statement-breakpoint
CREATE INDEX `chat_lines_photos` ON `chat_lines` (`thread_id`,`seq`) WHERE "chat_lines"."content" ->> '$.kind' = 'photos';