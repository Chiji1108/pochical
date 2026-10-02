import { DayField } from "./gen/pochical/v1/sync_pb";
import { compareClocks } from "./hlc";
import type { Clock } from "./hlc";

// What a repeating order takes back from a user's own days
// (spec/sync-protocol.md, Repeating orders; spec/vectors/order-clears.json).
// Devices apply givesWay when they start or correct an order themselves.

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
 * The clear an edit reaching the server late was made before, if any: it
 * would bring back what the orders took, so the server answers it with the
 * clear instead, under the clear's own clock, which outranks the edit and
 * nothing the device did after the orders. The newest such clear when
 * several apply. Only the server keeps clears, so only it holds edits back.
 */
export const heldBackBy = (
  floors: readonly Floor[],
  date: string,
  field: DayField,
  set: Clock
): Floor | undefined =>
  floors
    .filter((floor) => givesWay(date, field, set, floor))
    .toSorted((a, b) => compareClocks(b.clock, a.clock))[0];
