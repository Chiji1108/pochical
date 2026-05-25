import {
  addDays,
  compareAsc,
  endOfMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type { ModifiableEventProperties } from "expo-calendar";
import type { Pattern, Shift, ShiftMember } from "@/lib/instant";

type ShiftCalendarEventInput = {
  membersById: ReadonlyMap<string, ShiftMember>;
  pattern: Pattern;
  shift: Shift;
};

type MonthlyShiftCalendarEventsInput = {
  excludeDayOffShifts: boolean;
  membersById: ReadonlyMap<string, ShiftMember>;
  patternsById: ReadonlyMap<string, Pattern>;
  shifts: Shift[];
  yearMonth: Date;
};

export type ShiftCalendarEvent = Partial<ModifiableEventProperties> & {
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
  membersById: ReadonlyMap<string, ShiftMember>
): ShiftMember[] =>
  (shift.shiftMembers ?? [])
    .map((member) => membersById.get(member.id) ?? member)
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
  membersById,
  shift,
}: Pick<ShiftCalendarEventInput, "membersById" | "shift">): string => {
  const members = getSortedShiftMembers(shift, membersById);
  const noteLines: string[] = [];

  if (members.length > 0) {
    noteLines.push(
      `メンバー: ${members.map((member) => member.name).join("、")}`
    );
  }

  const notes = (shift.notes ?? "").trim();

  if (notes) {
    noteLines.push(`備考: ${notes}`);
  }

  noteLines.push("ポチカレから書き出し");

  return noteLines.join("\n");
};

const createShiftCalendarEvent = ({
  membersById,
  pattern,
  shift,
}: ShiftCalendarEventInput): ShiftCalendarEvent => ({
  ...getShiftEventDates(shift, pattern),
  notes: getShiftEventNotes({ membersById, shift }),
  title: `${pattern.emoji} ${pattern.name}`,
});

export const getMonthlyShiftCalendarEvents = ({
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

    const pattern = shift.pattern
      ? (patternsById.get(shift.pattern.id) ?? shift.pattern)
      : undefined;

    if (!pattern) {
      continue;
    }

    if (excludeDayOffShifts && pattern.countsAsDayOff) {
      continue;
    }

    events.push(
      createShiftCalendarEvent({
        membersById,
        pattern,
        shift,
      })
    );
  }

  return events.sort((a, b) => compareAsc(a.startDate, b.startDate));
};
