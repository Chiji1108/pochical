import { isInPeriod, pageMonthOf, periodOf } from "../lib/design-days";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { periodDatesFrom, useWeek } from "./design-week";

// The calendar's pages (spec/calendar.md, The shift period): each the
// period starting in the month that names it, which is the month itself
// unless the person set a シフトの期間. Only the calendar's own pages go by
// it; the widgets, a group's months and the order's calendar keep to
// months.
export function usePages() {
  const start = useSettings((state) => state.device.periodStart);
  const { weekStart } = useWeek();
  return {
    // Whether the pages are periods rather than months.
    byPeriod: start !== 1,
    // The days the page of `month` draws: whole weeks holding its period.
    datesOf: (month: Date) =>
      periodDatesFrom(periodOf(month, start), weekStart),
    // Whether a day is one of the page's own, not faded.
    holds: (month: Date, date: Date) =>
      isInPeriod(date, periodOf(month, start)),
    // The month naming the page that holds a day.
    monthOf: (date: Date) => pageMonthOf(date, start),
    periodOf: (month: Date) => periodOf(month, start),
    // The page holding today, which the calendar opens on and 今月 (今日)
    // brings back.
    today: pageMonthOf(designToday, start),
  };
}
