import { describe, expect, test } from "bun:test";

import { widgetRules } from "@pochical/design/widgets";

// The cases every platform checks its own code against (spec/vectors);
// the native apps' tests read the same files.
import chatText from "../../../spec/vectors/chat-text.json";
import chatMessages from "../../../spec/vectors/chat.json";
import entering from "../../../spec/vectors/entering.json";
import hlc from "../../../spec/vectors/hlc.json";
import localEdits from "../../../spec/vectors/local-edits.json";
import ownDays from "../../../spec/vectors/own-days.json";
import patternChanges from "../../../spec/vectors/patterns.json";
import reconnect from "../../../spec/vectors/reconnect.json";
import repeat from "../../../spec/vectors/repeat.json";
import review from "../../../spec/vectors/review.json";
import text from "../../../spec/vectors/text.json";
import timeChange from "../../../spec/vectors/time-change.json";
import together from "../../../spec/vectors/together.json";
import unread from "../../../spec/vectors/unread.json";
import widgets from "../../../spec/vectors/widgets.json";
import {
  chatKey,
  groupsUnread,
  togetherIn,
} from "../src/components/design-group-data";
import type {
  Chat,
  Member,
  Message,
} from "../src/components/design-group-data";
import { defaultWeekSettings } from "../src/components/design-week";
import {
  decidePoll,
  editMessage,
  firstUnreadOf,
  pinMessage,
  pinsOf,
  unsendMessage,
} from "../src/lib/chat-messages";
import {
  inviteCodeOf,
  mentionsOf,
  plainText,
  siteOf,
  textParts,
  withMentions,
} from "../src/lib/chat-text";
import {
  addDays,
  dateKey,
  dayMilliseconds,
  daysMovedOn,
  daysWithout,
  defaultHolidaysOff,
  editedOwnDays,
  gapDaysIn,
  giveDaysToOrder,
  holidayShiftOf,
  patternsWithout,
  plannedShifts,
  repeatSchedule,
  selectedAfter,
  shownDays,
  timeChangeOf,
  withOrder,
  withShiftEntered,
} from "../src/lib/design-days";
import type { OwnDays, Schedule } from "../src/lib/design-days";
import { patternsForJob } from "../src/lib/design-patterns";
import type { Pattern, PatternBook } from "../src/lib/design-patterns";
import { widgetEntry } from "../src/lib/design-widgets";
import type {
  WidgetCompanion,
  WidgetPerson,
  WidgetPersonDay,
} from "../src/lib/design-widgets";
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
  const ruleOf = (order: { sequence: string[]; start: string }) => ({
    sequence: order.sequence,
    start: dayOf(order.start),
  });
  for (const { name, orders, order, expected } of repeat.added) {
    test(name, () => {
      expect(withOrder(orders.map(ruleOf), ruleOf(order))).toEqual(
        expected.map(ruleOf)
      );
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

// What a value holds once undefined fields drop away, as JSON writes it.
const plain = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, field]) =>
        field === undefined ? [] : [[key, plain(field)]]
      )
    );
  }
  return value;
};

const bookOfVectors = (patterns: readonly Partial<Pattern>[]): PatternBook =>
  Object.fromEntries(
    patterns.map((pattern) => [pattern.id ?? "", patternOf(pattern)] as const)
  );

describe("spec/vectors/entering.json", () => {
  for (const {
    name,
    patterns,
    days,
    date,
    shift,
    expected,
    selects,
  } of entering.enter) {
    test(name, () => {
      const book = bookOfVectors(patterns);
      const entered = shift ?? undefined;
      const after = withShiftEntered(
        days as Schedule,
        dayOf(date),
        entered,
        book
      );
      expect(plain(after)).toEqual(expected);
      expect(
        dateKey(selectedAfter(dayOf(date), daysMovedOn(entered, book)))
      ).toBe(selects);
    });
  }
  for (const { name, days, month, expected } of entering.gaps) {
    test(name, () => {
      const schedule: Schedule = Object.fromEntries(
        days.map((date) => [date, { shift: "day" }])
      );
      const gaps = gapDaysIn(schedule, dayOf(`${month}-01`)).map(dateKey);
      expect(gaps).toEqual(expected);
    });
  }
});

