// A group's end (spec/sync-protocol.md, A group's end;
// spec/vectors/group-end.json): one moment for everyone, picked and shown
// as a day by each device's own clock. Days are YYYY-MM-DD, as a date
// input gives them.

import { designToday } from "./design-today";

const pad = (part: number): string => String(part).padStart(2, "0");

/** A date's day by this device's clock. */
export const dayOf = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The prototype's today, as a day. */
export const today = dayOf(designToday);

/** A month after the prototype's today: where a new end's picker starts. */
export const aMonthOn = dayOf(
  new Date(
    designToday.getFullYear(),
    designToday.getMonth() + 1,
    designToday.getDate()
  )
);

const partsOf = (day: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return { date, month, year };
};

/**
 * The moment the end date `day` ends on this device, in ms since the
 * epoch: the first moment of the day after it by its clock.
 */
export const endsAt = (day: string): number => {
  const { year, month, date } = partsOf(day);
  return new Date(year, month - 1, date + 1).getTime();
};

/**
 * The day this device shows for a group ending at `ms`: the day the
 * moment just before it falls on by its clock.
 */
export const endDay = (ms: number): string => dayOf(new Date(ms - 1));

/**
 * How an end date is said, 12月31日, with its year when that is not the
 * year of `on`, the device's own day.
 */
export const endWords = (day: string, on: string): string => {
  const { year, month, date } = partsOf(day);
  const monthDay = `${month}月${date}日`;
  return year === partsOf(on).year ? monthDay : `${year}年${monthDay}`;
};

/** What the chat says of a group's end, `day` being the day it shows. */
export type EndNotice =
  | { kind: "endSet"; by: string; day: string }
  | { kind: "endCleared"; by: string }
  | { kind: "endsSoon"; day: string };

/** The chat's line of a group's end, as this device words it on the day `on`. */
export const endNotice = (notice: EndNotice, on: string): string => {
  if (notice.kind === "endCleared") {
    return `${notice.by}が終了日を解除しました`;
  }
  const day = endWords(notice.day, on);
  return notice.kind === "endSet"
    ? `${notice.by}が終了日を${day}に設定しました`
    : `このグループは${day}に終了し、チャットや写真も消えます`;
};

/** The note under a group's end, where it is set and where it shows. */
export const endNote =
  "終了日を過ぎると、このグループはメンバー全員から消えます。";
