import { describe, expect, test } from "bun:test";

// The cases every platform checks its own code against (spec/vectors);
// the native apps' tests read the same files.
import chatText from "../../../spec/vectors/chat-text.json";
import repeat from "../../../spec/vectors/repeat.json";
import text from "../../../spec/vectors/text.json";
import timeChange from "../../../spec/vectors/time-change.json";
import {
  inviteCodeOf,
  mentionsOf,
  plainText,
  siteOf,
  textParts,
  withMentions,
} from "../src/lib/chat-text";
import {
  defaultHolidaysOff,
  holidayShiftOf,
  plannedShifts,
  repeatSchedule,
  shownDays,
  timeChangeOf,
} from "../src/lib/design-days";
import type { OwnDays } from "../src/lib/design-days";
import type { Pattern, PatternBook } from "../src/lib/design-patterns";
import { characterCount, dayName, limitText } from "../src/lib/text-limits";

const dayOf = (key: string) => {
  const [year = 0, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

// Only what the logic reads of a pattern.
const patternOf = (fields: Partial<Pattern>) => fields as Pattern;

describe("spec/vectors/repeat.json", () => {
  for (const { name, ...order } of repeat.schedule) {
    test(name, () => {
      // The web knows only Japan's holidays.
      expect("holidays" in order ? order.holidays : "JP").toBe("JP");
      const days = repeatSchedule(
        order.sequence,
        dayOf(order.anchor),
        dayOf(order.from),
        dayOf(order.to),
        "holidayShift" in order ? order.holidayShift : undefined
      );
      const shifts = Object.fromEntries(
        Object.entries(days).map(([date, entry]) => [date, entry?.shift])
      );
      expect(shifts).toEqual(order.expected);
    });
  }
  for (const { name, ...days } of repeat.shown) {
    test(name, () => {
      const rules = days.orders.map((order) => ({
        ...order,
        anchor: "anchor" in order ? dayOf(order.anchor) : undefined,
        start: dayOf(order.start),
      }));
      const planned = plannedShifts(
        rules,
        new Set(days.patterns),
        dayOf(days.to)
      );
      const shown = Object.entries(shownDays(days.own as OwnDays, planned))
        .filter(([date]) => date >= days.from && date <= days.to)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([date, entry]) => [date, entry?.shift]);
      expect(Object.fromEntries(shown)).toEqual(days.expected);
    });
  }
  for (const { name, ...order } of repeat.holidaysOffByDefault) {
    test(name, () => {
      const book: PatternBook = Object.fromEntries(
        order.sequence.map((id) => [
          id,
          patternOf({ countsAsOff: order.daysOff.includes(id), id }),
        ])
      );
      expect(defaultHolidaysOff(order.sequence, dayOf(order.start), book)).toBe(
        order.expected
      );
    });
  }
  for (const { name, patterns, expected } of repeat.holidayShift) {
    test(name, () => {
      expect(holidayShiftOf(patterns.map(patternOf)) ?? null).toBe(expected);
    });
  }
});

describe("spec/vectors/time-change.json", () => {
  for (const { name, ...day } of timeChange.cases) {
    test(name, () => {
      const entry = {
        end: "end" in day ? day.end : undefined,
        shift: "shift",
        start: "start" in day ? day.start : undefined,
      };
      const time = day.time as [string, string] | null;
      const pattern = patternOf(time ? { time } : {});
      expect(timeChangeOf(entry, pattern) ?? null).toEqual(day.expected);
    });
  }
});

describe("spec/vectors/text.json", () => {
  for (const { name, text: written, expected } of text.characterCount) {
    test(name, () => {
      expect(characterCount(written)).toBe(expected);
    });
  }
  test("limitText", () => {
    for (const { text: written, limit, expected } of text.limitText) {
      expect(limitText(written, limit)).toBe(expected);
    }
  });
  test("dayName", () => {
    for (const { name, length, expected } of text.dayName) {
      expect(dayName(name, length)).toBe(expected);
    }
  });
});

describe("spec/vectors/chat-text.json", () => {
  for (const { name, text: message, expected } of chatText.textParts) {
    test(name, () => {
      expect(textParts(message)).toEqual(expected);
    });
  }
  test("mentions", () => {
    for (const { text: message, expected } of chatText.mentions) {
      expect(mentionsOf(message)).toEqual(expected);
    }
  });
  test("plainText", () => {
    for (const { text: message, names, expected } of chatText.plainText) {
      const nameOf = (id: string) =>
        (names as Record<string, string | undefined>)[id] ?? "";
      expect(plainText(message, nameOf)).toBe(expected);
    }
  });
  for (const {
    name,
    text: message,
    picked,
    expected,
  } of chatText.withMentions) {
    test(name, () => {
      expect(withMentions(message, picked)).toBe(expected);
    });
  }
  test("inviteCode", () => {
    for (const { url, expected } of chatText.inviteCode) {
      expect(inviteCodeOf(url) ?? null).toBe(expected);
    }
  });
  test("site", () => {
    for (const { url, expected } of chatText.site) {
      expect(siteOf(url)).toBe(expected);
    }
  });
});
