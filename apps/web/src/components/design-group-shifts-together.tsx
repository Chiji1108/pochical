import { ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import { useState } from "react";
import { css, cva } from "styled-system/css";

import {
  dateKey,
  formatDay,
  formatMonth,
  formatMonthFromToday,
  formatYearMonth,
  monthAfter,
} from "../lib/design-days";
import { designToday } from "../lib/design-today";
import type { Together } from "./design-group-data";
import { shiftsPage } from "./design-group-shifts-parts";
import { List, ListRow, SummaryRow, summaryRow } from "./design-list";
import { monthTitleOf, monthWithYearOf } from "./design-month-name";
import {
  monthIndex,
  RollingName,
  ShownWithPages,
  useTurn,
} from "./design-rolling";
import { Sheet, sheetBody, SheetHeading } from "./design-sheet";
import { srOnly } from "./design-ui";
import { holidayName, useWeek } from "./design-week";

// みんな休み: the days everyone in the group is off in a month, counted
// on the shift table and over each month of its list, and listed when
// pressed.

const COUNT = /^\d+$/u;

// What a month's みんな休み says: the number of days, or none.
function togetherValue({ days, unsure }: Together) {
  if (days.length > 0) {
    return String(days.length);
  }
  return unsure ? "未入力あり" : "なし";
}

// 1人ずつ's みんな休み, whose month turns with the pages: the month in its
// label and what it counts roll with a drag, as 今月のお休み does under
// the calendar, and a count's 日 and chevron leave with it toward a month
// of なし, which has nothing to open.
export function PagedTogether({
  month,
  together,
  beside,
  progress,
  swiped,
  onPickDay,
}: {
  month: Date;
  together: Together;
  beside: { previous: Together; next: Together };
  progress: MotionValue<number>;
  swiped: boolean;
  onPickDay: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const turn = useTurn(monthIndex(month), swiped);
  const monthOf = (by: number) => formatMonthFromToday(monthAfter(month, by));
  const label = `${monthOf(0)}のみんな休み`;
  const value = togetherValue(together);
  const counted = together.days.length > 0;
  const rolled = { progress, still: reduceMotion, turn };
  const withCount = {
    nextShown: beside.next.days.length > 0,
    previousShown: beside.previous.days.length > 0,
    progress,
    shown: counted,
    swiped,
  };
  const contents = (
    <>
      <span className={srOnly}>{label}</span>
      <span aria-hidden="true">
        <RollingName
          {...rolled}
          next={monthOf(1)}
          previous={monthOf(-1)}
          text={monthOf(0)}
        />
        のみんな休み
      </span>
      <span className={srOnly}>{counted ? `${value}日` : value}</span>
      <strong aria-hidden="true" className={summaryRow.count}>
        <RollingName
          {...rolled}
          end
          next={togetherValue(beside.next)}
          previous={togetherValue(beside.previous)}
          render={(text) =>
            COUNT.test(text) ? (
              text
            ) : (
              <span className={shiftsPage.togetherNone}>{text}</span>
            )
          }
          text={value}
        />
        <ShownWithPages {...withCount}>
          <span className={summaryRow.unit}>日</span>
        </ShownWithPages>
        <ShownWithPages {...withCount} className={shiftsPage.togetherChevron}>
          <ChevronRight
            aria-hidden="true"
            className={summaryRow.chevron}
            size={17}
          />
        </ShownWithPages>
      </strong>
    </>
  );
  if (!counted) {
    return <div className={summaryRow.row}>{contents}</div>;
  }
  return (
    <>
      <button
        aria-haspopup="dialog"
        className={summaryRow.row}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {contents}
      </button>
      <TogetherSheet
        days={together.days}
        label={label}
        onOpenChange={setOpen}
        onPickDay={onPickDay}
        open={open}
      />
    </>
  );
}

// A month's days everyone is off: how many, and the dates in a sheet to
// go to. None, it says so, or that days not entered yet leave it
// open.
function TogetherSummary({
  label,
  title = label,
  together: { days, unsure },
  onPickDay,
}: {
  label: string;
  // The sheet's title, when the row leaves the month to its heading.
  title?: string;
  together: Together;
  onPickDay: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  if (days.length === 0) {
    return (
      <div className={summaryRow.row}>
        <span>{label}</span>
        <span className={shiftsPage.togetherNone}>
          {unsure ? "未入力あり" : "なし"}
        </span>
      </div>
    );
  }
  return (
    <>
      <SummaryRow
        days={days.length}
        label={label}
        onOpen={() => {
          setOpen(true);
        }}
      />
      <TogetherSheet
        days={days}
        label={title}
        onOpenChange={setOpen}
        onPickDay={onPickDay}
        open={open}
      />
    </>
  );
}

// The days everyone is off in a month, a date to a row.
function TogetherSheet({
  label,
  days,
  open,
  onOpenChange,
  onPickDay,
}: {
  label: string;
  days: Date[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickDay: (date: Date) => void;
}) {
  return (
    <Sheet label={label} onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        onClose={() => {
          onOpenChange(false);
        }}
        title={label}
      />
      {/* Picking a date closes this and shows everyone that day. */}
      <div className={sheetBody}>
        <List>
          {days.map((date) => (
            <ListRow
              key={dateKey(date)}
              onClick={() => {
                onOpenChange(false);
                onPickDay(date);
              }}
              label={formatDay(date)}
              value={holidayName(date) ?? ""}
            />
          ))}
        </List>
      </div>
    </Sheet>
  );
}

const monthDivider = {
  name: css({ fontWeight: 700, margin: 0, textStyle: "title3" }),
  // Without みんな休み, a note on the name's line.
  note: css({ color: "text.tertiary", textStyle: "subheadline" }),
  root: cva({
    base: { display: "flex", flexDirection: "column", gap: "12px" },
    variants: {
      quiet: {
        true: { alignItems: "baseline", flexDirection: "row", gap: "12px" },
      },
    },
  }),
};

// The month's heading in the list of months, over the row of its days
// everyone is off, the row 1人ずつ has under its month, the whole width to
// press. Without any, a note beside the name says there are none, or that
// days not entered yet leave it open: no row that cannot be pressed.
export function MonthDivider({
  month,
  together,
  onPickDay,
}: {
  month: Date;
  together: Together;
  onPickDay: (date: Date) => void;
}) {
  const { english } = useWeek();
  const thisYear = month.getFullYear() === designToday.getFullYear();
  const name = thisYear ? formatMonth(month) : formatYearMonth(month);
  const title = `${
    thisYear && month.getMonth() === designToday.getMonth() ? "今月" : name
  }のみんな休み`;
  // In English as the month row over it writes it, said in 日本語 to
  // screen readers as the rest of the screen is.
  const heading = english ? (
    <h4 className={monthDivider.name}>
      <span className={srOnly}>{name}</span>
      <span aria-hidden="true">
        {thisYear ? monthTitleOf(month, true) : monthWithYearOf(month, true)}
      </span>
    </h4>
  ) : (
    <h4 className={monthDivider.name}>{name}</h4>
  );
  if (together.days.length === 0) {
    return (
      <div className={monthDivider.root({ quiet: true })}>
        {heading}
        <span className={monthDivider.note}>
          {together.unsure ? "未入力の日あり" : "みんな休みなし"}
        </span>
      </div>
    );
  }
  return (
    <div className={monthDivider.root()}>
      {heading}
      <TogetherSummary
        label="みんな休み"
        onPickDay={onPickDay}
        title={title}
        together={together}
      />
    </div>
  );
}
