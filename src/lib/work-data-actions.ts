import {
  type DayNote,
  db,
  type Pattern,
  type Shift,
  type ShiftMember,
} from "@/lib/instant";

type ShiftPatternResetData = {
  patterns: Pattern[];
  shifts: Shift[];
};

type WorkDataResetData = ShiftPatternResetData & {
  dayNotes: DayNote[];
  members: ShiftMember[];
};

export const deleteShiftPatternsAndRelatedData = async ({
  patterns,
  shifts,
}: ShiftPatternResetData): Promise<void> => {
  if (patterns.length === 0 && shifts.length === 0) {
    return;
  }

  await db.transact([
    ...shifts.map((shift) => db.tx.shifts[shift.id].delete()),
    ...patterns.map((pattern) => db.tx.shiftPatterns[pattern.id].delete()),
  ]);
};

export const deleteWorkData = async ({
  dayNotes,
  members,
  patterns,
  shifts,
}: WorkDataResetData): Promise<void> => {
  if (
    dayNotes.length === 0 &&
    members.length === 0 &&
    patterns.length === 0 &&
    shifts.length === 0
  ) {
    return;
  }

  await db.transact([
    ...dayNotes.map((dayNote) => db.tx.dayNotes[dayNote.id].delete()),
    ...shifts.map((shift) => db.tx.shifts[shift.id].delete()),
    ...patterns.map((pattern) => db.tx.shiftPatterns[pattern.id].delete()),
    ...members.map((member) => db.tx.shiftMembers[member.id].delete()),
  ]);
};
