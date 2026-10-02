import { expect, test } from "bun:test";

import { dateKey, workedOutThrough } from "../src/lib/design-days";

// How far /design works out a person's days. What their own days keep
// under a repeating order is pinned for every platform in
// spec/vectors/own-days.json and spec/vectors/repeat.json.
test("days are worked out through the month in view, however far", () => {
  const today = new Date(2026, 8, 24);
  const far = new Date(2031, 0, 1);
  expect(dateKey(workedOutThrough([], today))).toBe("2028-09-30");
  expect(dateKey(workedOutThrough([], today, far))).toBe("2033-01-31");
});
