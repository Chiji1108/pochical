import { expect, test } from "bun:test";

import { chatRules } from "@pochical/design/chat";

import type { Message } from "../src/components/design-group-data";
import {
  decidePoll,
  editMessage,
  firstUnreadOf,
  pinMessage,
  pinsOf,
  reactTo,
  unsendMessage,
  votePoll,
} from "../src/lib/chat-messages";

// What a chat's lines become as people use them (spec/chat.md).
const line = (id: string, more: Partial<Message> = {}): Message => ({
  from: "yuki",
  id,
  time: "10:00",
  when: "今日",
  ...more,
});

const pinnedIds = (messages: Message[]) => pinsOf(messages).map(({ id }) => id);

test("a pinned line comes first among the pins", () => {
  const { messages } = pinMessage(
    [line("a", { pinned: 1 }), line("b")],
    "b",
    true
  );
  expect(pinnedIds(messages)).toEqual(["b", "a"]);
});

test("one pin past the most takes the place of the oldest", () => {
  const full = Array.from({ length: chatRules.maxPins }, (_, index) =>
    line(`p${index}`, { pinned: index + 1 })
  );
  const { messages, dropped } = pinMessage([...full, line("new")], "new", true);
  expect(dropped).toBe("p0");
  expect(pinnedIds(messages)).toHaveLength(chatRules.maxPins);
  expect(pinnedIds(messages)[0]).toBe("new");
});

test("a line taken back is not among the pins", () => {
  const messages = unsendMessage([line("a", { pinned: 1 })], "a");
  expect(pinnedIds(messages)).toEqual([]);
});

test("taking a pin off leaves the others", () => {
  const { messages, dropped } = pinMessage(
    [line("a", { pinned: 1 }), line("b", { pinned: 2 })],
    "b",
    false
  );
  expect(dropped).toBeUndefined();
  expect(pinnedIds(messages)).toEqual(["a"]);
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

test("a settled poll is pinned, within the most pins", () => {
  const full = Array.from({ length: chatRules.maxPins }, (_, index) =>
    line(`p${index}`, { pinned: index + 1 })
  );
  const { messages, dropped } = decidePoll(
    [...full, poll()],
    "poll",
    "2026-10-03"
  );
  expect(dropped).toBe("p0");
  expect(pinnedIds(messages)).toHaveLength(chatRules.maxPins);
  expect(pinnedIds(messages)[0]).toBe("poll");
  expect(messages.at(-1)?.poll?.decided).toBe("2026-10-03");
});

test("settling a pinned poll again only moves its pin up", () => {
  const full = [
    poll({ pinned: 1 }),
    ...Array.from({ length: chatRules.maxPins - 1 }, (_, index) =>
      line(`p${index}`, { pinned: index + 2 })
    ),
  ];
  const { messages, dropped } = decidePoll(full, "poll", "2026-10-03");
  expect(dropped).toBeUndefined();
  expect(pinnedIds(messages)[0]).toBe("poll");
});

test("a reaction is added, joined and taken back", () => {
  const theirs = [line("a", { reactions: [{ by: ["yuki"], emoji: "👍" }] })];
  const joined = reactTo(theirs, "a", "👍");
  expect(joined[0].reactions).toEqual([{ by: ["yuki", "me"], emoji: "👍" }]);
  expect(reactTo(joined, "a", "👍")[0].reactions).toEqual(theirs[0].reactions);
  const mine = reactTo([line("a")], "a", "🎉");
  expect(reactTo(mine, "a", "🎉")[0].reactions).toEqual([]);
});

const page = {
  site: "cafe.example",
  title: "cafe",
  url: "https://cafe.example",
};
const other = { site: "b.example", title: "b", url: "https://b.example" };

test("an edit keeps its link's page while the link stays", () => {
  const [edited] = editMessage(
    [line("a", { link: page, text: "ここ https://cafe.example" })],
    "a",
    "ここどう？ https://cafe.example",
    other
  );
  expect(edited.edited).toBe(true);
  expect(edited.link).toBe(page);
});

test("an edit that changes the link takes the new page", () => {
  const [edited] = editMessage(
    [line("a", { link: page, text: "https://cafe.example" })],
    "a",
    "https://b.example",
    other
  );
  expect(edited.link).toBe(other);
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

test("the first unread line counts only the others' messages", () => {
  const messages = [
    line("a"),
    line("b"),
    line("notice", { from: "app", notice: "ゆきが参加しました" }),
    line("mine", { from: "me" }),
    line("c"),
  ];
  expect(firstUnreadOf(messages, 2)).toBe("b");
  expect(firstUnreadOf(messages, 0)).toBeUndefined();
});
