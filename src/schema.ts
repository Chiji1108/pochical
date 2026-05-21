import { schema as s } from "jazz-tools";

const schema = {
  shiftPatterns: s.table({
    name: s.string(),
    emoji: s.string(),
    orderIndex: s.int(),
    countsAsDayOff: s.boolean(),
    isAllDay: s.boolean(),
    startDate: s.timestamp().optional(),
    endDate: s.timestamp().optional(),
    nextDayPatternId: s.ref("shiftPatterns").optional(),
  }),
  shifts: s.table({
    shiftPatternId: s.ref("shiftPatterns"),
    startDate: s.timestamp(),
    memberIds: s.array(s.ref("members")),
  }),
  dayNotes: s.table({
    date: s.timestamp(),
    notes: s.string(),
  }),
  members: s.table({
    name: s.string(),
    orderIndex: s.int(),
  }),
};

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);

export type Pattern = s.RowOf<typeof app.shiftPatterns>;
export type PatternQueryBuilder = typeof app.shiftPatterns;

export type Shift = s.RowOf<typeof app.shifts>;
export type ShiftQueryBuilder = typeof app.shifts;

export type DayNote = s.RowOf<typeof app.dayNotes>;
export type DayNoteQueryBuilder = typeof app.dayNotes;

export type Member = s.RowOf<typeof app.members>;
export type MemberQueryBuilder = typeof app.members;
