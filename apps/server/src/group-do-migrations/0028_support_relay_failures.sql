ALTER TABLE `support_relay` ADD `failing_since` integer;--> statement-breakpoint
ALTER TABLE `support_relay` ADD `failures` integer DEFAULT 0 NOT NULL;