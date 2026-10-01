import { textLimits } from "@pochical/design/limits";

import { DayField } from "./gen/pochical/v1/sync_pb";
import type { DayValue } from "./gen/pochical/v1/sync_pb";
import { characterCount } from "./text-limits";

// What a day's field may hold (spec/sync-protocol.md, Shifts), checked as
// the owner's edits arrive.

const DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
// Pattern ids and device ids are the apps' own, so only kept short.
const MAX_ID_LENGTH = 64;

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
]);

/** A field the server keeps, by its number. */
export const isDayField = (field: number): field is DayField =>
  KEPT_FIELDS.has(field);

const isId = (text: string): boolean =>
  text !== "" && text.length <= MAX_ID_LENGTH;

// What a set value of each field must be.
const fits: Record<DayField, (value: string) => boolean> = {
  [DayField.UNSPECIFIED]: () => false,
  [DayField.PATTERN]: isId,
  [DayField.START]: (value) => TIME.test(value),
  [DayField.END]: (value) => TIME.test(value),
  [DayField.NOTE]: (value) => characterCount(value) <= textLimits.dayNote,
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
