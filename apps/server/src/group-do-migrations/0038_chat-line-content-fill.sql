-- Custom SQL migration file, put your code below! --
-- Each line's content (src/chat-content.ts) from the columns that said
-- what it was: taken back, a notice, photos, a poll, days, or words. JSON
-- that does not parse is read as none. What devices get of a line that
-- fits stays the same, so its cursor stays: a notice or a line taken back
-- had no reply or pin to drop.
UPDATE `chat_lines` SET `content` = CASE
	WHEN `unsent` = 1 THEN json_object('kind', 'unsent')
	WHEN `notice` IS NOT NULL
		THEN json_object('kind', 'notice', 'notice', iif(json_valid(`notice`), json(`notice`), NULL))
	WHEN `photos` IS NOT NULL
		THEN json_object('kind', 'photos', 'photos', iif(json_valid(`photos`), json(`photos`), NULL))
	WHEN `poll` = 1 THEN json_object(
		'kind', 'poll',
		'days', iif(json_valid(`days`), json(`days`), NULL),
		'decided', `decided`
	)
	WHEN `days` IS NOT NULL
		THEN json_object('kind', 'days', 'days', iif(json_valid(`days`), json(`days`), NULL))
	ELSE json_object(
		'kind', 'words',
		'text', `text`,
		'edited', json(iif(`edited` = 1, 'true', 'false')),
		'preview', iif(json_valid(`preview`), json(`preview`), NULL)
	)
END;--> statement-breakpoint
UPDATE `chat_lines` SET `pinned_at` = NULL, `reply_to` = NULL
WHERE `content` ->> '$.kind' IN ('notice', 'unsent');--> statement-breakpoint
-- A line whose content would not pass 0039's CHECK (its days or photos
-- none, words with none, a notice that does not parse) is taken back, as
-- 0036 took back lines left with nothing, so 0039 copies every row and
-- the group opens: its reactions, votes, pin and reply go, and it moves
-- to a cursor of its own past the log's head, so devices hear of it. Each
-- statement picks them out by the CHECK's own condition, word for word
-- (test/chat-line-content.test.ts holds them to it), its columns bare as
-- only chat_lines has them; the cursors move first, as that changes none
-- of what picks them out.
DELETE FROM `chat_reactions` WHERE EXISTS (
	SELECT 1 FROM `chat_lines`
	WHERE `chat_lines`.`thread_id` = `chat_reactions`.`thread_id`
		AND `chat_lines`.`seq` = `chat_reactions`.`seq`
		AND NOT coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0)
);
--> statement-breakpoint
DELETE FROM `chat_votes` WHERE EXISTS (
	SELECT 1 FROM `chat_lines`
	WHERE `chat_lines`.`thread_id` = `chat_votes`.`thread_id`
		AND `chat_lines`.`seq` = `chat_votes`.`seq`
		AND NOT coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0)
);
--> statement-breakpoint
UPDATE `chat_lines` SET `cursor` = `picked`.`cursor`
FROM (
	SELECT `thread_id`, `seq`,
		coalesce((SELECT `cursor` FROM `log_head` WHERE `id` = 1), 0)
			+ row_number() OVER (ORDER BY `thread_id`, `seq`) AS `cursor`
	FROM `chat_lines`
	WHERE NOT coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0)
) AS `picked`
WHERE `chat_lines`.`thread_id` = `picked`.`thread_id`
	AND `chat_lines`.`seq` = `picked`.`seq`;
--> statement-breakpoint
INSERT INTO `log_head` (`id`, `cursor`)
SELECT 1, coalesce((SELECT `cursor` FROM `log_head` WHERE `id` = 1), 0) + count(*)
FROM `chat_lines`
WHERE NOT coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0)
ON CONFLICT (`id`) DO UPDATE SET `cursor` = excluded.`cursor`;
--> statement-breakpoint
UPDATE `chat_lines` SET `content` = json_object('kind', 'unsent'), `pinned_at` = NULL, `reply_to` = NULL
WHERE NOT coalesce(CASE content ->> '$.kind'
        WHEN 'words' THEN content ->> '$.text' <> ''
          AND json_type(content, '$.edited') IN ('true', 'false')
        WHEN 'photos' THEN json_array_length(content, '$.photos') > 0
        WHEN 'days' THEN json_array_length(content, '$.days') > 0
        WHEN 'poll' THEN json_array_length(content, '$.days') > 0
        WHEN 'notice' THEN json_type(content, '$.notice') = 'object'
          AND reply_to IS NULL AND pinned_at IS NULL
        WHEN 'unsent' THEN reply_to IS NULL AND pinned_at IS NULL
      END, 0);
