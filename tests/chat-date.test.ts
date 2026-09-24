import { expect, test } from "bun:test";
import { formatChatDate } from "../src/components/chat/chat-date";

const now = new Date(2026, 8, 24, 13, 22);

test("chat dates use Japanese order and relative labels", () => {
  expect(formatChatDate(new Date(2026, 8, 24, 0, 1), now)).toBe("今日");
  expect(formatChatDate(new Date(2026, 8, 23, 23, 10), now)).toBe("昨日");
  expect(formatChatDate(new Date(2026, 8, 22).getTime(), now)).toBe("9月22日");
  expect(formatChatDate(new Date(2025, 8, 23), now)).toBe("2025年9月23日");
  expect(formatChatDate(new Date(2026, 8, 25), now)).toBe("9月25日");
});

test("yesterday remains relative across month and year boundaries", () => {
  expect(
    formatChatDate(new Date(2026, 7, 31, 23, 59), new Date(2026, 8, 1, 0, 1))
  ).toBe("昨日");
  expect(formatChatDate(new Date(2025, 11, 31), new Date(2026, 0, 1))).toBe(
    "昨日"
  );
});
