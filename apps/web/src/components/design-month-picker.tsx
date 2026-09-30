import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";

import { designToday } from "../lib/design-today";
import { Sheet, SheetHeading } from "./design-sheet";

// Where a month is chosen from its name, as Google Calendar's title opens
// a small calendar: a year with its arrows, as a picker keeps them, and
// its twelve months. The month shown is filled, this month outlined.
export function MonthChoiceSheet({
  open,
  onOpenChange,
  month,
  first,
  last,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The month on screen, which the sheet opens on.
  month: Date;
  // The months there are, when the screen's list has ends.
  first?: Date;
  last?: Date;
  onPick: (month: Date) => void;
}) {
  const outside = (target: Date) =>
    (first !== undefined && target.getTime() < first.getTime()) ||
    (last !== undefined && target.getTime() > last.getTime());
  const [year, setYear] = useState(month.getFullYear());
  // Each opening starts from the year on screen, however the sheet is
  // opened and wherever the months have moved since.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setYear(month.getFullYear());
    }
  }
  const change = (next: boolean) => {
    onOpenChange(next);
  };
  return (
    <Sheet label="月を選ぶ" onOpenChange={change} open={open}>
      <SheetHeading
        onClose={() => {
          change(false);
        }}
        title="月を選ぶ"
      />
      <div className={monthChoice.year}>
        <button
          aria-label="前の年"
          className={monthChoice.step}
          disabled={first !== undefined && year <= first.getFullYear()}
          onClick={() => {
            setYear(year - 1);
          }}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <strong aria-live="polite">{year}年</strong>
        <button
          aria-label="次の年"
          className={monthChoice.step}
          disabled={last !== undefined && year >= last.getFullYear()}
          onClick={() => {
            setYear(year + 1);
          }}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <div className={monthChoice.grid}>
        {Array.from({ length: 12 }, (_, index) => {
          const shown =
            year === month.getFullYear() && index === month.getMonth();
          const current =
            year === designToday.getFullYear() &&
            index === designToday.getMonth();
          return (
            <button
              aria-current={current ? "date" : undefined}
              aria-pressed={shown}
              className={monthChoice.month({ current, shown })}
              disabled={outside(new Date(year, index, 1))}
              key={index}
              onClick={() => {
                onPick(new Date(year, index, 1));
                change(false);
              }}
              type="button"
            >
              {index + 1}月
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// A month's name that opens the sheet above, with a small chevron after it
// saying so; `children` draws the name, so each screen keeps its size.
export function MonthTitleButton({
  month,
  first,
  last,
  onPick,
  chevron = true,
  children,
}: {
  month: Date;
  first?: Date;
  last?: Date;
  onPick: (month: Date) => void;
  // Without it the name is left plain, a shortcut for those who try it,
  // where the screen has other ways to other months.
  chevron?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月。押すと月を選べます`}
        className={monthTitle}
        data-month-title=""
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {children}
        {chevron ? (
          <ChevronDown aria-hidden="true" className={monthChevron} size={16} />
        ) : null}
      </button>
      <MonthChoiceSheet
        first={first}
        last={last}
        month={month}
        onOpenChange={setOpen}
        onPick={onPick}
        open={open}
      />
    </>
  );
}

// Also the month name's button when it plays おたのしみ instead.
export const monthTitle = css({
  alignItems: "center",
  bg: "transparent",
  border: 0,
  color: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  font: "inherit",
  gap: "4px",
  padding: 0,
  textAlign: "left",
  // Set in a line, as in the calendar's heading, it would sit on the
  // heading's own text by its first line, the small year, and stand a few
  // pixels lower than the same name left plain.
  verticalAlign: "top",
});

const monthChevron = css({ color: "text.tertiary", flexShrink: 0 });

const monthChoice = {
  grid: css({
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "repeat(4, 1fr)",
    paddingBottom: "8px",
  }),
  month: cva({
    base: {
      _disabled: { color: "text.disabled", cursor: "default" },
      bg: "fill.quaternary",
      border: "1.5px solid transparent",
      borderRadius: "full",
      color: "text.primary",
      cursor: "pointer",
      fontWeight: 600,
      minHeight: "touch",
      textStyle: "body",
    },
    variants: {
      current: {
        true: { borderColor: "accent.default", color: "accent.default" },
      },
      shown: { true: { bg: "accent.fill", color: "accent.onFill" } },
    },
  }),
  step: css({
    _disabled: { color: "text.disabled", cursor: "default" },
    bg: "transparent",
    border: 0,
    borderRadius: "full",
    color: "accent.default",
    display: "grid",
    height: "touch",
    placeItems: "center",
    width: "touch",
  }),
  year: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "center",
    textStyle: "headline",
  }),
};
