-- Custom SQL migration file, put your code below! --
-- Each line's content (src/chat-content.ts) from the columns that said
-- what it was: taken back, a notice, photos, a poll, days, or words. A
-- line with none of them is no more after 0036; were one left, it is
-- taken back rather than kept as words with none. What devices get of a
-- line stays the same, so no cursor moves: a notice or a line taken back
-- had no reply or pin to drop.
UPDATE `chat_lines` SET `content` = CASE
	WHEN `unsent` = 1 OR (`text` = '' AND `notice` IS NULL AND `photos` IS NULL AND `days` IS NULL)
		THEN json_object('kind', 'unsent')
	WHEN `notice` IS NOT NULL THEN json_object('kind', 'notice', 'notice', json(`notice`))
	WHEN `photos` IS NOT NULL THEN json_object('kind', 'photos', 'photos', json(`photos`))
	WHEN `poll` = 1 THEN json_object('kind', 'poll', 'days', json(`days`), 'decided', `decided`)
	WHEN `days` IS NOT NULL THEN json_object('kind', 'days', 'days', json(`days`))
	ELSE json_object(
		'kind', 'words',
		'text', `text`,
		'edited', json(iif(`edited` = 1, 'true', 'false')),
		'preview', json(`preview`)
	)
END;--> statement-breakpoint
UPDATE `chat_lines` SET `pinned_at` = NULL, `reply_to` = NULL
WHERE `content` ->> '$.kind' IN ('notice', 'unsent');
