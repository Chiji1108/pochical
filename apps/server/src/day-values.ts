import { dayRules } from "@pochical/design/days";
import { syncLimits, textLimits } from "@pochical/design/limits";

import { DayField } from "./gen/pochical/v1/sync_pb";
import type { DayValue } from "./gen/pochical/v1/sync_pb";
import { isId } from "./ids";
import { characterCount } from "./text-limits";

// What a day's field may hold (spec/sync-protocol.md, Shifts), checked as
// the owner's edits arrive.

const DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** Whether the text is a real calendar day written "YYYY-MM-DD". */
export const isDate = (text: string): boolean => {
  const parts = DATE.exec(text)?.groups;
  if (parts === undefined) {
    return false;
  }
  const [year, month, day] = [parts.year, parts.month, parts.day].map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
};

// The fields the server keeps.
const KEPT_FIELDS: ReadonlySet<number> = new Set([
  DayField.PATTERN,
  DayField.START,
  DayField.END,
  DayField.NOTE,
  DayField.PEOPLE,
]);

/** A field the server keeps, by its number. */
export const isDayField = (field: number): field is DayField =>
  KEPT_FIELDS.has(field);

/**
 * The fields groups see of a member's day: its pattern and times. Named
 * rather than the private ones left out, so a field added later stays
 * with its owner until it is put here.
 */
export const SHARED_DAY_FIELDS: readonly DayField[] = [
  DayField.PATTERN,
  DayField.START,
  DayField.END,
];

// A day's people: coworker ids separated by single spaces, each once.
const isPeople = (value: string): boolean => {
  const ids = value.split(" ");
  return (
    ids.length <= syncLimits.peopleADay &&
    new Set(ids).size === ids.length &&
    ids.every((id) => isId(id))
  );
};

// What a set value of each field must be.
const fits: Record<DayField, (value: string) => boolean> = {
  [DayField.UNSPECIFIED]: () => false,
  // A day cleared on purpose has no shift, whatever its repeating order.
  [DayField.PATTERN]: (value) => value === dayRules.noShift || isId(value),
  [DayField.START]: (value) => TIME.test(value),
  [DayField.END]: (value) => TIME.test(value),
  [DayField.NOTE]: (value) => characterCount(value) <= textLimits.dayNote,
  [DayField.PEOPLE]: isPeople,
};

/** Whether a set value fits its field; clearing always does. */
export const fitsField = (
  field: DayField,
  value: string | undefined
): boolean => value === undefined || fits[field](value);

/**
 * Whether the edit names a day and field the server can keep, with a
 * clock: one that does not cannot be applied or corrected, only
 * acknowledged.
 */
export const hasKey = (value: DayValue | undefined): value is DayValue =>
  value !== undefined &&
  isDate(value.date) &&
  isDayField(value.field) &&
  value.hlc !== undefined &&
  isId(value.hlc.deviceId);
