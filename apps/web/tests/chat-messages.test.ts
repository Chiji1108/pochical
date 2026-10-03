import { expect, test } from "bun:test";

import type { Message } from "../src/components/design-group-data";
import {
  decidePoll,
  reactTo,
  unsendMessage,
  votePoll,
} from "../src/lib/chat-messages";

// How the web prototype keeps a chat's lines (spec/chat.md). Pins, an
// edit's link page and where a chat opens are in spec/vectors/chat.json.
const line = (id: string, more: Partial<Message> = {}): Message => ({
  from: "yuki",
  id,
  time: "10:00",
  when: "今日",
  ...more,
});

const poll = (more: Partial<Message> = {}) =>
  line("poll", {
    poll: { days: [new Date(2026, 9, 3)], votes: { "2026-10-03": ["yuki"] } },
    ...more,
  });

test("a vote is yours to give and take back", () => {
  const once = votePoll([poll()], "poll", "2026-10-03");
  expect(once[0].poll?.votes["2026-10-03"]).toEqual(["yuki", "me"]);
  const twice = votePoll(once, "poll", "2026-10-03");
  expect(twice[0].poll?.votes["2026-10-03"]).toEqual(["yuki"]);
});

test("a settled poll keeps the day it was settled on", () => {
  const { messages } = decidePoll([poll()], "poll", "2026-10-03");
  expect(messages[0].poll?.decided).toBe("2026-10-03");
});

test("a reaction is added, joined and taken back", () => {
  const theirs = [line("a", { reactions: [{ by: ["yuki"], emoji: "👍" }] })];
  const joined = reactTo(theirs, "a", "👍");
  expect(joined[0].reactions).toEqual([{ by: ["yuki", "me"], emoji: "👍" }]);
  expect(reactTo(joined, "a", "👍")[0].reactions).toEqual(theirs[0].reactions);
  const mine = reactTo([line("a")], "a", "🎉");
  expect(reactTo(mine, "a", "🎉")[0].reactions).toEqual([]);
});

test("a line taken back keeps only who wrote it and when", () => {
  const [taken] = unsendMessage(
    [
      line("a", {
        reactions: [{ by: ["me"], emoji: "👍" }],
        text: "やっぱなし",
      }),
    ],
    "a"
  );
  expect(taken).toEqual({
    from: "yuki",
    id: "a",
    time: "10:00",
    unsent: true,
    when: "今日",
  });
});
