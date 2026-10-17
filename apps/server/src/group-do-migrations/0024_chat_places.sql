ALTER TABLE `chat_lines` ADD `device` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `kind` text DEFAULT 'group' NOT NULL;