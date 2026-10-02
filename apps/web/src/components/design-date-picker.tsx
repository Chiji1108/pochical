import { DatePicker, parseDate } from "@ark-ui/react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { dateKey } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { todayMark } from "./design-day-cell";
import { monthWithYearOf } from "./design-month-name";
import { Sheet } from "./design-sheet";
import { Button, srOnly } from "./design-ui";
import { useWeek } from "./design-week";

// The parts every small month to pick days in is drawn with, here and in
// 日にちを共有's month: ‹ › at the two ends, where they stay whatever the
// month's name, in the accent as the platforms' date pickers tint them;
// the weekdays and the dates as the calendar draws them.
export const monthGrid = {
  arrow: css({
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    color: "accent.default",
    display: "grid",
    height: "touch",
    placeItems: "center",
    width: "touch",
  }),
  day: css({
    _hover: { bg: "accent.hover" },
    borderRadius: "md",
    fontWeight: 600,
    textStyle: "subheadline",
  }),
  heading: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    textStyle: "body",
  }),
  weekday: css({
    color: "text.tertiary",
    fontSize: "11px",
    fontWeight: 400,
    textAlign: "center",
  }),
};

const picker = {
  card: css({
    bg: "background.elevated",
    borderRadius: "2xl",
    boxShadow: "lg",
    color: "text.primary",
    padding: "20px",
    width: "min(360px, calc(100% - 24px))",
  }),
  heading: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  }),
  iconButton: css({
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    color: "text.primary",
    display: "grid",
    height: "touch",
    placeItems: "center",
    width: "touch",
  }),
  month: css({ margin: "12px 0" }),
  table: css({ borderCollapse: "collapse", width: "100%" }),
  title: css({ margin: 0, textStyle: "body" }),
  weekday: css({ paddingBottom: "8px" }),
};

// A day in the month. The picked day's fill outranks the week's colors,
// being an attribute selector. The days around the month are left out,
// as in 日にちを共有's month, keeping their place in the six weeks.
const pickerCell = cva({
  base: {
    "&[data-outside-range]": { visibility: "hidden" },
    "&[data-selected]": { bg: "accent.fill", color: "accent.onFill" },
    _focusVisible: { outline: "2px solid token(colors.accent.default)" },
    alignItems: "center",
    cursor: "default",
    display: "flex",
    justifyContent: "center",
    minHeight: "touch",
  },
  variants: {
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: {},
      saturday: { color: "calendar.saturday" },
    },
  },
});

function toDateValue(date: Date) {
  return parseDate(dateKey(date));
}

