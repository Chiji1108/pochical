import { init } from "@instantdb/react-native";
import MMKVStore from "@instantdb/react-native-mmkv";
import schema from "../../instant.schema";

const appId = process.env.EXPO_PUBLIC_INSTANT_APP_ID;

if (!appId) {
  throw new Error("EXPO_PUBLIC_INSTANT_APP_ID を設定してください");
}

export const db = init({
  appId,
  schema,
  Store: MMKVStore,
  useDateObjects: true,
});

type ExtractTransaction<T> = T extends readonly (infer Transaction)[]
  ? Transaction
  : T;

export type InstantTransaction = ExtractTransaction<
  Parameters<typeof db.transact>[0]
>;

export type InstantUserRef = {
  email?: string;
  id: string;
};

export type Pattern = {
  countsAsDayOff: boolean;
  emoji: string;
  endDate?: Date;
  id: string;
  isAllDay: boolean;
  name: string;
  nextDayPattern?: Pattern;
  orderIndex: number;
  owner?: InstantUserRef;
  previousDayPatterns?: Pattern[];
  startDate?: Date;
};

export type ShiftMember = {
  id: string;
  name: string;
  orderIndex: number;
  owner?: InstantUserRef;
  shifts?: Shift[];
};

export type Member = ShiftMember;

export type Shift = {
  id: string;
  owner?: InstantUserRef;
  pattern?: Pattern;
  shiftMembers?: ShiftMember[];
  startDate: Date;
};

export type DayNote = {
  date: Date;
  id: string;
  notes: string;
  owner?: InstantUserRef;
};

export type WorkData = {
  dayNotes: DayNote[];
  members: ShiftMember[];
  patterns: Pattern[];
  shifts: Shift[];
};

export const useCurrentUserId = (): string | undefined => db.useAuth().user?.id;

const EMPTY_WORK_DATA: WorkData = {
  dayNotes: [],
  members: [],
  patterns: [],
  shifts: [],
};

export const useOwnWorkData = (userId?: string): WorkData => {
  const { data } = db.useQuery(
    userId
      ? {
          dayNotes: {
            $: { where: { "owner.id": userId } },
            owner: {},
          },
          shiftMembers: {
            $: { where: { "owner.id": userId } },
            owner: {},
          },
          shiftPatterns: {
            $: { where: { "owner.id": userId } },
            nextDayPattern: {},
            owner: {},
            previousDayPatterns: {},
          },
          shifts: {
            $: { where: { "owner.id": userId } },
            owner: {},
            pattern: {},
            shiftMembers: {},
          },
        }
      : null
  );

  if (!data) {
    return EMPTY_WORK_DATA;
  }

  return {
    dayNotes: (data.dayNotes ?? []) as DayNote[],
    members: (data.shiftMembers ?? []) as ShiftMember[],
    patterns: (data.shiftPatterns ?? []) as Pattern[],
    shifts: (data.shifts ?? []) as Shift[],
  };
};

export const usePatternById = (
  patternId: string | undefined,
  userId: string | undefined
): Pattern | undefined => {
  const { data } = db.useQuery(
    patternId && userId
      ? {
          shiftPatterns: {
            $: { where: { id: patternId, "owner.id": userId } },
            nextDayPattern: {},
            owner: {},
            previousDayPatterns: {},
          },
        }
      : null
  );

  return (data?.shiftPatterns?.[0] as Pattern | undefined) ?? undefined;
};
