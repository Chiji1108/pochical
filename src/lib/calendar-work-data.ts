import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarShiftSummary } from "@/components/calendar/calendar-body";
import { getMonthlyShiftCalendarEvents } from "@/lib/calendar-export";
import {
  type Member,
  type Pattern,
  useOwnWorkData,
  type WorkDataDateRange,
} from "@/lib/instant";

const CALENDAR_QUERY_MONTH_RADIUS = 3;
const CALENDAR_QUERY_RECENTER_THRESHOLD_MONTHS = 1;

const getCalendarWorkDataDateRange = (month: Date): WorkDataDateRange => ({
  end: endOfMonth(addMonths(month, CALENDAR_QUERY_MONTH_RADIUS)),
  start: startOfMonth(addMonths(month, -CALENDAR_QUERY_MONTH_RADIUS)),
});

const shouldRecenterWorkDataDateRange = (
  month: Date,
  dateRange: WorkDataDateRange
): boolean => {
  const monthStart = startOfMonth(month);
  const recenterStart = startOfMonth(
    addMonths(dateRange.start, CALENDAR_QUERY_RECENTER_THRESHOLD_MONTHS)
  );
  const recenterEnd = startOfMonth(
    addMonths(dateRange.end, -CALENDAR_QUERY_RECENTER_THRESHOLD_MONTHS)
  );

  return monthStart <= recenterStart || monthStart >= recenterEnd;
};

type UseCalendarWorkDataOptions = {
  currentUserId?: string;
  excludeDayOffShiftsFromExport: boolean;
  selectedDate: Date;
  yearMonth: Date;
};

export const useCalendarWorkData = ({
  currentUserId,
  excludeDayOffShiftsFromExport,
  selectedDate,
  yearMonth,
}: UseCalendarWorkDataOptions) => {
  const [workDataDateRange, setWorkDataDateRange] = useState<WorkDataDateRange>(
    () => getCalendarWorkDataDateRange(yearMonth)
  );

  useEffect(() => {
    if (!shouldRecenterWorkDataDateRange(yearMonth, workDataDateRange)) {
      return;
    }

    setWorkDataDateRange(getCalendarWorkDataDateRange(yearMonth));
  }, [workDataDateRange, yearMonth]);

  const { members, patterns, shifts } = useOwnWorkData(
    currentUserId,
    workDataDateRange
  );
  const patternsById = useMemo(() => {
    const nextPatternsById = new Map<string, Pattern>();

    for (const pattern of patterns) {
      nextPatternsById.set(pattern.id, pattern);
    }

    return nextPatternsById;
  }, [patterns]);
  const membersById = useMemo(() => {
    const nextMembersById = new Map<string, Member>();

    for (const member of members) {
      nextMembersById.set(member.id, member);
    }

    return nextMembersById;
  }, [members]);
  const shiftsByDate = useMemo(() => {
    const nextShiftsByDate = new Map<number, CalendarShiftSummary>();

    for (const shift of shifts) {
      const dateKey = startOfDay(shift.startDate).getTime();

      nextShiftsByDate.set(dateKey, {
        hasNotes: Boolean((shift.notes ?? "").trim()),
        pattern: shift.pattern,
      });
    }

    return nextShiftsByDate;
  }, [shifts]);
  const selectedDateShifts = useMemo(
    () => shifts.filter((shift) => isSameDay(shift.startDate, selectedDate)),
    [selectedDate, shifts]
  );
  const [selectedDateShift] = selectedDateShifts;
  const monthlyShiftCalendarEvents = useMemo(
    () =>
      getMonthlyShiftCalendarEvents({
        excludeDayOffShifts: excludeDayOffShiftsFromExport,
        membersById,
        patternsById,
        shifts,
        yearMonth,
      }),
    [
      excludeDayOffShiftsFromExport,
      membersById,
      patternsById,
      shifts,
      yearMonth,
    ]
  );
  const getIsMonthComplete = useCallback(
    (month: Date) => {
      const datesInMonth = eachDayOfInterval({
        end: endOfMonth(month),
        start: startOfMonth(month),
      });

      return datesInMonth.every((date) => {
        const shiftSummary = shiftsByDate.get(startOfDay(date).getTime());
        return Boolean(shiftSummary?.pattern);
      });
    },
    [shiftsByDate]
  );
  const getWillCompleteMonthAfterShiftInput = useCallback(
    (savedDates: Date[]) => {
      const savedDateKeys = new Set(
        savedDates.map((date) => startOfDay(date).getTime())
      );
      const affectedMonthKeys = new Set(
        savedDates.map((date) => format(startOfMonth(date), "yyyy-MM"))
      );

      for (const monthKey of affectedMonthKeys) {
        const [yearText, monthText] = monthKey.split("-");
        const affectedMonth = new Date(Number(yearText), Number(monthText) - 1);

        if (getIsMonthComplete(affectedMonth)) {
          continue;
        }

        const datesInMonth = eachDayOfInterval({
          end: endOfMonth(affectedMonth),
          start: startOfMonth(affectedMonth),
        });
        const isCompleteAfterInput = datesInMonth.every((date) => {
          const dateKey = startOfDay(date).getTime();
          const shiftSummary = shiftsByDate.get(dateKey);

          return savedDateKeys.has(dateKey) || Boolean(shiftSummary?.pattern);
        });

        if (isCompleteAfterInput) {
          return true;
        }
      }

      return false;
    },
    [getIsMonthComplete, shiftsByDate]
  );

  return {
    getIsMonthComplete,
    getWillCompleteMonthAfterShiftInput,
    members,
    membersById,
    monthlyShiftCalendarEvents,
    patterns,
    patternsById,
    selectedDateShift,
    selectedDateShifts,
    shifts,
    shiftsByDate,
  };
};
