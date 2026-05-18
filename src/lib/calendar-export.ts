import {
  addDays,
  compareAsc,
  endOfMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
} from "date-fns";
import type { Event } from "expo-calendar";
import type { Member, Pattern, Shift, ShiftNote } from "@/schema";

type ShiftCalendarEventInput = {
  membersById: ReadonlyMap<string, Member>;
  pattern: Pattern;
  shift: Shift;
  shiftNote?: ShiftNote;
};

type MonthlyShiftCalendarEventsInput = {
  membersById: ReadonlyMap<string, Member>;
  patternsById: ReadonlyMap<string, Pattern>;
  shiftNotesByShiftId: ReadonlyMap<string, ShiftNote>;
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
  membersById,
  shift,
  shiftNote,
}: Pick<
  ShiftCalendarEventInput,
  "membersById" | "shift" | "shiftNote"
>): string => {
  const members = getSortedShiftMembers(shift, membersById);
  const noteLines: string[] = [];

  if (members.length > 0) {
    noteLines.push(
      `メンバー: ${members.map((member) => member.name).join("、")}`
    );
  }

  const notes = shiftNote?.notes.trim();

  if (notes) {
    noteLines.push(`備考: ${notes}`);
  }

  noteLines.push("ナースシフトから書き出し");

  return noteLines.join("\n");
};

const createShiftCalendarEvent = ({
  membersById,
  pattern,
  shift,
  shiftNote,
}: ShiftCalendarEventInput): ShiftCalendarEvent => ({
  ...getShiftEventDates(shift, pattern),
  notes: getShiftEventNotes({ membersById, shift, shiftNote }),
  title: `${pattern.emoji} ${pattern.name}`,
});

export const getMonthlyShiftCalendarEvents = ({
  membersById,
  patternsById,
  shiftNotesByShiftId,
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

    events.push(
      createShiftCalendarEvent({
        membersById,
        pattern,
        shift,
        shiftNote: shiftNotesByShiftId.get(shift.id),
      })
    );
  }

  return events.sort((a, b) => compareAsc(a.startDate, b.startDate));
};
