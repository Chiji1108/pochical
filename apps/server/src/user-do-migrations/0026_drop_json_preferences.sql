-- Custom SQL migration file, put your code below! --
-- The preferences kept before 0025 are JSON, which no app reads now that
-- each is its key's message. They go, so the account holds none and each
-- device keeps its own until the person sets one again
-- (spec/sync-protocol.md, Preferences).
DELETE FROM `preferences`;
