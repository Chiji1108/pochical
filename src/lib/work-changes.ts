import type {
  MemberRecord,
  PatternRecord,
  ShiftRecord,
} from "../../shared/work-schema";
import type { WorkChange } from "./work-sync";

type PatternInput = Partial<Omit<PatternRecord, "startDate" | "endDate">> & {
  startDate?: Date | number | null;
  endDate?: Date | number | null;
};
const millis = (date: Date | number | null | undefined) =>
  date instanceof Date ? date.getTime() : date;
export const patchPattern = (id: string, values: PatternInput): WorkChange => ({
  table: "shiftPatterns",
  id,
  values: {
    ...values,
    startDate: millis(values.startDate),
    endDate: millis(values.endDate),
  },
});
export const putPattern = (id: string, values: PatternInput): WorkChange => ({
  ...patchPattern(id, {
    startDate: null,
    endDate: null,
    nextDayPatternId: null,
    ...values,
  }),
  create: true,
});
export const patchMember = (
  id: string,
  values: Partial<MemberRecord>
): WorkChange => ({ table: "shiftMembers", id, values });
export const patchShift = (
  id: string,
  values: Partial<Omit<ShiftRecord, "startDate">> & {
    startDate?: Date | number;
  }
): WorkChange => ({
  table: "shifts",
  id,
  values: { ...values, startDate: millis(values.startDate) ?? undefined },
});
export const putShift = (
  id: string,
  values: Partial<Omit<ShiftRecord, "startDate">> & { startDate: Date | number }
): WorkChange => ({
  ...patchShift(id, { notes: "", memberIds: [], patternId: null, ...values }),
  create: true,
});
export const removeRecord = (
  table: WorkChange["table"],
  id: string
): WorkChange => ({ table, id, remove: true });

export const putMember = (
  id: string,
  values: Partial<MemberRecord>
): WorkChange => ({ ...patchMember(id, values), create: true });
