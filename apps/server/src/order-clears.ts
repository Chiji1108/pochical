import { DayField } from "./gen/pochical/v1/sync_pb";
import { compareClocks } from "./hlc";
import type { Clock } from "./hlc";

// What a repeating order takes back from a user's own days
// (spec/sync-protocol.md, Repeating orders; spec/vectors/order-clears.json).
// Devices hold the same rules.

/** The fields a day gives back to a new or corrected order. */
export const ORDER_FIELDS: readonly DayField[] = [
  DayField.PATTERN,
  DayField.START,
  DayField.END,
];

/** Orders taken at `clock` that cleared the days from `from`. */
export type Floor = { from: string; clock: Clock };

/**
 * Whether a stored value of a day gives way to orders taken from `from`
 * at `clock`: a pattern or a time, on or after `from`, set before them.
 */
export const givesWay = (
  date: string,
  field: DayField,
  set: Clock,
  { clock, from }: Floor
): boolean =>
  date >= from && ORDER_FIELDS.includes(field) && compareClocks(set, clock) < 0;

/**
 * Whether an edit reaching the server late was made before orders that
 * cleared its day: it would bring back what they took, so it is corrected
 * instead, as one that does not fit.
 */
export const belowFloor = (
  floors: readonly Floor[],
  date: string,
  field: DayField,
  set: Clock
): boolean => floors.some((floor) => givesWay(date, field, set, floor));
