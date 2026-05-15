import { schema as s } from "jazz-tools";

const schema = {
  todos: s.table({
    // debug
    name: s.string(),
    done: s.boolean(),
  }),
  patterns: s.table({
    name: s.string(),
    emoji: s.string(),
    orderIndex: s.int(),
    countsAsDayOff: s.boolean(),
    isAllDay: s.boolean(),
    startDate: s.timestamp().optional(),
    endDate: s.timestamp().optional(),
    nextDayPatternId: s.ref("patterns").optional(),
  }),
  shifts: s.table({
    patternId: s.ref("patterns"),
    startDate: s.timestamp(),
    memberIds: s.array(s.ref("members")),
  }),
  shiftNotes: s.table({
    shiftId: s.ref("shifts"),
    notes: s.string(),
  }),
  members: s.table({
    name: s.string(),
    orderIndex: s.int(),
  }),
};

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);

export type Todo = s.RowOf<typeof app.todos>;
export type TodoQueryBuilder = typeof app.todos;

export type Pattern = s.RowOf<typeof app.patterns>;
export type PatternQueryBuilder = typeof app.patterns;

export type Shift = s.RowOf<typeof app.shifts>;
export type ShiftQueryBuilder = typeof app.shifts;

export type ShiftNote = s.RowOf<typeof app.shiftNotes>;
export type ShiftNoteQueryBuilder = typeof app.shiftNotes;

export type Member = s.RowOf<typeof app.members>;
export type MemberQueryBuilder = typeof app.members;
