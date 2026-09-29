import { motion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { css, cva } from "styled-system/css";

import type { Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { dateKey, isDayOff, TabBar } from "./design-calendar";
import type { Schedule, Tab } from "./design-calendar";
import { Screen, ScreenScroll } from "./design-ui";
import { useWeek } from "./design-week";
import { lookOf, useDisplayColor } from "./shift-mark";

// The years around this one the page runs through.
const YEARS_AROUND = 2;
const MONTHS = Array.from({ length: 12 }, (_, index) => index);

// The calendar tab one level up, as iOS Calendar's year: every month of
// each year small, days off in their tint so the year's rest shows at a
// glance, this month named in the accent and today in a round. A month
// opens that month.
export function YearPage({
  month,
  schedule,
  onPick,
  onTab,
}: {
  // The month the calendar was on, whose year the page opens at.
  month: Date;
  schedule: Schedule;
  onPick: (month: Date) => void;
  onTab: (tab: Tab) => void;
}) {
  const shownYear = useRef<HTMLElement>(null);
  const years = Array.from(
    { length: YEARS_AROUND * 2 + 1 },
    (_, index) => designToday.getFullYear() - YEARS_AROUND + index
  );
  // Opens with the calendar's year at the top, moving only the page's own
  // scroll, never the pages around the phone.
  useLayoutEffect(() => {
    const target = shownYear.current;
    const scroller = target?.closest<HTMLElement>("[data-screen-scroll]");
    if (!(target && scroller)) {
      return;
    }
    scroller.scrollTop +=
      target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  }, []);
  return (
    <Screen>
      <ScreenScroll>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={year.years}
          initial={{ opacity: 0, scale: 1.06 }}
          transition={{ bounce: 0, type: "spring", visualDuration: 0.3 }}
        >
          {years.map((value) => (
            <section
              aria-label={`${value}年`}
              className={year.section}
              key={value}
              ref={value === month.getFullYear() ? shownYear : undefined}
            >
              <h3
                className={year.title({
                  now: value === designToday.getFullYear(),
                })}
              >
                {value}年
              </h3>
              <div className={year.grid}>
                {MONTHS.map((index) => (
                  <MiniMonth
                    key={index}
                    month={new Date(value, index, 1)}
                    onPick={onPick}
                    schedule={schedule}
                  />
                ))}
              </div>
            </section>
          ))}
        </motion.div>
      </ScreenScroll>
      <TabBar active="calendar" onSelect={onTab} />
    </Screen>
  );
}

function MiniMonth({
  month,
  schedule,
  onPick,
}: {
  month: Date;
  schedule: Schedule;
  onPick: (month: Date) => void;
}) {
  const weekTools = useWeek();
  const dates = weekTools.monthDates(month);
  const now =
    month.getFullYear() === designToday.getFullYear() &&
    month.getMonth() === designToday.getMonth();
  const daysOff = dates.filter(
    (date) =>
      date.getMonth() === month.getMonth() &&
      isDayOff(schedule[dateKey(date)]?.shift)
  ).length;
  return (
    <button
      aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月、お休み${daysOff}日`}
      className={year.month}
      onClick={() => {
        onPick(month);
      }}
      type="button"
    >
      <span className={year.monthName({ now })}>{month.getMonth() + 1}月</span>
      <span aria-hidden="true" className={year.days}>
        {dates.map((date) =>
          date.getMonth() === month.getMonth() ? (
            <MiniDay
              date={date}
              key={dateKey(date)}
              shift={schedule[dateKey(date)]?.shift}
            />
          ) : (
            <span key={dateKey(date)} />
          )
        )}
      </span>
    </button>
  );
}

function MiniDay({ date, shift }: { date: Date; shift: Shift | undefined }) {
  const off = isDayOff(shift);
  const { tint } = useDisplayColor(lookOf(shift ?? "off").color);
  const today = dateKey(date) === dateKey(designToday);
  return (
    <span
      className={year.day({ off: off && !today, today })}
      style={off ? ({ "--off-tint": tint } as CSSProperties) : undefined}
    >
      {date.getDate()}
    </span>
  );
}

const year = {
  day: cva({
    base: {
      alignItems: "center",
      aspectRatio: "1",
      borderRadius: "4px",
      display: "flex",
      justifyContent: "center",
    },
    variants: {
      off: { true: { bg: "var(--off-tint, var(--calendar-off-tint))" } },
      today: {
        true: {
          bg: "accent.fill",
          borderRadius: "999px",
          color: "accent.onFill",
          fontWeight: 600,
        },
      },
    },
  }),
  days: css({
    display: "grid",
    fontSize: "9px",
    fontVariantNumeric: "tabular-nums",
    gap: "1px",
    gridTemplateColumns: "repeat(7, 1fr)",
    lineHeight: 1,
  }),
  grid: css({
    display: "grid",
    gap: "20px 12px",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  }),
  month: css({
    alignContent: "start",
    bg: "transparent",
    border: 0,
    color: "text.primary",
    cursor: "pointer",
    display: "grid",
    gap: "4px",
    padding: 0,
    textAlign: "left",
  }),
  monthName: cva({
    base: { fontWeight: 600, textStyle: "headline" },
    variants: { now: { true: { color: "accent.default" } } },
  }),
  section: css({ display: "grid", gap: "16px" }),
  title: cva({
    base: {
      borderBottom: "1px solid token(colors.separator)",
      fontWeight: 700,
      margin: 0,
      paddingBottom: "8px",
      textStyle: "largeTitle",
    },
    variants: { now: { true: { color: "accent.default" } } },
  }),
  years: css({ display: "grid", gap: "40px", padding: "0 8px" }),
};
