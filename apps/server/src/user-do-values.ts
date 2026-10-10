import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";

import {
  ChangeSchema,
  CoworkerOrderSchema,
  CoworkerValueSchema,
  DayValueSchema,
  PatternOrderSchema,
  PatternSchema,
  PatternValueSchema,
  PreferenceValueSchema,
  RepeatOrdersSchema,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  Hlc,
  Pattern,
  RepeatOrder,
  RepeatOrders,
} from "./gen/pochical/v1/sync_pb";
import { markOfRow } from "./group-marks";
import { compareClocks } from "./hlc";
import type { Clock } from "./hlc";
import type {
  blocks,
  chatMutes,
  chatSettings,
  coworkerOrder,
  coworkers,
  dayFields,
  memberships,
  patternOrder,
  patterns,
  preferences,
  profile,
  repeatOrders,
  unreadCounts,
} from "./user-do-schema";

// The User DO's stored values as the Changes devices receive, and the
// clocks they were written with.

export type DayRow = typeof dayFields.$inferSelect;
export type PatternRow = typeof patterns.$inferSelect;
export type OrderRow = typeof patternOrder.$inferSelect;
export type RepeatOrdersRow = typeof repeatOrders.$inferSelect;
export type CoworkerRow = typeof coworkers.$inferSelect;
export type CoworkerOrderRow = typeof coworkerOrder.$inferSelect;
export type PreferenceRow = typeof preferences.$inferSelect;

type ClockColumns = { hlcMs: number; hlcCounter: number; hlcDevice: string };

export const clockOfRow = (row: ClockColumns): Clock => ({
  counter: row.hlcCounter,
  device: row.hlcDevice,
  ms: row.hlcMs,
});

/**
 * Whether a value under `clock` beats the row stored for it, so it is
 * written: always, when nothing is stored yet.
 */
export const isNewer = (
  clock: Clock,
  stored: ClockColumns | undefined
): boolean =>
  stored === undefined || compareClocks(clock, clockOfRow(stored)) > 0;

export const clockOfHlc = (hlc: Hlc | undefined): Clock => ({
  counter: hlc?.counter ?? 0,
  device: hlc?.deviceId ?? "",
  ms: Number(hlc?.physicalMs ?? 0n),
});

/** A clock as the columns a row keeps it in. */
export const clockColumns = (clock: Clock): ClockColumns => ({
  hlcCounter: clock.counter,
  hlcDevice: clock.device,
  hlcMs: clock.ms,
});

export const hlcOf = (row: ClockColumns) => ({
  counter: row.hlcCounter,
  deviceId: row.hlcDevice,
  physicalMs: BigInt(row.hlcMs),
});

/** Stored ids, as written by JSON.stringify of a string array. */
export const parseIds = (json: string): string[] => {
  const ids: unknown = JSON.parse(json);
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
};
export const encodePattern = (pattern: Pattern): string =>
  toJsonString(PatternSchema, pattern);

export const dayChange = (row: DayRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "day",
      value: create(DayValueSchema, {
        date: row.date,
        field: row.field,
        hlc: hlcOf(row),
        value: row.value ?? undefined,
      }),
    },
  });

export const patternChange = (row: PatternRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "pattern",
      value: create(PatternValueSchema, {
        hlc: hlcOf(row),
        id: row.id,
        pattern:
          row.data === null
            ? undefined
            : fromJsonString(PatternSchema, row.data),
      }),
    },
  });

export const orderChange = (row: OrderRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "patternOrder",
      value: create(PatternOrderSchema, {
        hlc: hlcOf(row),
        ids: parseIds(row.ids),
      }),
    },
  });

/** Orders as a row keeps them: the timeline's JSON, without its clock. */
export const encodeOrders = (orders: readonly RepeatOrder[]): string =>
  toJsonString(
    RepeatOrdersSchema,
    create(RepeatOrdersSchema, { orders: [...orders] })
  );

/** A stored timeline under the clock it was written with. */
export const ordersOfRow = (
  row: ClockColumns & { data: string }
): RepeatOrders =>
  create(RepeatOrdersSchema, {
    hlc: hlcOf(row),
    orders: fromJsonString(RepeatOrdersSchema, row.data).orders,
  });

export const repeatOrdersChange = (row: RepeatOrdersRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: { case: "repeatOrders", value: ordersOfRow(row) },
  });

export const coworkerChange = (row: CoworkerRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "coworker",
      value: create(CoworkerValueSchema, {
        hlc: hlcOf(row),
        id: row.id,
        name: row.name ?? undefined,
      }),
    },
  });

export const coworkerOrderChange = (row: CoworkerOrderRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "coworkerOrder",
      value: create(CoworkerOrderSchema, {
        hlc: hlcOf(row),
        ids: parseIds(row.ids),
      }),
    },
  });

export const preferenceChange = (row: PreferenceRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "preference",
      value: create(PreferenceValueSchema, {
        hlc: hlcOf(row),
        key: row.key,
        value: row.value ?? undefined,
      }),
    },
  });

type MembershipRow = typeof memberships.$inferSelect;

export const membershipChange = (row: MembershipRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "membership",
      value: {
        groupId: row.groupId,
        joinedAtMs: BigInt(row.joinedAt.getTime()),
        left: row.leftAt !== null,
        mark: markOfRow(row),
        name: row.name,
      },
    },
  });

type UnreadCountRow = typeof unreadCounts.$inferSelect;

export const unreadCountChange = (row: UnreadCountRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "unreadCount",
      value: {
        count: row.count,
        groupId: row.groupId,
        mentions: row.mentions,
        threadId: row.threadId,
      },
    },
  });

type BlockRow = typeof blocks.$inferSelect;

export const blockChange = (row: BlockRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: { case: "block", value: { on: row.blocked, userId: row.userId } },
  });

type ChatMuteRow = typeof chatMutes.$inferSelect;

export const chatMuteChange = (row: ChatMuteRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "chatMute",
      value: { groupId: row.groupId, muted: row.muted, threadId: row.threadId },
    },
  });

type ChatSettingsRow = typeof chatSettings.$inferSelect;

export const chatSettingsChange = (row: ChatSettingsRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "chatNotifications",
      value: { mentionsWhenMuted: row.mentionsWhenMuted },
    },
  });

type ProfileRow = typeof profile.$inferSelect;

export const profileChange = (row: ProfileRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: { case: "profile", value: { name: row.name, photoId: row.photoId } },
  });

/**
 * How many of a chat's unread lines count, as what notifies (spec/chat.md,
 * Unread lines; spec/vectors/unread.json): all of them in a chat that is
 * on; in one turned off its mentions of the user, while mentions notify.
 */
export const notifyingCount = (
  unread: { count: number; mentions: number },
  muted: boolean,
  mentionsWhenMuted: boolean
): number => {
  if (!muted) {
    return unread.count;
  }
  return mentionsWhenMuted ? unread.mentions : 0;
};
