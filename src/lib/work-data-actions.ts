import type { useDb } from "jazz-tools/react-native";
import {
  app,
  type DayNote,
  type Member,
  type Pattern,
  type Shift,
} from "@/schema";

type JazzDb = ReturnType<typeof useDb>;
type DeleteOperation = {
  id: string;
  run: () => ReturnType<JazzDb["delete"]>;
};

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
): Promise<void> => {
  if (data.patterns.length === 0 && data.shifts.length === 0) {
    return Promise.resolve();
  }

  return deleteRows([
    ...data.shifts.map((shift) => ({
      id: shift.id,
      run: () => db.delete(app.shifts, shift.id),
    })),
    ...data.patterns.map((pattern) => ({
      id: pattern.id,
      run: () => db.delete(app.patterns, pattern.id),
    })),
  ]);
};

export const deleteWorkData = (
  db: JazzDb,
  data: WorkDataResetData
): Promise<void> => {
  if (
    data.dayNotes.length === 0 &&
    data.members.length === 0 &&
    data.patterns.length === 0 &&
    data.shifts.length === 0
  ) {
    return Promise.resolve();
  }

  return deleteRows([
    ...data.dayNotes.map((dayNote) => ({
      id: dayNote.id,
      run: () => db.delete(app.dayNotes, dayNote.id),
    })),
    ...data.shifts.map((shift) => ({
      id: shift.id,
      run: () => db.delete(app.shifts, shift.id),
    })),
    ...data.patterns.map((pattern) => ({
      id: pattern.id,
      run: () => db.delete(app.patterns, pattern.id),
    })),
    ...data.members.map((member) => ({
      id: member.id,
      run: () => db.delete(app.members, member.id),
    })),
  ]);
};

const deleteRows = async (rows: DeleteOperation[]): Promise<void> => {
  const seenRowIds = new Set<string>();

  for (const row of rows) {
    if (seenRowIds.has(row.id)) {
      continue;
    }

    seenRowIds.add(row.id);

    try {
      await row.run().wait({ tier: "local" });
    } catch (error) {
      if (!isAlreadyDeletedError(error)) {
        throw error;
      }
    }
  }
};

const isAlreadyDeletedError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("row already deleted");
