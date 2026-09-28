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
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The month on screen, which the sheet opens on.
  month: Date;
  onPick: (month: Date) => void;
}) {
  const [year, setYear] = useState(month.getFullYear());
  const change = (next: boolean) => {
    // Opened again, it starts from the month on screen.
    if (next) {
      setYear(month.getFullYear());
    }
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
  onPick,
  twoLines = false,
  children,
}: {
  month: Date;
  onPick: (month: Date) => void;
  // A name of two lines, like the year over the month, has the chevron
  // level with its second.
  twoLines?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月。押すと月を選べます`}
        className={monthTitle({ twoLines })}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className={monthChevron({ twoLines })}
          size={16}
        />
      </button>
      <MonthChoiceSheet
        month={month}
        onOpenChange={setOpen}
        onPick={onPick}
        open={open}
      />
    </>
  );
}

const monthTitle = cva({
  base: {
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
  },
  variants: { twoLines: { true: { alignItems: "flex-end" } } },
});

const monthChevron = cva({
  base: { color: "text3", flexShrink: 0 },
  variants: { twoLines: { true: { marginBottom: "12px" } } },
});

const monthChoice = {
  grid: css({
    display: "grid",
    gap: "8px",
    gridTemplateColumns: "repeat(4, 1fr)",
    paddingBottom: "8px",
  }),
  month: cva({
    base: {
      bg: "fill",
      border: "1.5px solid transparent",
      borderRadius: "999px",
      color: "text",
      cursor: "pointer",
      fontWeight: 600,
      minHeight: "touch",
      textStyle: "body",
    },
    variants: {
      current: { true: { borderColor: "accent", color: "accent" } },
      shown: { true: { bg: "accentFill", color: "onAccentFill" } },
    },
  }),
  step: css({
    bg: "transparent",
    border: 0,
    borderRadius: "999px",
    color: "accent",
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