// A month to pick one day in, as SwiftUI's graphical DatePicker and
// Compose's DatePicker: Ark UI's DatePicker draws it and moves through it
// by arrow keys. Sundays, holidays and Saturdays take the week's colors.
export function MonthPicker({
  value,
  month,
  onSelect,
}: {
  value?: Date;
  // The month it opens on while nothing is picked.
  month?: Date;
  onSelect: (date: Date) => void;
}) {
  const weekTools = useWeek();
  return (
    <DatePicker.Root
      defaultFocusedValue={toDateValue(value ?? month ?? designToday)}
      // Six weeks in every month, so what is under it stays put as the
      // months turn.
      fixedWeeks
      inline
      locale="ja-JP"
      onValueChange={(details) => {
        const [picked] = details.value;
        if (picked) {
          onSelect(new Date(picked.year, picked.month - 1, picked.day));
        }
      }}
      startOfWeek={weekTools.weekStart}
      value={value ? [toDateValue(value)] : []}
    >
      <DatePicker.View view="day">
        <DatePicker.Context>
          {(api) => (
            <>
              <DatePicker.ViewControl
                className={cx(monthGrid.heading, picker.month)}
              >
                <DatePicker.PrevTrigger
                  aria-label="前の月"
                  className={monthGrid.arrow}
                >
                  <ChevronLeft aria-hidden="true" size={20} />
                </DatePicker.PrevTrigger>
                <strong aria-live="polite">
                  <span className={srOnly}>
                    {api.focusedValue.year}年{api.focusedValue.month}月
                  </span>
                  <span aria-hidden="true">
                    {monthWithYearOf(
                      new Date(
                        api.focusedValue.year,
                        api.focusedValue.month - 1,
                        1
                      ),
                      weekTools.english
                    )}
                  </span>
                </strong>
                <DatePicker.NextTrigger
                  aria-label="次の月"
                  className={monthGrid.arrow}
                >
                  <ChevronRight aria-hidden="true" size={20} />
                </DatePicker.NextTrigger>
              </DatePicker.ViewControl>
              <DatePicker.Table className={picker.table}>
                <DatePicker.TableHead>
                  <DatePicker.TableRow>
                    {weekTools.weekdays.map((day) => (
                      <DatePicker.TableHeader
                        className={cx(monthGrid.weekday, picker.weekday)}
                        key={day.day}
                      >
                        {day.label}
                      </DatePicker.TableHeader>
                    ))}
                  </DatePicker.TableRow>
                </DatePicker.TableHead>
                <DatePicker.TableBody>
                  {api.weeks.map((week) => (
                    <DatePicker.TableRow key={week[0]?.toString()}>
                      {week.map((day) => {
                        const date = new Date(day.year, day.month - 1, day.day);
                        const today = dateKey(date) === dateKey(designToday);
                        return (
                          <DatePicker.TableCell
                            key={day.toString()}
                            value={day}
                          >
                            <DatePicker.TableCellTrigger
                              className={cx(
                                pickerCell({
                                  tone: today
                                    ? "plain"
                                    : weekTools.dateTone(date),
                                }),
                                monthGrid.day,
                                today && todayMark
                              )}
                            >
                              {day.day}
                            </DatePicker.TableCellTrigger>
                          </DatePicker.TableCell>
                        );
                      })}
                    </DatePicker.TableRow>
                  ))}
                </DatePicker.TableBody>
              </DatePicker.Table>
            </>
          )}
        </DatePicker.Context>
      </DatePicker.View>
    </DatePicker.Root>
  );
}

// Picking one day, in a dialog over the phone like Material's date picker
// and SwiftUI's graphical DatePicker. Ark UI's DatePicker draws the month
// and moves through it by arrow keys; 今日 jumps back to today.
// The button that shows the day and opens the picker: plain over the
// pattern buttons while entering, filled like a field in a form.
const dateButton = {
  button: cva({
    base: {
      _focusVisible: {
        outline: "2px solid token(colors.accent.focus)",
        outlineOffset: "2px",
      },
      alignItems: "center",
      border: 0,
      borderRadius: "md",
      color: "text.primary",
      cursor: "pointer",
      display: "flex",
      fontWeight: 600,
      gap: "4px",
      minHeight: "touch",
      padding: "0 12px 0 16px",
      textStyle: "headline",
    },
    variants: {
      look: {
        field: {
          _hover: { bg: "accent.hover", borderColor: "accent.border" },
          bg: "accent.container",
          border: "1px solid token(colors.accent.border)",
          margin: 0,
          textStyle: "body",
        },
        inline: {
          _hover: { bg: "accent.container" },
          bg: "transparent",
          margin: "0 auto 8px",
        },
      },
    },
  }),
  chevron: css({ color: "accent.default" }),
};

export function InputDatePicker({
  title = "入力する日付",
  ariaLabel,
  look = "inline",
  date,
  onSelect,
  children,
}: {
  title?: string;
  ariaLabel: string;
  look?: "inline" | "field";
  date: Date;
  onSelect: (date: Date) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pick = (day: Date) => {
    onSelect(day);
    setOpen(false);
  };
  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={dateButton.button({ look })}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className={dateButton.chevron}
          size={15}
        />
      </button>
      <Sheet
        className={picker.card}
        label={`${title}を選択`}
        onOpenChange={setOpen}
        open={open}
        placement="center"
      >
        <header className={picker.heading}>
          <h4 className={picker.title}>{title}</h4>
          <div className={picker.heading}>
            <Button
              onClick={() => {
                pick(designToday);
              }}
              variant="text"
            >
              今日
            </Button>
            <button
              aria-label="日付選択を閉じる"
              className={picker.iconButton}
              onClick={() => {
                setOpen(false);
              }}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>
        <MonthPicker onSelect={pick} value={date} />
      </Sheet>
    </>
  );
}
