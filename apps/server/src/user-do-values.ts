import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";

import {
  ChangeSchema,
  DayValueSchema,
  PatternOrderSchema,
  PatternSchema,
  PatternValueSchema,
} from "./gen/pochical/v1/sync_pb";
import type { Change, Hlc, Pattern } from "./gen/pochical/v1/sync_pb";
import type { Clock } from "./hlc";
import type { dayFields, patternOrder, patterns } from "./user-do-schema";

// The User DO's stored values as the Changes devices receive, and the
// clocks they were written with.

export type DayRow = typeof dayFields.$inferSelect;
export type PatternRow = typeof patterns.$inferSelect;
export type OrderRow = typeof patternOrder.$inferSelect;

type ClockColumns = { hlcMs: number; hlcCounter: number; hlcDevice: string };

export const clockOfRow = (row: ClockColumns): Clock => ({
  counter: row.hlcCounter,
  device: row.hlcDevice,
  ms: row.hlcMs,
});

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

const hlcOf = (row: ClockColumns) => ({
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
