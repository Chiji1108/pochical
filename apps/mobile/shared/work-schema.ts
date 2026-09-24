import { type Infer, v } from "convex/values";

export const patternFields = {
  id: v.string(),
  ownerId: v.string(),
  name: v.string(),
  emoji: v.string(),
  orderIndex: v.number(),
  countsAsDayOff: v.boolean(),
  isAllDay: v.boolean(),
  startDate: v.union(v.number(), v.null()),
  endDate: v.union(v.number(), v.null()),
  nextDayPatternId: v.union(v.string(), v.null()),
};
export const memberFields = {
  id: v.string(),
  ownerId: v.string(),
  name: v.string(),
  orderIndex: v.number(),
};
export const shiftFields = {
  id: v.string(),
  ownerId: v.string(),
  startDate: v.number(),
  notes: v.string(),
  patternId: v.union(v.string(), v.null()),
  memberIds: v.array(v.string()),
};
export const patternShape = v.object(patternFields);
export const memberShape = v.object(memberFields);
export const shiftShape = v.object(shiftFields);
export type PatternRecord = Infer<typeof patternShape>;
export type MemberRecord = Infer<typeof memberShape>;
export type ShiftRecord = Infer<typeof shiftShape>;
