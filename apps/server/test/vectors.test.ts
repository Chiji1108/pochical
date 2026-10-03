import { syncLimits } from "@pochical/design/limits";
import { describe, expect, test } from "vitest";

// The cases every platform checks its own code against (spec/vectors).
import hlc from "../../../spec/vectors/hlc.json";
import orderClears from "../../../spec/vectors/order-clears.json";
import text from "../../../spec/vectors/text.json";
import { DayField } from "../src/gen/pochical/v1/sync_pb";
import { compareClocks, isAhead } from "../src/hlc";
import { givesWay, heldBackBy } from "../src/order-clears";
import { characterCount, isEmoji } from "../src/text-limits";

describe("spec/vectors/hlc.json", () => {
  test.each(hlc.compare)("$name", ({ a, b, expected }) => {
    expect(Math.sign(compareClocks(a, b))).toBe(expected);
  });

  test.each(hlc.ahead)("$name", ({ now, pastLimitMs, expected }) => {
    const ms = now + syncLimits.clockAheadMs + pastLimitMs;
    expect(isAhead({ counter: 0, device: "phone", ms }, now)).toBe(expected);
  });
});

// The server holds text to the limits with its own count, and marks to
// one emoji, which must be the apps'.
describe("spec/vectors/text.json", () => {
  test.each(text.characterCount)("$name", ({ text: written, expected }) => {
    expect(characterCount(written)).toBe(expected);
  });

  test.each(text.isEmoji)("isEmoji: $name", ({ text: written, expected }) => {
    expect(isEmoji(written)).toBe(expected);
  });
});

// The vectors name fields as DayField does, without DAY_FIELD_.
const FIELDS: Record<string, DayField | undefined> = {
  END: DayField.END,
  NOTE: DayField.NOTE,
  PATTERN: DayField.PATTERN,
  PEOPLE: DayField.PEOPLE,
  START: DayField.START,
};
const fieldOf = (name: string): DayField =>
  FIELDS[name] ?? DayField.UNSPECIFIED;

describe("spec/vectors/order-clears.json", () => {
  test.each(orderClears.givesWay)(
    "gives way: $name",
    ({ date, expected, field, floor, set }) => {
      expect(givesWay(date, fieldOf(field), set, floor)).toBe(expected);
    }
  );

  test.each(orderClears.heldBackBy)(
    "held back: $name",
    ({ date, expected, field, floors, set }) => {
      expect(heldBackBy(floors, date, fieldOf(field), set)?.from ?? null).toBe(
        expected
      );
    }
  );
});
