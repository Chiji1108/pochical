import { useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import { Fragment } from "react";
import { css, cva } from "styled-system/css";

import { useSettings } from "../lib/design-settings-store";
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
  progress,
  swiped = false,
  beside: besideMonths,
}: {
  month: Date;
  progress?: MotionValue<number>;
  // Turned by a swipe, which has already brought the new name in.
  swiped?: boolean;
  // What the pages beside show, when not the months before and after, as
  // the week view's weeks.
  beside?: { previous: Date; next: Date };
}) {
  const style = useSettings((state) => state.device.monthName);
  const reduceMotion = useReducedMotion() ?? false;
  const turn = useTurn(monthIndex(month), swiped);
  const english = style === "english";
  const previous =
    besideMonths?.previous ??
    new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const next =
    besideMonths?.next ??
    new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const nameOf = (date: Date) =>
    english ? englishMonthOf(date) : String(date.getMonth() + 1);
  const yearOf = (date: Date) => String(date.getFullYear());
  const beside = (of: (date: Date) => string) =>
    progress ? { next: of(next), previous: of(previous) } : {};
  return (
    <>
      <span className={srOnly}>
        {month.getFullYear()}年{month.getMonth() + 1}月
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
          {english ? null : <span className={monthName.unit}>月</span>}
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
