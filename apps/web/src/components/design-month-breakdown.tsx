import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { css, cva } from "styled-system/css";

import { dateKey, formatYearMonth } from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import type { Shift } from "../lib/design-patterns";
import type { Coworker } from "../lib/design-user-store";
import { monthWithYearOf } from "./design-month-name";
import { Sheet, SheetHeading, sheetBody } from "./design-sheet";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import { ShiftMark } from "./shift-mark";

// Someone from 一緒に働く人 whose days the calendar shows, picked in
// 今月の内訳: the other days fade, and the summary under the month counts
// theirs in place of the days off. Someone deleted since lets it go.
export function useShownWith(
  coworkers: readonly Coworker[],
  schedule: Schedule
) {
  const [picked, setPicked] = useState<string>();
  const person = coworkers.find(({ id }) => id === picked);
  const isWith = (id: string, date: Date) =>
    schedule[dateKey(date)]?.people?.includes(id) ?? false;
  return {
    // How many of `days` the person shown is on.
    countIn: (days: Date[]) =>
      person === undefined
        ? 0
        : days.filter((date) => isWith(person.id, date)).length,
    // Whether a day fades: someone is shown and not on it.
    fades: (date: Date) => person !== undefined && !isWith(person.id, date),
    // Who is on any of `days`, with how many, in the order of 一緒に働く人.
    peopleIn: (days: Date[]) =>
      coworkers
        .map(({ id, name }) => ({
          count: days.filter((date) => isWith(id, date)).length,
          id,
          name,
        }))
        .filter(({ count }) => count > 0),
    person,
    show: setPicked,
  };
}

// 今月の内訳: how many days of each pattern and how many still blank,
// the month's length, then who is on its days. Pressing someone shows
// their days, and pressing the one shown lets them go.
export function BreakdownSheet({
  month,
  counts,
  unfilled,
  days,
  people,
  shownWith,
  open,
  onOpenChange,
  onShow,
}: {
  month: Date;
  counts: { key: Shift; label: string; count: number }[];
  unfilled: number;
  // How many days the month has.
  days: number;
  people: { id: string; name: string; count: number }[];
  // The id of the person whose days are shown.
  shownWith: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShow: (id: string | undefined) => void;
}) {
  const { english } = useWeek();
  return (
    <Sheet label="今月の内訳" onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        eyebrow={
          // In English as the カレンダー page's 月と曜日 asks, said in
          // 日本語 to screen readers as the rest of the sheet is.
          english ? (
            <>
              <span className={srOnly}>{formatYearMonth(month)}</span>
              <span aria-hidden="true">{monthWithYearOf(month, true)}</span>
            </>
          ) : (
            formatYearMonth(month)
          )
        }
        onClose={() => {
          onOpenChange(false);
        }}
        title="今月の内訳"
      />
      <div className={sheetBody}>
        <dl className={breakdown.list}>
          {counts.map(({ key, label, count }) => (
            <div className={breakdown.row()} key={key}>
              <dt className={breakdown.name}>
                <ShiftMark shift={key} size={18} />
                {label}
              </dt>
              <dd className={breakdown.count}>
                {count}
                <span className={breakdown.unit}>日</span>
              </dd>
            </div>
          ))}
          <div className={breakdown.row({ unfilled: true })}>
            <dt className={breakdown.name}>未入力</dt>
            <dd className={breakdown.count}>
              {unfilled}
              <span className={breakdown.unit}>日</span>
            </dd>
          </div>
        </dl>
        <p className={breakdown.total}>この月は全{days}日</p>
        {people.length > 0 && (
          <section>
            <h3 className={breakdown.heading}>一緒に働く人</h3>
            <ul className={breakdown.list}>
              {people.map(({ id, name, count }) => (
                <li key={id}>
                  <button
                    aria-pressed={id === shownWith}
                    className={breakdown.row({ pressable: true })}
                    onClick={() => {
                      onShow(id === shownWith ? undefined : id);
                    }}
                    type="button"
                  >
                    <span className={breakdown.name}>
                      {id === shownWith && (
                        <Check aria-hidden="true" size={18} />
                      )}
                      {name}
                    </span>
                    <span className={breakdown.count}>
                      {count}
                      <span className={breakdown.unit}>日</span>
                      <ChevronRight
                        aria-hidden="true"
                        className={breakdown.chevron}
                        size={17}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}

// 今月の内訳: a row for each pattern and one for the days still blank,
// with the month's length under them. With many patterns they scroll
// under the heading, which stays with its ×.
const breakdown = {
  count: css({
    color: "accent.default",
    fontWeight: 600,
    margin: 0,
    textStyle: "title3",
  }),
  chevron: css({
    color: "text.quaternary",
    marginLeft: "8px",
    verticalAlign: "-2px",
  }),
  // 一緒に働く人, under the month's total.
  heading: css({
    color: "text.tertiary",
    fontWeight: 600,
    margin: "28px 0 0",
    textStyle: "subheadline",
  }),
  list: css({ listStyle: "none", margin: 0, padding: 0 }),
  name: css({
    "& > span": { fontSize: "24px" },
    alignItems: "center",
    display: "flex",
    gap: "12px",
    textStyle: "body",
  }),
  row: cva({
    base: {
      alignItems: "center",
      borderBottom: "1px solid token(colors.separator)",
      display: "flex",
      justifyContent: "space-between",
      minHeight: "52px",
    },
    variants: {
      unfilled: { true: { color: "text.tertiary" } },
      // Someone's row: pressed, the calendar shows their days.
      pressable: {
        true: {
          bg: "transparent",
          borderInline: 0,
          borderTop: 0,
          color: "text.primary",
          cursor: "pointer",
          paddingInline: 0,
          width: "100%",
        },
      },
    },
  }),
  total: css({
    color: "text.tertiary",
    // 20px under the list, with the scrolling part's 12px gap.
    margin: "8px 0 0",
    textAlign: "center",
    textStyle: "footnote",
  }),
  unit: css({ fontWeight: 400, marginLeft: "8px", textStyle: "footnote" }),
};
