import { css, cva } from "@pochical/styled-system/css";
import type { MotionValue } from "motion/react";
import { Fragment } from "react";

import {
  formatMonth,
  formatPeriodInFull,
  formatSlash,
  formatYearMonth,
  monthAfter,
  periodOf,
} from "../lib/design-days";
import type { Period } from "../lib/design-days";
import { useSettings } from "../lib/design-settings-store";
import { useReducedMotion } from "../lib/device-media";
import { monthIndex, RollingName, useTurn } from "./design-rolling";
import { srOnly } from "./design-ui";

// The months as the heading writes them in English, lower case and cut
// short like a diary's.
const englishMonths = [
  "jan.",
  "feb.",
  "mar.",
  "apr.",
  "may",
  "jun.",
  "jul.",
  "aug.",
  "sep.",
  "oct.",
  "nov.",
  "dec.",
] as const;

export function englishMonthOf(month: Date) {
  return englishMonths[month.getMonth()];
}

// Everywhere else the months are written as other apps write them: in
// full over a list or a picker, short where room is tight. The diary's
// lower case suits only the heading's large type; set small it reads as
// a slip.
const fullMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// A month heading a list or a picker, as the カレンダー page's 月と曜日
// asks: 9月, or September in English.
export function monthTitleOf(month: Date, english = false) {
  return english ? fullMonths[month.getMonth()] : formatMonth(month);
}

// The same with its year: 2026年9月, or September 2026.
export function monthWithYearOf(month: Date, english = false) {
  return english
    ? `${monthTitleOf(month, true)} ${month.getFullYear()}`
    : formatYearMonth(month);
}

// A period titling a picture of it (spec/calendar.md, The shift period):
// 2026年10月15日〜11月14日, or Oct 15 – Nov 14, 2026 in English, each
// day's year with it when the period runs into the next.
export function periodTitleOf(period: Period, english = false) {
  if (!english) {
    return formatPeriodInFull(period);
  }
  const { first, last } = period;
  const dayOf = (date: Date) =>
    `${shortMonths[date.getMonth()]} ${date.getDate()}`;
  return first.getFullYear() === last.getFullYear()
    ? `${dayOf(first)} – ${dayOf(last)}, ${last.getFullYear()}`
    : `${dayOf(first)}, ${first.getFullYear()} – ${dayOf(last)}, ${last.getFullYear()}`;
}

// A month where room is tight, as on a button among twelve or in a
// table's corner: 9月, or Sep.
export function shortMonthOf(month: Date, english = false) {
  return english ? shortMonths[month.getMonth()] : formatMonth(month);
}

// The year over the month's name, as the calendar's heading draws it:
// 9月, or sep. as the カレンダー page's 月と曜日 asks, said as 2026年9月 to
// screen readers either way. The カレンダー page's preview draws it too.
// While the pages are dragged (`progress`, -1 to 1 toward the next
// month), the name follows the finger to the month coming in; a month
// changed otherwise, as by 今月 or the sheet, rolls to it the way it
// went. Either way each rolls within its own line, never over the year,
// and the year rolls only when it changes. With reduced motion it just
// changes.
export function MonthName({
  month,
  period,
  progress,
  swiped = false,
  beside: besideMonths,
}: {
  month: Date;
  // A シフトの期間's page, named by its days (spec/calendar.md, The shift
  // period): its first large, 10/15, its last after it as small as 月,
  // 〜11/14, with the year of each over them.
  period?: Period;
  progress?: MotionValue<number>;
  // Turned by a swipe, which has already brought the new name in.
  swiped?: boolean;
  // What the pages beside show, when not the months before and after, as
  // the week view's weeks.
  beside?: { previous: Date; next: Date };
}) {
  const style = useSettings((state) => state.device.monthName);
  const reduceMotion = useReducedMotion();
  const turn = useTurn(monthIndex(month), swiped);
  const english = style === "english";
  const previous = besideMonths?.previous ?? monthAfter(month, -1);
  const next = besideMonths?.next ?? monthAfter(month, 1);
  const periodStart = period?.first.getDate() ?? 1;
  const periodAt = (date: Date) => periodOf(date, periodStart);
  const dayOf = (date: Date) =>
    english ? `${englishMonthOf(date)} ${date.getDate()}` : formatSlash(date);
  const nameOf = (date: Date) => {
    if (period) {
      return dayOf(periodAt(date).first);
    }
    return english ? englishMonthOf(date) : String(date.getMonth() + 1);
  };
  const endOf = (date: Date) =>
    `${english ? " – " : "〜"}${dayOf(periodAt(date).last)}`;
  const yearOf = (date: Date) => {
    if (!period) {
      return String(date.getFullYear());
    }
    const { first, last } = periodAt(date);
    return first.getFullYear() === last.getFullYear()
      ? String(first.getFullYear())
      : `${first.getFullYear()} – ${last.getFullYear()}`;
  };
  const beside = (of: (date: Date) => string) =>
    progress ? { next: of(next), previous: of(previous) } : {};
  return (
    <>
      <span className={srOnly}>
        {period ? formatPeriodInFull(period) : formatYearMonth(month)}
      </span>
      <span aria-hidden="true" className={monthName.year({ lower: english })}>
        <RollingName
          {...beside(yearOf)}
          progress={progress}
          still={reduceMotion}
          text={yearOf(month)}
          turn={turn}
        />
      </span>
      <strong aria-hidden="true" className={monthName.month}>
        {/* A new piece for the other 月と曜日, so switching it does not
            roll as a turn would. */}
        <Fragment key={style}>
          <RollingName
            {...beside(nameOf)}
            letters={english}
            progress={progress}
            still={reduceMotion}
            text={nameOf(month)}
            turn={turn}
          />
          {period ? (
            <span className={monthName.unit}>
              <RollingName
                {...beside(endOf)}
                letters={english}
                progress={progress}
                still={reduceMotion}
                text={endOf(month)}
                turn={turn}
              />
            </span>
          ) : null}
          {english || period ? null : (
            <span className={monthName.unit}>月</span>
          )}
        </Fragment>
      </strong>
    </>
  );
}

const monthName = {
  month: css({ fontSize: "36px", fontWeight: 600, lineHeight: 1.1 }),
  unit: css({ fontSize: "14px", fontWeight: 500, marginLeft: "4px" }),
  // Lower case stands about 0.2em shorter than the digits, 7px at 36px,
  // so the year comes down that much, leaving the same room over the
  // letters as over 9月. Moved only where it is drawn, so the heading
  // keeps its height and nothing under it moves with the choice.
  year: cva({
    base: {
      color: "text.tertiary",
      display: "block",
      fontSize: "11px",
      marginBottom: "4px",
    },
    variants: { lower: { true: { position: "relative", top: "7px" } } },
  }),
};
