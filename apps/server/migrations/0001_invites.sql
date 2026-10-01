-- Which group each live invite code opens. The Group DO owns the group
-- itself; this index exists because a link carries only the code. A group
-- has one live code: remaking the link replaces its row, so the old code
-- stops working at once.
CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  group_id TEXT NOT NULL UNIQUE
) STRICT;
