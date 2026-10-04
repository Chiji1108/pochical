import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";

import {
  ChangeSchema,
  CoworkerOrderSchema,
  CoworkerValueSchema,
  DayValueSchema,
  PatternOrderSchema,
  PatternSchema,
  PatternValueSchema,
  RepeatOrdersSchema,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  Hlc,
  Pattern,
  RepeatOrder,
  RepeatOrders,
} from "./gen/pochical/v1/sync_pb";
import { compareClocks } from "./hlc";
import type { Clock } from "./hlc";
import type {
  coworkerOrder,
  coworkers,
  dayFields,
  patternOrder,
  patterns,
  repeatOrders,
} from "./user-do-schema";

// The User DO's stored values as the Changes devices receive, and the
// clocks they were written with.

export type DayRow = typeof dayFields.$inferSelect;
export type PatternRow = typeof patterns.$inferSelect;
export type OrderRow = typeof patternOrder.$inferSelect;
export type RepeatOrdersRow = typeof repeatOrders.$inferSelect;
export type CoworkerRow = typeof coworkers.$inferSelect;
export type CoworkerOrderRow = typeof coworkerOrder.$inferSelect;

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
