import { expect, test } from "vitest";

import {
  addDays,
  dateKey,
  initialDesignSchedule,
} from "../src/lib/design-days";
import { patternOn } from "../src/lib/design-group-data";
import { sampleChats, workplace } from "../src/lib/design-group-samples";
import { designToday } from "../src/lib/design-today";

// 職場のみんな's chat, as the site's top page shows it: the days put to
// the vote are days of the week ahead that the three are off, two at
// least, the sample person off on one of them too.
test("職場のみんな votes on days everyone is off", () => {
  const poll = sampleChats["workplace:group"]?.messages.at(-1)?.content;
  const days = poll?.kind === "poll" ? poll.days : [];
  expect(days.length).toBeGreaterThanOrEqual(2);
  for (const day of days) {
    expect(day > designToday && day <= addDays(designToday, 7)).toBe(true);
    for (const member of workplace()) {
      expect(patternOn(member, day)?.off).toBe(true);
    }
  }
  const own = initialDesignSchedule();
  expect(days.some((day) => own[dateKey(day)]?.shift === "off")).toBe(true);
});

// A night is followed by its 明け, for each of them, the round over.
test("職場のみんな's nights bring their 明け", () => {
  for (const member of workplace()) {
    for (let index = 0; index < 16; index += 1) {
      const day = addDays(designToday, index);
      if (member.shiftOn(day) === "night") {
        expect(member.shiftOn(addDays(day, 1))).toBe("after");
      }
    }
  }
});
