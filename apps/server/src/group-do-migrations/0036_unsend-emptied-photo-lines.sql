-- Custom SQL migration file, put your code below! --
-- The lines that were photos before 0035, which dropped their photo and
-- left them with nothing: no words, photos, days, poll or notice, which
-- no send can make (fitsSend). Each is taken back as 送信取消 takes back a
-- line (unsendLine): its reactions, votes and pin go, and it moves to a
-- cursor of its own past the log's head, so devices hear of it. Its seq
-- stays, as a chat's seqs run without gaps (a device is at a chat's start
-- at seq 1, and the next line is the chat's last seq + 1).
DELETE FROM `chat_reactions` WHERE EXISTS (
	SELECT 1 FROM `chat_lines` AS `l`
	WHERE `l`.`thread_id` = `chat_reactions`.`thread_id`
		AND `l`.`seq` = `chat_reactions`.`seq`
		AND `l`.`text` = '' AND `l`.`photos` IS NULL AND `l`.`days` IS NULL
		AND `l`.`notice` IS NULL AND `l`.`poll` = 0 AND `l`.`unsent` = 0
);--> statement-breakpoint
DELETE FROM `chat_votes` WHERE EXISTS (
	SELECT 1 FROM `chat_lines` AS `l`
	WHERE `l`.`thread_id` = `chat_votes`.`thread_id`
		AND `l`.`seq` = `chat_votes`.`seq`
		AND `l`.`text` = '' AND `l`.`photos` IS NULL AND `l`.`days` IS NULL
		AND `l`.`notice` IS NULL AND `l`.`poll` = 0 AND `l`.`unsent` = 0
);--> statement-breakpoint
-- Their cursors, one each in (thread_id, seq) order, past the head as it
-- stands, in one pass; this changes none of the columns that pick them out.
UPDATE `chat_lines` SET `cursor` = `picked`.`cursor`
FROM (
	SELECT `thread_id`, `seq`,
		coalesce((SELECT `cursor` FROM `log_head` WHERE `id` = 1), 0)
			+ row_number() OVER (ORDER BY `thread_id`, `seq`) AS `cursor`
	FROM `chat_lines`
	WHERE `text` = '' AND `photos` IS NULL AND `days` IS NULL
		AND `notice` IS NULL AND `poll` = 0 AND `unsent` = 0
) AS `picked`
WHERE `chat_lines`.`thread_id` = `picked`.`thread_id`
	AND `chat_lines`.`seq` = `picked`.`seq`;--> statement-breakpoint
INSERT INTO `log_head` (`id`, `cursor`)
SELECT 1, coalesce((SELECT `cursor` FROM `log_head` WHERE `id` = 1), 0) + count(*)
FROM `chat_lines`
WHERE `text` = '' AND `photos` IS NULL AND `days` IS NULL
	AND `notice` IS NULL AND `poll` = 0 AND `unsent` = 0
ON CONFLICT (`id`) DO UPDATE SET `cursor` = excluded.`cursor`;--> statement-breakpoint
UPDATE `chat_lines` SET `decided` = NULL, `pinned_at` = NULL, `preview` = NULL, `reply_to` = NULL, `unsent` = 1
WHERE `text` = '' AND `photos` IS NULL AND `days` IS NULL
	AND `notice` IS NULL AND `poll` = 0 AND `unsent` = 0;
