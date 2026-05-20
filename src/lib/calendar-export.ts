import {
  addDays,
  compareAsc,
  endOfMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type { Event } from "expo-calendar";
import type { DayNote, Member, Pattern, Shift } from "@/schema";

type ShiftCalendarEventInput = {
  dayNote?: DayNote;
  membersById: ReadonlyMap<string, Member>;
  pattern: Pattern;
  shift: Shift;
};

type MonthlyShiftCalendarEventsInput = {
  dayNotesByDate: ReadonlyMap<number, DayNote>;
  excludeDayOffShifts: boolean;
  membersById: ReadonlyMap<string, Member>;
  patternsById: ReadonlyMap<string, Pattern>;
  shifts: Shift[];
  yearMonth: Date;
};

export type ShiftCalendarEvent = Omit<Partial<Event>, "id" | "organizer"> & {
  endDate: Date;
  startDate: Date;
  title: string;
};

const getShiftTime = (shiftDate: Date, timeDate: Date): Date => {
  const date = new Date(shiftDate);
  date.setHours(
    timeDate.getHours(),
    timeDate.getMinutes(),
    timeDate.getSeconds(),
    timeDate.getMilliseconds()
  );
  return date;
};

const getSortedShiftMembers = (
  shift: Shift,
  membersById: ReadonlyMap<string, Member>
): Member[] =>
  shift.memberIds
    .map((memberId) => membersById.get(memberId))
    .filter((member): member is Member => Boolean(member))
    .sort((a, b) => {
      const orderDiff = a.orderIndex - b.orderIndex;
      return orderDiff === 0 ? a.id.localeCompare(b.id) : orderDiff;
    });

const getShiftEventDates = (
  shift: Shift,
  pattern: Pattern
): Pick<ShiftCalendarEvent, "allDay" | "endDate" | "startDate"> => {
  const shiftStartDate = startOfDay(shift.startDate);

  if (pattern.isAllDay || !(pattern.startDate && pattern.endDate)) {
    return {
      allDay: true,
      endDate: addDays(shiftStartDate, 1),
      startDate: shiftStartDate,
    };
  }

  const startDate = getShiftTime(shiftStartDate, pattern.startDate);
  let endDate = getShiftTime(shiftStartDate, pattern.endDate);

  if (compareAsc(endDate, startDate) <= 0) {
    endDate = addDays(endDate, 1);
  }

  return {
    allDay: false,
    endDate,
    startDate,
  };
};

const getShiftEventNotes = ({
  dayNote,
  membersById,
  shift,
}: Pick<
  ShiftCalendarEventInput,
  "dayNote" | "membersById" | "shift"
>): string => {
  const members = getSortedShiftMembers(shift, membersById);
  const noteLines: string[] = [];

  if (members.length > 0) {
    noteLines.push(
      `メンバー: ${members.map((member) => member.name).join("、")}`
    );
  }

  const notes = dayNote?.notes.trim();

  if (notes) {
    noteLines.push(`備考: ${notes}`);
  }

  noteLines.push("ナースシフトから書き出し");

  return noteLines.join("\n");
};

const createShiftCalendarEvent = ({
  dayNote,
  membersById,
  pattern,
  shift,
}: ShiftCalendarEventInput): ShiftCalendarEvent => ({
  ...getShiftEventDates(shift, pattern),
  notes: getShiftEventNotes({ dayNote, membersById, shift }),
  title: `${pattern.emoji} ${pattern.name}`,
});

export const getMonthlyShiftCalendarEvents = ({
  dayNotesByDate,
  excludeDayOffShifts,
  membersById,
  patternsById,
  shifts,
  yearMonth,
}: MonthlyShiftCalendarEventsInput): ShiftCalendarEvent[] => {
  const monthInterval = {
    end: endOfMonth(yearMonth),
    start: startOfMonth(yearMonth),
  };
  const events: ShiftCalendarEvent[] = [];

  for (const shift of shifts) {
    if (!isWithinInterval(shift.startDate, monthInterval)) {
      continue;
    }

    const pattern = patternsById.get(shift.patternId);

    if (!pattern) {
      continue;
    }

    if (excludeDayOffShifts && pattern.countsAsDayOff) {
      continue;
    }

    events.push(
      createShiftCalendarEvent({
        dayNote: dayNotesByDate.get(startOfDay(shift.startDate).getTime()),
        membersById,
        pattern,
        shift,
      })
    );
  }

  return events.sort((a, b) => compareAsc(a.startDate, b.startDate));
};
