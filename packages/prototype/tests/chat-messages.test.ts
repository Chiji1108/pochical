import { expect, test } from "vitest";

import {
  decidePoll,
  reactTo,
  unsendMessage,
  votePoll,
} from "../src/lib/chat-messages";
import type { Message, MessageContent } from "../src/lib/design-group-data";

// How the web prototype keeps a chat's lines (spec/chat.md). Pins, an
// edit's link page, where a chat opens and what the composer holds as it
// answers or changes a line are in spec/vectors/chat.json.
const line = (
  id: string,
  content: MessageContent,
  more: Partial<Message> = {}
): Message => ({
  content,
  from: "yuki",
  id,
  time: "10:00",
  when: "今日",
  ...more,
});

const words: MessageContent = { kind: "words", text: "" };

const poll = () =>
  line("poll", {
    days: [new Date(2026, 9, 3)],
    kind: "poll",
    votes: { "2026-10-03": ["yuki"] },
  });

const pollOf = (message: Message | undefined) => {
  if (message?.content.kind !== "poll") {
    throw new Error("Not a poll");
  }
  return message.content;
};

test("a vote is yours to give and take back", () => {
  const once = votePoll([poll()], "poll", "2026-10-03");
  expect(pollOf(once[0]).votes["2026-10-03"]).toEqual(["yuki", "me"]);
  const twice = votePoll(once, "poll", "2026-10-03");
  expect(pollOf(twice[0]).votes["2026-10-03"]).toEqual(["yuki"]);
});

test("a settled poll keeps the day it was settled on", () => {
  const { messages } = decidePoll([poll()], "poll", "2026-10-03");
  expect(pollOf(messages[0]).decided).toBe("2026-10-03");
});

test("a reaction is added, joined and taken back", () => {
  const theirs = [
    line("a", words, { reactions: [{ by: ["yuki"], emoji: "👍" }] }),
  ];
  const joined = reactTo(theirs, "a", "👍");
  expect(joined[0].reactions).toEqual([{ by: ["yuki", "me"], emoji: "👍" }]);
  expect(reactTo(joined, "a", "👍")[0].reactions).toEqual(theirs[0].reactions);
  const mine = reactTo([line("a", words)], "a", "🎉");
  expect(reactTo(mine, "a", "🎉")[0].reactions).toEqual([]);
});

test("a line taken back keeps only who wrote it and when", () => {
  const [taken] = unsendMessage(
    [
      line(
        "a",
        { kind: "words", text: "やっぱなし" },
        { pinned: 1, reactions: [{ by: ["me"], emoji: "👍" }], replyTo: "b" }
      ),
    ],
    "a"
  );
  expect(taken).toEqual({
    content: { kind: "unsent" },
    from: "yuki",
    id: "a",
    time: "10:00",
    when: "今日",
  });
});
