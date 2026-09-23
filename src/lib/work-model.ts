import type {
  MemberRecord,
  PatternRecord,
  ShiftRecord,
} from "../../shared/work-schema";
export type UserRef = { id: string; email?: string };
export type Pattern = {
  id: string;
  name: string;
  emoji: string;
  orderIndex: number;
  countsAsDayOff: boolean;
  isAllDay: boolean;
  startDate?: Date;
  endDate?: Date;
  nextDayPattern?: Pattern;
  previousDayPatterns?: Pattern[];
  owner?: UserRef;
};
export type ShiftMember = {
  id: string;
  name: string;
  orderIndex: number;
  owner?: UserRef;
  shifts?: Shift[];
};
export type Member = ShiftMember;
export type Shift = {
  id: string;
  notes?: string;
  startDate: Date;
  pattern?: Pattern;
  shiftMembers?: ShiftMember[];
  owner?: UserRef;
};
export type WorkData = {
  patterns: Pattern[];
  members: Member[];
  shifts: Shift[];
};
export const hydrateWorkData = (
  patterns: PatternRecord[],
  members: MemberRecord[],
  shifts: ShiftRecord[]
): WorkData => {
  const patternMap = new Map<string, Pattern>(
    patterns.map((record) => [
      record.id,
      {
        id: record.id,
        name: record.name,
        emoji: record.emoji,
        orderIndex: record.orderIndex,
        countsAsDayOff: record.countsAsDayOff,
        isAllDay: record.isAllDay,
        owner: { id: record.ownerId },
        startDate:
          record.startDate === null ? undefined : new Date(record.startDate),
        endDate: record.endDate === null ? undefined : new Date(record.endDate),
      },
    ])
  );
  for (const record of patterns) {
    const pattern = patternMap.get(record.id);
    if (pattern && record.nextDayPatternId) {
      pattern.nextDayPattern = patternMap.get(record.nextDayPatternId);
    }
  }
  const hydratedMembers = members.map((record) => ({
    ...record,
    owner: { id: record.ownerId },
  }));
  const memberMap = new Map(
    hydratedMembers.map((member) => [member.id, member])
  );
  return {
    patterns: [...patternMap.values()],
    members: hydratedMembers,
    shifts: shifts.map((record) => ({
      id: record.id,
      notes: record.notes,
      startDate: new Date(record.startDate),
      owner: { id: record.ownerId },
      pattern: record.patternId ? patternMap.get(record.patternId) : undefined,
      shiftMembers: record.memberIds.flatMap((id) => {
        const member = memberMap.get(id);
        return member ? [member] : [];
      }),
    })),
  };
};
