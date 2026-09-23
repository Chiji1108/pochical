import { removeRecord } from "@/lib/work-changes";
import {
  type Pattern,
  type Shift,
  type ShiftMember,
  writeWork,
} from "@/lib/work-data";

type ShiftPatternResetData = {
  patterns: Pattern[];
  shifts: Shift[];
};

type WorkDataResetData = ShiftPatternResetData & {
  members: ShiftMember[];
};

export const deleteShiftPatternsAndRelatedData = async ({
  patterns,
  shifts,
}: ShiftPatternResetData): Promise<void> => {
  if (patterns.length === 0 && shifts.length === 0) {
    return;
  }

  await writeWork([
    ...shifts.map((shift) => removeRecord("shifts", shift.id)),
    ...patterns.map((pattern) => removeRecord("shiftPatterns", pattern.id)),
  ]);
};

export const deleteWorkData = async ({
  members,
  patterns,
  shifts,
}: WorkDataResetData): Promise<void> => {
  if (members.length === 0 && patterns.length === 0 && shifts.length === 0) {
    return;
  }

  await writeWork([
    ...shifts.map((shift) => removeRecord("shifts", shift.id)),
    ...patterns.map((pattern) => removeRecord("shiftPatterns", pattern.id)),
    ...members.map((member) => removeRecord("shiftMembers", member.id)),
  ]);
};
