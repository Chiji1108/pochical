import { expect, test } from "bun:test";

import {
  dateKey,
  editedOwnDays,
  giveDaysToOrder,
  shownDays,
  withOrder,
  workedOutThrough,
} from "../src/lib/design-days";
import type { OwnDays, Schedule } from "../src/lib/design-days";

// How /design keeps a person's own days under a repeating order
// (spec/shift-patterns.md, Repeating orders): only what differs from the
// order, whatever screen made the change.
const planned = { "2026-10-01": "day", "2026-10-02": "day" };

const edit = (own: OwnDays, change: (shown: Schedule) => Schedule) => {
  const shown = shownDays(own, planned);
  return editedOwnDays(own, planned, shown, change(shown));
};

test("a memo on a day the order fills keeps no shift of its own", () => {
  const own = edit({}, (shown) => ({
    ...shown,
    "2026-10-01": { note: "棚卸し", shift: "day" },
  }));
  expect(own["2026-10-01"]).toEqual({ note: "棚卸し" });
});

test("another shift is kept, and clearing a day keeps an empty one", () => {
  const own = edit({}, (shown) => ({
    ...shown,
    "2026-10-01": { shift: "night" },
    "2026-10-02": undefined,
  }));
  expect(own["2026-10-01"]).toEqual({ shift: "night" });
  expect(own["2026-10-02"]).toEqual({ shift: "" });
});

test("entering the order's own shift again gives the day back to it", () => {
  const own = edit({ "2026-10-01": { shift: "night" } }, (shown) => ({
    ...shown,
    "2026-10-01": { shift: "day" },
  }));
  expect(own["2026-10-01"]).toBeUndefined();
});

test("days the edit did not touch stay as they were", () => {
  const before: OwnDays = { "2026-09-01": { note: "前の月" } };
  const own = edit(before, (shown) => ({
    ...shown,
    "2026-10-01": { shift: "night" },
  }));
  expect(own["2026-09-01"]).toBe(before["2026-09-01"]);
});

test("a new order takes shifts and times from its start, not memos", () => {
  const own = giveDaysToOrder(
    {
      "2026-09-30": { shift: "night" },
      "2026-10-01": { end: "20:00", note: "棚卸し", shift: "night" },
      "2026-10-02": { shift: "" },
    },
    new Date(2026, 9, 1)
  );
  expect(own).toEqual({
    "2026-09-30": { shift: "night" },
    "2026-10-01": { members: undefined, note: "棚卸し" },
  });
});

test("a new order starting earlier replaces the orders after it", () => {
  const first = { sequence: ["day"], start: new Date(2026, 0, 1) };
  const second = { sequence: ["night"], start: new Date(2026, 9, 1) };
  const backdated = { sequence: ["off"], start: new Date(2026, 5, 1) };
  expect(withOrder([first, second], backdated)).toEqual([first, backdated]);
});

test("days are worked out through the month in view, however far", () => {
  const today = new Date(2026, 8, 24);
  const far = new Date(2031, 0, 1);
  expect(dateKey(workedOutThrough([], today))).toBe("2028-09-30");
  expect(dateKey(workedOutThrough([], today, far))).toBe("2033-01-31");
});
