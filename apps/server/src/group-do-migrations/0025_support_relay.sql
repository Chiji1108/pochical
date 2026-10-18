CREATE TABLE `support_relay` (
	`cursor` integer NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	CONSTRAINT "support_relay_single_row" CHECK("support_relay"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `support_slack_lines` (
	`notices` text DEFAULT '{}' NOT NULL,
	`seq` integer PRIMARY KEY NOT NULL,
	`slack_ts` text,
	`told_reactions` text DEFAULT '[]' NOT NULL,
	`told_unsent` integer DEFAULT false NOT NULL
);
