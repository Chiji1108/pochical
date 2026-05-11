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
    isHoliday: s.boolean(),
    isAllday: s.boolean(),
    startDate: s.timestamp(),
    endDate: s.timestamp(),
    nextDayPatternId: s.ref("patterns").optional(),
  }),
  shifts: s.table({
    patternId: s.ref("patterns"),
    startDate: s.timestamp(),
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
