// What a repeating order takes back from a person's own days
// (spec/sync-protocol.md, Repeating orders), as the native apps hide it
// while the orders' edit waits; the web syncs nothing itself, and
// spec/vectors/order-clears.json checks this against them.
import { compareClocks } from "./hlc";
import type { Clock } from "./hlc";

// The fields a day gives back to a new job's order: its shift and times.
const ORDER_FIELDS: ReadonlySet<string> = new Set(["PATTERN", "START", "END"]);

// Orders taken at `clock` that clear the days from `from`.
export type Floor = { from: string; clock: Clock };

// Whether a day's value, its field named as DayField is without the
// DAY_FIELD_ prefix, gives way to orders taken from `from` at `clock`: a
// shift or a time, on or after `from`, set before them.
export function givesWay(
  date: string,
  field: string,
  set: Clock,
  { clock, from }: Floor
): boolean {
  return (
    date >= from && ORDER_FIELDS.has(field) && compareClocks(set, clock) < 0
  );
}