describe("spec/vectors/together.json", () => {
  const off = { id: "off", off: true } as Member["patterns"][number];
  const work = { id: "work", off: false } as Member["patterns"][number];
  for (const { name, members, from, to, expected } of together.together) {
    test(name, () => {
      const group = members.map((member, index): Member => ({
        id: `member-${index}`,
        name: `member-${index}`,
        patterns: [off, work],
        shiftOn: (date) =>
          (member.days as Record<string, string | undefined>)[dateKey(date)],
      }));
      const dates: Date[] = [];
      for (
        let date = dayOf(from);
        dateKey(date) <= to;
        date = addDays(date, 1)
      ) {
        dates.push(date);
      }
      const found = togetherIn(group, dates);
      expect({ days: found.days.map(dateKey), unsure: found.unsure }).toEqual(
        expected
      );
    });
  }
});

describe("spec/vectors/patterns.json", () => {
  const idsOf = (patterns: readonly Pattern[]) =>
    plain(patterns.map(({ id, nextDay }) => ({ id, nextDay })));
  for (const { name, patterns, own, id, expected } of patternChanges.deleted) {
    test(name, () => {
      expect(idsOf(patternsWithout(patterns.map(patternOf), id))).toEqual(
        expected.patterns
      );
      expect(plain(daysWithout(own as OwnDays, id))).toEqual(expected.own);
    });
  }
  for (const { name, ...job } of patternChanges.newJob) {
    test(name, () => {
      let fresh = 0;
      const changed = patternsForJob({
        incoming: (job.incoming as unknown as Partial<Pattern>[]).map(
          patternOf
        ),
        newId: () => {
          fresh += 1;
          return `new-${fresh}`;
        },
        own: (job.own as unknown as Partial<Pattern>[]).map(patternOf),
        sequence: job.sequence,
        usedBefore: (patternId) =>
          (job.usedBefore as string[]).includes(patternId),
      });
      expect(idsOf(changed.patterns)).toEqual(job.expected.patterns);
      expect(changed.sequence).toEqual(job.expected.sequence);
    });
  }
});

