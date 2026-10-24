import { describe, expect, test } from "bun:test";

import { iconSections } from "@pochical/design/mark-icon-names";
import type { IconSection } from "@pochical/design/mark-icon-names";
import { characterCount } from "@pochical/design/text";
import { widgetRules } from "@pochical/design/widgets";
import { rgbaToThumbHash, thumbHashToRGBA } from "thumbhash";

// The cases every platform checks its own code against (spec/vectors);
// the native apps' tests read the same files.
import chatText from "../../../spec/vectors/chat-text.json";
import chatMessages from "../../../spec/vectors/chat.json";
import entering from "../../../spec/vectors/entering.json";
import groupVectors from "../../../spec/vectors/groups.json";
import hlc from "../../../spec/vectors/hlc.json";
import localEdits from "../../../spec/vectors/local-edits.json";
import monthWeeks from "../../../spec/vectors/month.json";
import ownDays from "../../../spec/vectors/own-days.json";
import patternChanges from "../../../spec/vectors/patterns.json";
import periods from "../../../spec/vectors/periods.json";
import reconnect from "../../../spec/vectors/reconnect.json";
import repeat from "../../../spec/vectors/repeat.json";
import review from "../../../spec/vectors/review.json";
import text from "../../../spec/vectors/text.json";
import thumbHashes from "../../../spec/vectors/thumbhash.json";
import timeChange from "../../../spec/vectors/time-change.json";
import together from "../../../spec/vectors/together.json";
import unread from "../../../spec/vectors/unread.json";
import widgets from "../../../spec/vectors/widgets.json";
import { bytesOf } from "../src/components/design-chat-photos";
import { memberLine } from "../src/components/design-group-join";
import {
  guessGroupMark,
  nextGroupColor,
} from "../src/components/design-group-settings";
import { iconsMatching } from "../src/components/design-icon-picker";
import { pageSummaryOf } from "../src/components/design-month-breakdown";
import { periodTitleOf } from "../src/components/design-month-name";
import {
  defaultWeekSettings,
  monthDatesFrom,
  periodDatesFrom,
} from "../src/components/design-week";
import { guessLook, nextColor } from "../src/components/shift-mark";
import {
  albumRows,
  answering,
  changing,
  chatOrder,
  decidePoll,
  editMessage,
  firstUnreadOf,
  keptDraft,
  pinMessage,
  pinsOf,
  sharing,
  stopping,
  unsendMessage,
  writingOf,
} from "../src/lib/chat-messages";
import type { Writing } from "../src/lib/chat-messages";
import {
  firstLink,
  inviteCodeOf,
  largeEmojiCount,
  mentionQuery,
  mentionsOf,
  pickingMention,
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
  defaultHolidaysOff,
  editedOwnDays,
  gapDaysIn,
  giveDaysToOrder,
  holidayChoiceOf,
  holidayShiftOf,
  patternsWithout,
  plannedShifts,
  refusesArchiving,
  repeatSchedule,
  repeatsPattern,
  selectedAfter,
  shownDays,
  timeChangeOf,
  withOrder,
  withOrderPut,
  withoutOrder,
  withShiftEntered,
  formatPeriod,
  formatPeriodInFull,
  formatPeriodWithYear,
  monthAfter,
  periodHolding,
  daysOfPeriod,
  periodOf,
} from "../src/lib/design-days";
import type { OwnDays, Period, Schedule } from "../src/lib/design-days";
import {
  chatKey,
  groupsUnread,
  togetherIn,
} from "../src/lib/design-group-data";
import type {
  Chat,
  DraftTarget,
  GroupMark,
  Member,
  Message,
  MessageContent,
} from "../src/lib/design-group-data";
import {
  patternsForJob,
  presetList,
  presetPatterns,
} from "../src/lib/design-patterns";
import type {
  Pattern,
  PatternBook,
  PresetShift,
} from "../src/lib/design-patterns";
import {
  columnHours,
  widgetEntry,
  withoutWholeHours,
} from "../src/lib/design-widgets";
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
import {
  dayName,
  isEmoji,
  limitText,
  markLetter,
} from "../src/lib/text-limits";

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
      const shown = Object.entries(
        shownDays(days.own as OwnDays, planned, new Set(days.patterns))
      )
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
  for (const { name, patterns, expected, ...rest } of repeat.holidayShift) {
    const picked = "picked" in rest ? rest.picked : undefined;
    test(name, () => {
      expect(holidayShiftOf(patterns.map(patternOf), picked) ?? null).toBe(
        expected
      );
    });
  }
  for (const {
    name,
    patterns,
    on,
    expected,
    ...rest
  } of repeat.holidayChoice) {
    const kept = "kept" in rest ? rest.kept : undefined;
    const picked = "picked" in rest ? rest.picked : undefined;
    test(name, () => {
      const { shift, ...choice } = holidayChoiceOf(
        patterns.map(patternOf),
        on,
        kept,
        picked
      );
      expect({ ...choice, shift: shift ?? null }).toStrictEqual(expected);
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
  for (const { name, orders, order, expected, ...rest } of repeat.put) {
    const replacing = "replacing" in rest ? dayOf(rest.replacing) : undefined;
    test(name, () => {
      expect(
        withOrderPut(orders.map(ruleOf), ruleOf(order), replacing)
      ).toEqual(expected.map(ruleOf));
    });
  }
  for (const { name, orders, start, expected } of repeat.removed) {
    test(name, () => {
      expect(withoutOrder(orders.map(ruleOf), dayOf(start))).toEqual(
        expected.map(ruleOf)
      );
    });
  }
});

describe("spec/vectors/month.json", () => {
  for (const { name, month, weekStart, expected } of monthWeeks.weeks) {
    test(name, () => {
      const days = monthDatesFrom(dayOf(`${month}-01`), weekStart).map(dateKey);
      expect({
        first: days.at(0),
        last: days.at(-1),
        weeks: days.length / 7,
      }).toEqual(expected);
    });
  }
  for (const vector of monthWeeks.summary) {
    test(vector.name, () => {
      const patterns = vector.patterns.map((pattern) => ({
        ...patternOf({}),
        ...pattern,
      }));
      const schedule = Object.fromEntries(
        Object.entries(vector.shown).map(([key, shift]) => [key, { shift }])
      );
      const pageDays = daysOfPeriod({
        first: dayOf(vector.first),
        last: dayOf(vector.last),
      });
      const summary = pageSummaryOf(pageDays, schedule, patterns);
      expect({
        counts: summary.counts.map(({ days, pattern }) => ({
          days,
          id: pattern.id,
        })),
        daysOff: summary.daysOff,
        unfilled: summary.unfilled,
      }).toEqual(vector.expected);
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
  for (const { name, before, after, limit, expected } of text.markLetter) {
    test(`markLetter: ${name}`, () => {
      expect(markLetter(before, after, limit)).toBe(expected);
    });
  }
  test("dayName", () => {
    for (const { name, length, expected } of text.dayName) {
      expect(dayName(name, length)).toBe(expected);
    }
  });
  for (const { name, text: written, expected } of text.isEmoji) {
    test(`isEmoji: ${name}`, () => {
      expect(isEmoji(written)).toBe(expected);
    });
  }
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
  for (const { name, text: draft, expected, picked } of chatText.mentionQuery) {
    test(`mentionQuery: ${name}`, () => {
      expect(mentionQuery(draft) ?? null).toBe(expected);
      expect(pickingMention(draft, "あや")).toBe(picked);
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
  for (const { name, text: message, expected } of chatText.largeEmoji) {
    test(`largeEmoji: ${name}`, () => {
      expect(largeEmojiCount(message)).toBe(expected);
    });
  }
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

const iconsOf = (sections: readonly IconSection[]) =>
  sections.flatMap((section) => section.icons);

const bookOfVectors = (patterns: readonly Partial<Pattern>[]): PatternBook =>
  Object.fromEntries(
    patterns.map((pattern) => [pattern.id ?? "", patternOf(pattern)] as const)
  );

const periodOfVector = ([first, last]: readonly string[]): Period => ({
  first: dayOf(first ?? ""),
  last: dayOf(last ?? ""),
});
const keysOf = ({ first, last }: Period) => [dateKey(first), dateKey(last)];

describe("spec/vectors/periods.json", () => {
  for (const { name, start, day, expected } of periods.containing) {
    test(name, () => {
      expect(keysOf(periodHolding(dayOf(day), start))).toEqual(expected);
    });
  }
  for (const { name, start, page, by, expected } of periods.stepped) {
    test(name, () => {
      const month = monthAfter(periodOfVector(page).first, by);
      expect(keysOf(periodOf(month, start))).toEqual(expected);
    });
  }
  for (const { name, start, month, expected } of periods.picked) {
    test(name, () => {
      expect(keysOf(periodOf(dayOf(`${month}-01`), start))).toEqual(expected);
    });
  }
  for (const { name, weekStart, page, expected } of periods.weeks) {
    test(name, () => {
      const dates = periodDatesFrom(periodOfVector(page), weekStart);
      expect({
        first: dateKey(dates[0] ?? new Date(Number.NaN)),
        last: dateKey(dates.at(-1) ?? new Date(Number.NaN)),
        weeks: dates.length / 7,
      }).toEqual(expected);
    });
  }
  for (const { name, period, short, year, full, english } of periods.written) {
    test(name, () => {
      const written = periodOfVector(period);
      expect(formatPeriod(written)).toBe(short);
      expect(formatPeriodWithYear(written)).toBe(year);
      expect(formatPeriodInFull(written)).toBe(full);
      expect(periodTitleOf(written, true)).toBe(english);
    });
  }
});

describe("spec/vectors/entering.json", () => {
  for (const {
    name,
    patterns,
    days,
    date,
    shift,
    expected,
    selects,
    ...vector
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
      // The page is the date's month unless the vector names a period.
      const last =
        "page" in vector
          ? dayOf(vector.page[1])
          : periodOf(dayOf(date), 1).last;
      expect(
        dateKey(selectedAfter(dayOf(date), daysMovedOn(entered, book), last))
      ).toBe(selects);
    });
  }
  for (const { name, days, page, expected } of entering.gaps) {
    test(name, () => {
      const schedule: Schedule = Object.fromEntries(
        days.map((date) => [date, { shift: "day" }])
      );
      const gaps = gapDaysIn(schedule, periodOfVector(page)).map(dateKey);
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

const isPreset = (id: string): id is PresetShift => id in presetPatterns;

// A vector's mark: its kind, and its color when it is drawn in one.
function groupMarkOf({
  kind,
  color = 0,
}: {
  kind: string;
  color?: number;
}): GroupMark {
  if (kind === "icon") {
    return { color, icon: "house", kind };
  }
  if (kind === "letter") {
    return { color, kind, text: "家" };
  }
  return kind === "photo"
    ? { kind, photo: "photo" }
    : { emoji: "🏠", kind: "emoji" };
}

describe("spec/vectors/groups.json", () => {
  for (const { name, marks, expected } of groupVectors.nextGroupColor) {
    test(`nextGroupColor: ${name}`, () => {
      expect(nextGroupColor(marks.map(groupMarkOf))).toBe(expected);
    });
  }
});

describe("spec/vectors/patterns.json", () => {
  const idsOf = (patterns: readonly Pattern[]) =>
    plain(
      patterns.map(({ id, nextDay, archived }) => ({
        archived: archived === true ? true : undefined,
        id,
        nextDay,
      }))
    );
  for (const {
    name,
    orders,
    today,
    id,
    archived,
    expected,
  } of patternChanges.refused) {
    test(name, () => {
      const rules = orders.map((order) => ({
        ...order,
        start: dayOf(order.start),
      }));
      expect({
        archiving: refusesArchiving(rules, id, archived, dayOf(today)),
        deleting: repeatsPattern(rules, id, dayOf(today)),
      }).toEqual(expected);
    });
  }
  for (const { name, patterns, id, expected } of patternChanges.deleted) {
    test(name, () => {
      expect(idsOf(patternsWithout(patterns.map(patternOf), id))).toEqual(
        expected.patterns
      );
    });
  }
  for (const { name, text: written, expected } of patternChanges.guessLook) {
    test(`guessLook: ${name}`, () => {
      expect(guessLook(written)).toEqual(expected);
    });
  }
  for (const { name, used, expected } of patternChanges.nextColor) {
    test(`nextColor: ${name}`, () => {
      expect(nextColor(used)).toBe(expected);
    });
  }
  for (const { name, query, expected } of patternChanges.iconSearch) {
    test(`iconSearch: ${name}`, () => {
      expect(iconsOf(iconsMatching(query))).toEqual(
        expected ?? iconsOf(iconSections)
      );
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
  for (const { name, ids, keeping, expected } of patternChanges.readyCopies) {
    test(`readyCopies: ${name}`, () => {
      const presets = ids.filter(isPreset);
      expect(presets).toEqual(ids);
      const copies = presetList(
        presets,
        keeping === undefined ? undefined : new Set(keeping)
      );
      expect(idsOf(copies)).toEqual(expected);
    });
  }
});

describe("spec/vectors/groups.json", () => {
  for (const {
    name,
    text: written,
    color,
    expected,
  } of groupVectors.guessMark) {
    test(`guessMark: ${name}`, () => {
      expect(guessGroupMark(written, color)).toEqual(
        "emoji" in expected
          ? { emoji: expected.emoji, kind: "emoji" }
          : { color: expected.color, kind: "letter", text: expected.letter }
      );
    });
  }
  for (const { name, names, expected } of groupVectors.memberLine) {
    test(`memberLine: ${name}`, () => {
      expect(memberLine(names)).toBe(expected);
    });
  }
});

describe("spec/vectors/own-days.json", () => {
  for (const { name, own, edits, expected, ...days } of ownDays.edited) {
    test(name, () => {
      const planned = days.planned as Record<string, string>;
      // Every pattern these days name is the person's.
      const known = new Set([
        ...Object.values(planned),
        ...Object.values(own as OwnDays).flatMap((day) => day?.shift ?? []),
      ]);
      const shown = shownDays(own as OwnDays, planned, known);
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
              content: { kind: "words", text: words },
              from: "yuki",
              id: `line-${index}`,
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
        return line(
          id,
          id === step.settle
            ? { days: [dayOf("2026-10-03")], kind: "poll", votes: {} }
            : { kind: "words", text: "" },
          { pinned: pinnedAt === -1 ? undefined : pins.length - pinnedAt }
        );
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
        [line("a", { kind: "words", link: page, text: words })],
        "a",
        edit,
        fresh
      );
      const kept =
        edited?.content.kind === "words" && edited.content.link === page;
      expect(kept ? "kept" : "new").toBe(expected);
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
        line(
          String(index),
          who === "app"
            ? { kind: "notice", text: "ゆきが参加しました" }
            : { kind: "words", text: "" },
          { from: who === "others" ? "yuki" : who }
        )
      );
      const first = firstUnreadOf(messages, count);
      expect(first === undefined ? null : Number(first)).toBe(expected);
    });
  }
  for (const { name, draft, lines, expected } of chatMessages.draft) {
    test(name, () => {
      const messages = lines.map((one) =>
        line(
          String(one.seq),
          "text" in one ? { kind: "words", text: one.text } : { kind: "unsent" }
        )
      );
      // The vectors keep the target as two seqs, at most one of them set.
      let target: DraftTarget | undefined;
      if ("editing" in draft) {
        target = { id: String(draft.editing), kind: "edit" };
      } else if ("replyTo" in draft) {
        target = { id: String(draft.replyTo), kind: "reply" };
      }
      const kept = keptDraft({ target, text: draft.text }, messages);
      expect(
        kept && {
          editing:
            kept.target?.kind === "edit" ? Number(kept.target.id) : undefined,
          replyTo:
            kept.target?.kind === "reply" ? Number(kept.target.id) : undefined,
          text: kept.text,
        }
      ).toEqual(expected ?? undefined);
    });
  }
  // The composer as the vectors keep it: its words as sent, the target as
  // two seqs, how many photos, and whether × took its link's page off.
  type Held = {
    text: string;
    replyTo?: number;
    editing?: number;
    days?: string[];
    photos?: number;
    withoutPreview?: boolean;
  };
  const mentionName = (id: string) => (id === "u2" ? "ゆき" : id);
  const writingFrom = (held: Held): Writing => {
    let target: DraftTarget | undefined;
    if (held.editing !== undefined) {
      target = { id: String(held.editing), kind: "edit" };
    } else if (held.replyTo !== undefined) {
      target = { id: String(held.replyTo), kind: "reply" };
    }
    return {
      ...writingOf(held.text, mentionName, target),
      days: held.days?.map(dayOf),
      photos: Array.from({ length: held.photos ?? 0 }, (_, index) => ({
        height: 1,
        src: String(index),
        width: 1,
      })),
      withoutPreview:
        held.withoutPreview === true ? firstLink(held.text) : undefined,
    };
  };
  const heldOf = (writing: Writing): Held => {
    const sent = withMentions(writing.words, writing.picked);
    return {
      days: writing.days?.map(dateKey),
      editing:
        writing.target?.kind === "edit" ? Number(writing.target.id) : undefined,
      photos: writing.photos.length > 0 ? writing.photos.length : undefined,
      replyTo:
        writing.target?.kind === "reply"
          ? Number(writing.target.id)
          : undefined,
      text: sent,
      withoutPreview:
        writing.withoutPreview !== undefined &&
        writing.withoutPreview === firstLink(sent)
          ? true
          : undefined,
    };
  };
  for (const {
    name,
    composer,
    step,
    lines,
    expected,
  } of chatMessages.composer) {
    test(name, () => {
      const before = writingFrom(composer);
      let after: Writing;
      if ("reply" in step) {
        after = answering(before, String(step.reply));
      } else if ("edit" in step) {
        const edited = lines.find((one) => one.seq === step.edit);
        if (!(edited && "text" in edited)) {
          throw new Error(`no words at ${step.edit}`);
        }
        after = changing(
          line(String(step.edit), { kind: "words", text: edited.text }),
          mentionName
        );
      } else if ("share" in step) {
        after = sharing(before, step.share.map(dayOf));
      } else {
        after = stopping(before);
      }
      expect(heldOf(after)).toEqual(expected);
    });
  }
  for (const { name, count, expected } of chatMessages.albumRows) {
    test(name, () => {
      expect(albumRows(count)).toEqual(expected);
    });
  }
  for (const { name, sent, waiting, expected } of chatMessages.order) {
    test(name, () => {
      expect(chatOrder(sent, waiting)).toEqual(expected);
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
      // A column says only what changed, as the widget's words do.
      const column =
        entry.today.change === undefined ? undefined : columnHours(entry.today);
      expect({
        change: entry.today.change ?? null,
        column: column ?? null,
        columnShort: column === undefined ? null : withoutWholeHours(column),
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

describe("spec/vectors/widgets.json いまのシフト", () => {
  // A Monday with no holiday near it, as the other widget vectors.
  const monday = dayOf("2026-10-05");
  const book: PatternBook = {
    after: patternOf({ id: "after" }),
    day: patternOf({ id: "day", time: ["09:00", "18:00"] }),
    duty: patternOf({ id: "duty", time: ["08:30", "08:30"] }),
    night: patternOf({ id: "night", time: ["16:30", "09:30"] }),
    off: patternOf({ countsAsOff: true, id: "off" }),
    offDuty: patternOf({ id: "offDuty" }),
  };
  const at = (inDays: number, clock: string) => {
    const [hours = 0, minutes = 0] = clock.split(":").map(Number);
    const day = addDays(monday, inDays);
    day.setHours(hours, minutes, 0, 0);
    return day;
  };
  // [start offset, start, end offset, end] as the vectors write a span.
  const written = (span?: { start: Date; end: Date }) => {
    if (!span) {
      return null;
    }
    const clock = (date: Date) =>
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const offset = (date: Date) =>
      Math.round(
        (new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        ).getTime() -
          monday.getTime()) /
          dayMilliseconds
      );
    return [
      offset(span.start),
      clock(span.start),
      offset(span.end),
      clock(span.end),
    ];
  };
  for (const { name, expected, ...now } of widgets.now) {
    test(name, () => {
      const schedule: Schedule = {};
      const days: Record<string, { shift: string; start?: string }> = now.days;
      for (const [inDays, day] of Object.entries(days)) {
        schedule[dateKey(addDays(monday, Number(inDays)))] = {
          shift: day.shift,
          start: day.start,
        };
      }
      const entry = widgetEntry(
        schedule,
        defaultWeekSettings,
        at(0, now.at),
        book
      );
      const refresh = written({
        end: entry.now.refresh,
        start: entry.now.refresh,
      });
      expect({
        next: written(entry.now.next),
        nextInDays: entry.now.nextInDays ?? null,
        on: written(entry.now.on),
        refresh: refresh && [refresh[0], refresh[1]],
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

describe("spec/vectors/thumbhash.json", () => {
  for (const { name, width, height, rgba, thumbHash } of thumbHashes.encode) {
    test(name, () => {
      expect(rgbaToThumbHash(width, height, bytesOf(rgba))).toEqual(
        bytesOf(thumbHash)
      );
    });
  }
  for (const { name, thumbHash, width, height, rgba } of thumbHashes.decode) {
    test(`${name}, drawn`, () => {
      const drawn = thumbHashToRGBA(bytesOf(thumbHash));
      expect([drawn.w, drawn.h]).toEqual([width, height]);
      const expected = bytesOf(rgba);
      expect(
        drawn.rgba.every(
          (value, index) => Math.abs(value - (expected[index] ?? 0)) <= 1
        )
      ).toBe(true);
    });
  }
});
