import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

/**
 * Returns an array of dates representing all days in the week containing this date.
 * (assuming week starts on Sunday)
 */
export const getWeekDates = (date: Date): Date[] => {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  return eachDayOfInterval({ start, end });
};

/**
 * Returns an array containing the first day of each week for the given month.
 * (assuming week starts on Sunday)
 */
export const getWeeksOfMonth = (date: Date): Date[] => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return eachWeekOfInterval({ start, end });
};