describe("spec/vectors/own-days.json", () => {
  for (const { name, own, edits, expected, ...days } of ownDays.edited) {
    test(name, () => {
      const planned = days.planned as Record<string, string>;
      const shown = shownDays(own as OwnDays, planned);
      const next: Schedule = { ...shown };
      for (const [date, entry] of Object.entries(edits)) {
        next[date] = (entry ?? undefined) as Schedule[string];
      }
      const edited = editedOwnDays(own as OwnDays, planned, shown, next);
      expect(plain(edited)).toEqual(expected);
    });
  }
  for (const { name, own, start, expected } of ownDays.givenToOrder) {
    test(name, () => {
      expect(plain(giveDaysToOrder(own as OwnDays, dayOf(start)))).toEqual(
        expected
      );
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

// A chat line with only what the logic reads.
const line = (id: string, more: Partial<Message> = {}): Message => ({
  from: "yuki",
  id,
  time: "10:00",
  when: "今日",
  ...more,
});

describe("spec/vectors/chat.json", () => {
  type Step = Partial<Record<"pin" | "unpin" | "unsend" | "settle", string>>;
  const takeStep = (messages: Message[], step: Step) => {
    if (step.pin !== undefined) {
      return pinMessage(messages, step.pin, true);
    }
    if (step.unpin !== undefined) {
      return pinMessage(messages, step.unpin, false);
    }
    if (step.unsend !== undefined) {
      return { messages: unsendMessage(messages, step.unsend) };
    }
    if (step.settle !== undefined) {
      return decidePoll(messages, step.settle, "2026-10-03");
    }
    throw new Error(`Unknown step ${JSON.stringify(step)}`);
  };
  for (const { name, lines, pins, expected, ...pinCase } of chatMessages.pins) {
    test(name, () => {
      const step = pinCase.step as Step;
      const messages = lines.map((id) => {
        const pinnedAt = pins.indexOf(id);
        return line(id, {
          pinned: pinnedAt === -1 ? undefined : pins.length - pinnedAt,
          poll:
            id === step.settle
              ? { days: [dayOf("2026-10-03")], votes: {} }
              : undefined,
        });
      });
      const after = takeStep(messages, step);
      expect({
        dropped: after.dropped ?? null,
        pins: pinsOf(after.messages).map(({ id }) => id),
      }).toEqual(expected);
    });
  }
  for (const { name, text: words, edit, expected } of chatMessages.edited) {
    test(name, () => {
      const page = { site: "old", title: "old", url: "old" };
      const fresh = { site: "new", title: "new", url: "new" };
      const [edited] = editMessage(
        [line("a", { link: page, text: words })],
        "a",
        edit,
        fresh
      );
      expect(edited?.link === page ? "kept" : "new").toBe(expected);
    });
  }
  for (const {
    name,
    lines,
    unread: count,
    expected,
  } of chatMessages.firstUnread) {
    test(name, () => {
      const messages = lines.map((who, index) =>
        line(String(index), {
          from: who === "others" ? "yuki" : who,
          notice: who === "app" ? "ゆきが参加しました" : undefined,
        })
      );
      const first = firstUnreadOf(messages, count);
      expect(first === undefined ? null : Number(first)).toBe(expected);
    });
  }
});

describe("spec/vectors/widgets.json", () => {
  // A Monday with no holiday near it.
  const today = dayOf("2026-10-05");
  for (const { name, expected, ...day } of widgets.day) {
    test(name, () => {
      const time = day.time as [string, string] | null;
      const entry = widgetEntry(
        {
          [dateKey(today)]: {
            end: "end" in day ? day.end : undefined,
            shift: "shift",
            start: "start" in day ? day.start : undefined,
          },
        },
        defaultWeekSettings,
        today,
        { shift: patternOf(time ? { id: "shift", time } : { id: "shift" }) }
      );
      expect({
        change: entry.today.change ?? null,
        time: entry.today.time ?? null,
      }).toEqual(expected);
    });
  }

  type Days = { days: Record<string, string | null>; rest?: string };
  // What one has on a day, by how many days from today it is.
  const shiftOn = ({ days, rest }: Days, inDays: number) =>
    String(inDays) in days ? days[String(inDays)] : rest;
  const book: PatternBook = {
    off: patternOf({ countsAsOff: true, id: "off" }),
    work: patternOf({ id: "work" }),
  };
  const daysFrom = (date: Date) =>
    Math.round((date.getTime() - today.getTime()) / dayMilliseconds);
  for (const { name, expected, ...offs } of widgets.offs) {
    test(name, () => {
      const mine = offs.me as Days;
      const schedule: Schedule = {};
      for (
        let inDays = 0;
        inDays <= widgetRules.offLookaheadDays + 1;
        inDays += 1
      ) {
        const shift = shiftOn(mine, inDays);
        if (shift) {
          schedule[dateKey(addDays(today, inDays))] = { shift };
        }
      }
      const people = offs.with.map((one): WidgetPerson => ({
        dayOn: (date) => {
          const shift = shiftOn(one as Days, daysFrom(date));
          return shift
            ? ({ off: shift === "off" } as WidgetPersonDay)
            : undefined;
        },
        name: one.name,
      }));
      const [only] = people;
      let companion: WidgetCompanion | undefined;
      if (people.length > 1) {
        companion = {
          kind: "group",
          mark: { emoji: "🍉", kind: "emoji" },
          name: "group",
          people,
        };
      } else if (only) {
        companion = { kind: "person", person: only };
      }
      const entry = widgetEntry(schedule, defaultWeekSettings, today, book, {
        companion,
      });
      expect({
        next: entry.offs.next?.inDays ?? null,
        none: entry.offs.none ?? null,
        today: entry.offs.today,
      }).toEqual(expected);
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
