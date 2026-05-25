import { i } from "@instantdb/react-native";

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    shiftPatterns: i.entity({
      countsAsDayOff: i.boolean(),
      emoji: i.string(),
      endDate: i.date().optional(),
      isAllDay: i.boolean(),
      name: i.string(),
      orderIndex: i.number().indexed(),
      startDate: i.date().optional(),
    }),
    shifts: i.entity({
      notes: i.string().optional(),
      startDate: i.date().indexed(),
    }),
    shiftMembers: i.entity({
      name: i.string(),
      orderIndex: i.number().indexed(),
    }),
  },
  links: {
    shiftPatternOwner: {
      forward: { has: "one", label: "owner", on: "shiftPatterns" },
      reverse: { has: "many", label: "shiftPatterns", on: "$users" },
    },
    shiftOwner: {
      forward: { has: "one", label: "owner", on: "shifts" },
      reverse: { has: "many", label: "shifts", on: "$users" },
    },
    shiftMemberOwner: {
      forward: { has: "one", label: "owner", on: "shiftMembers" },
      reverse: { has: "many", label: "shiftMembers", on: "$users" },
    },
    shiftPattern: {
      forward: { has: "one", label: "pattern", on: "shifts" },
      reverse: { has: "many", label: "shifts", on: "shiftPatterns" },
    },
    shiftAssignedMembers: {
      forward: { has: "many", label: "shiftMembers", on: "shifts" },
      reverse: { has: "many", label: "shifts", on: "shiftMembers" },
    },
    nextDayShiftPattern: {
      forward: {
        has: "one",
        label: "nextDayPattern",
        on: "shiftPatterns",
      },
      reverse: {
        has: "many",
        label: "previousDayPatterns",
        on: "shiftPatterns",
      },
    },
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
