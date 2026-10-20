import { expect, test } from "bun:test";

import {
  daysOfMonth,
  formatDay,
  formatMonthFromToday,
  formatYearMonth,
  formatYearMonthDay,
  isSameMonth,
  monthAfter,
} from "../src/lib/design-days";
import { designToday } from "../src/lib/design-today";

// The small date helpers the /design screens share (lib/design-days.ts).

test("a month after goes over the year's end, both ways", () => {
  expect(monthAfter(new Date(2026, 11, 31), 1)).toEqual(new Date(2027, 0, 1));
  expect(monthAfter(new Date(2026, 0, 15), -1)).toEqual(new Date(2025, 11, 1));
  expect(monthAfter(new Date(2026, 8, 24), 0)).toEqual(new Date(2026, 8, 1));
});

test("the same month is the same month of the same year", () => {
  expect(isSameMonth(new Date(2026, 8, 1), new Date(2026, 8, 30))).toBe(true);
  expect(isSameMonth(new Date(2026, 8, 1), new Date(2025, 8, 1))).toBe(false);
});

test("a month's days run from the 1st to its last, leap years too", () => {
  expect(daysOfMonth(new Date(2026, 8, 24))).toHaveLength(30);
  expect(daysOfMonth(new Date(2028, 1, 1))).toHaveLength(29);
  expect(daysOfMonth(new Date(2026, 1, 1)).at(-1)).toEqual(
    new Date(2026, 1, 28)
  );
});

test("dates read as Japanese sentences write them", () => {
  const day = new Date(2026, 8, 27);
  expect(formatYearMonth(day)).toBe("2026年9月");
  expect(formatYearMonthDay(day)).toBe("2026年9月27日");
  expect(formatDay(day)).toBe("9月27日(日)");
  expect(formatMonthFromToday(designToday)).toBe("今月");
  expect(formatMonthFromToday(monthAfter(designToday, 1))).toBe("10月");
  expect(formatMonthFromToday(new Date(2025, 8, 1))).toBe("9月");
});
