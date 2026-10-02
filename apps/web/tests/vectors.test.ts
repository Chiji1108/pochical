import { describe, expect, test } from "bun:test";

// The cases every platform checks its own code against (spec/vectors);
// the native apps' tests read the same files.
import chatText from "../../../spec/vectors/chat-text.json";
import hlc from "../../../spec/vectors/hlc.json";
import localEdits from "../../../spec/vectors/local-edits.json";
import reconnect from "../../../spec/vectors/reconnect.json";
import repeat from "../../../spec/vectors/repeat.json";
import review from "../../../spec/vectors/review.json";
import text from "../../../spec/vectors/text.json";
import timeChange from "../../../spec/vectors/time-change.json";
import unread from "../../../spec/vectors/unread.json";
import { chatKey, groupsUnread } from "../src/components/design-group-data";
import type { Chat } from "../src/components/design-group-data";
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
import { clockOffset, receive, tick } from "../src/lib/hlc";
import { noValue, shownValue, takeEvent } from "../src/lib/local-edits";
import type { LocalEvent } from "../src/lib/local-edits";
import { reconnectWaitMost } from "../src/lib/reconnect";
import { mayAskForReview, openedOn } from "../src/lib/review";
import type { ReviewHistory } from "../src/lib/review";
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

describe("spec/vectors/review.json", () => {
  for (const {
    name,
    opened,
    version,
    troubled,
    expected,
    ...rest
  } of review.mayAsk) {
    test(name, () => {
      let history: ReviewHistory | undefined;
      for (const day of opened) {
        history = openedOn(history, day);
      }
      const today = opened.at(-1);
      if (history === undefined || today === undefined) {
        throw new Error(`${name} opens the app on no day`);
      }
      const lastAsked = "lastAsked" in rest ? rest.lastAsked : undefined;
      expect(
        mayAskForReview({
          history: { ...history, lastAsked },
          today,
          troubled,
          version,
        })
      ).toBe(expected);
    });
  }
});

describe("spec/vectors/unread.json", () => {
  for (const {
    name,
    mentionsWhenMuted,
    groups,
    expected,
  } of unread.notifying) {
    test(name, () => {
      const chats: Record<string, Chat> = {};
      const summaries = groups.map((group, groupIndex) => {
        const id = `group-${groupIndex}`;
        const mutedChats: string[] = [];
        for (const [chatIndex, chat] of group.chats.entries()) {
          const chatId = `chat-${chatIndex}`;
          if (chat.muted) {
            mutedChats.push(chatId);
          }
          chats[chatKey(id, chatId)] = {
            messages: [...chat.read, ...chat.unread].map((words, index) => ({
              from: "yuki",
              id: `line-${index}`,
              text: words,
              time: "10:00",
              when: "今日",
            })),
            unread: chat.unread.length,
          };
        }
        return { id, mutedChats };
      });
      expect(groupsUnread(chats, summaries, mentionsWhenMuted)).toBe(expected);
    });
  }
});

describe("spec/vectors/hlc.json", () => {
  for (const { name, last, now, expected } of hlc.tick) {
    test(name, () => {
      expect(tick(last, now)).toEqual(expected);
    });
  }
  for (const { name, last, remote, expected } of hlc.receive) {
    test(name, () => {
      expect(receive(last, remote)).toEqual(expected);
    });
  }
  for (const { name, expected, ...times } of hlc.offset) {
    test(name, () => {
      expect(clockOffset(times)).toBe(expected);
    });
  }
});

describe("spec/vectors/local-edits.json", () => {
  for (const { name, steps } of localEdits.cases) {
    test(name, () => {
      let state = noValue;
      for (const { shows, ...event } of steps) {
        state = takeEvent(state, event as LocalEvent);
        expect(shownValue(state)).toBe(shows);
      }
    });
  }
});

describe("spec/vectors/reconnect.json", () => {
  for (const { name, tries, firstMs, mostMs, expected } of reconnect.waitMost) {
    test(name, () => {
      expect(reconnectWaitMost(tries, firstMs, mostMs)).toBe(expected);
    });
  }
});
