-- Custom SQL migration file, put your code below! --
-- A User DO from before log_head gives out cursors past every one its
-- values already hold (spec/sync-protocol.md, Change log and cursor).
-- One SELECT, as a Durable Object's SQLite takes few compound terms.
INSERT INTO `log_head` (`id`, `cursor`)
SELECT 1, max(
	coalesce((SELECT max(`cursor`) FROM `memberships`), 0),
	coalesce((SELECT max(`cursor`) FROM `day_fields`), 0),
	coalesce((SELECT max(`cursor`) FROM `patterns`), 0),
	coalesce((SELECT max(`cursor`) FROM `pattern_order`), 0),
	coalesce((SELECT max(`cursor`) FROM `repeat_orders`), 0),
	coalesce((SELECT max(`cursor`) FROM `coworkers`), 0),
	coalesce((SELECT max(`cursor`) FROM `coworker_order`), 0),
	coalesce((SELECT max(`cursor`) FROM `preferences`), 0),
	coalesce((SELECT max(`cursor`) FROM `unread_counts`), 0),
	coalesce((SELECT max(`cursor`) FROM `blocks`), 0),
	coalesce((SELECT max(`cursor`) FROM `chat_mutes`), 0),
	coalesce((SELECT max(`cursor`) FROM `chat_settings`), 0),
	coalesce((SELECT max(`cursor`) FROM `profile`), 0)
) WHERE true
ON CONFLICT (`id`) DO UPDATE SET `cursor` = max(`cursor`, excluded.`cursor`);
