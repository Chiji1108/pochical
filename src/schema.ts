import { schema as s } from "jazz-tools";

const schema = {
  todos: s.table({
    // debug
    name: s.string(),
    done: s.boolean(),
  }),
  shareGroups: s.table({
    name: s.string(),
  }),
  shareGroupMembers: s.table({
    groupId: s.ref("shareGroups"),
    user_id: s.string(),
    displayName: s.string(),
  }),
  shareGroupAccess: s.table({
    groupId: s.ref("shareGroups"),
    ownerUserId: s.string(),
    viewerUserId: s.string(),
  }),
  patterns: s.table({
    ownerUserId: s.string(),
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
    ownerUserId: s.string(),
    patternId: s.ref("patterns"),
    startDate: s.timestamp(),
    memberIds: s.array(s.ref("members")),
  }),
  shiftNotes: s.table({
    ownerUserId: s.string(),
    shiftId: s.ref("shifts"),
    notes: s.string(),
  }),
  members: s.table({
    ownerUserId: s.string(),
    name: s.string(),
    orderIndex: s.int(),
  }),
};

type AppSchema = s.Schema<typeof schema>;
export const app: s.App<AppSchema> = s.defineApp(schema);

export type Todo = s.RowOf<typeof app.todos>;
export type TodoQueryBuilder = typeof app.todos;

export type ShareGroup = s.RowOf<typeof app.shareGroups>;
export type ShareGroupQueryBuilder = typeof app.shareGroups;

export type ShareGroupMember = s.RowOf<typeof app.shareGroupMembers>;
export type ShareGroupMemberQueryBuilder = typeof app.shareGroupMembers;

export type ShareGroupAccess = s.RowOf<typeof app.shareGroupAccess>;
export type ShareGroupAccessQueryBuilder = typeof app.shareGroupAccess;

export type Pattern = s.RowOf<typeof app.patterns>;
export type PatternQueryBuilder = typeof app.patterns;

export type Shift = s.RowOf<typeof app.shifts>;
export type ShiftQueryBuilder = typeof app.shifts;

export type ShiftNote = s.RowOf<typeof app.shiftNotes>;
export type ShiftNoteQueryBuilder = typeof app.shiftNotes;

export type Member = s.RowOf<typeof app.members>;
export type MemberQueryBuilder = typeof app.members;
