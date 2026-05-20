import type { useDb } from "jazz-tools/react-native";
import {
  app,
  type DayNote,
  type Member,
  type Pattern,
  type Shift,
} from "@/schema";

type JazzDb = ReturnType<typeof useDb>;

type ShiftPatternResetData = {
  patterns: Pattern[];
  shifts: Shift[];
};

type WorkDataResetData = ShiftPatternResetData & {
  dayNotes: DayNote[];
  members: Member[];
};

export const deleteShiftPatternsAndRelatedData = (
  db: JazzDb,
  data: ShiftPatternResetData
): void => {
  db.batch((batch) => {
    for (const shift of data.shifts) {
      batch.delete(app.shifts, shift.id);
    }

    for (const pattern of data.patterns) {
      batch.delete(app.patterns, pattern.id);
    }
  });
};

export const deleteWorkData = (db: JazzDb, data: WorkDataResetData): void => {
  db.batch((batch) => {
    for (const dayNote of data.dayNotes) {
      batch.delete(app.dayNotes, dayNote.id);
    }

    for (const shift of data.shifts) {
      batch.delete(app.shifts, shift.id);
    }

    for (const pattern of data.patterns) {
      batch.delete(app.patterns, pattern.id);
    }

    for (const member of data.members) {
      batch.delete(app.members, member.id);
    }
  });
};
