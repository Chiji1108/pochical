import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import { and, eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { SHARED_DAY_FIELDS } from "./day-values";
import {
  ChangeSchema,
  DayValueSchema,
  PatternSchema,
  PatternValueSchema,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  DayValue,
  PatternValue,
  RepeatOrders,
} from "./gen/pochical/v1/sync_pb";
import {
  memberDays,
  memberPatterns,
  memberRepeatOrders,
} from "./group-do-schema";
import { compareClocks } from "./hlc";
import {
  clockColumns,
  clockOfHlc,
  clockOfRow,
  encodeOrders,
  hlcOf,
  ordersOfRow,
} from "./user-do-values";

// A Group DO's copy of its members' shared days, patterns and repeating
// orders
// (spec/sync-protocol.md, Group projection): each value last-writer-wins
// by its HLC, so a push that arrives twice, or late, changes nothing.

type DayRow = typeof memberDays.$inferSelect;
type PatternRow = typeof memberPatterns.$inferSelect;
type OrdersRow = typeof memberRepeatOrders.$inferSelect;

export const memberDayChange = (row: DayRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "memberDay",
      value: {
        day: create(DayValueSchema, {
          date: row.date,
          field: row.field,
          hlc: hlcOf(row),
          value: row.value ?? undefined,
        }),
        userId: row.userId,
      },
    },
  });

export const memberPatternChange = (row: PatternRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "memberPattern",
      value: {
        pattern: create(PatternValueSchema, {
          hlc: hlcOf(row),
          id: row.patternId,
          pattern:
            row.data === null
              ? undefined
              : fromJsonString(PatternSchema, row.data),
        }),
        userId: row.userId,
      },
    },
  });

/**
 * A member's day value, written at `cursor` when it is newer. A field
 * groups do not see is dropped, whatever pushed it.
 */
export const takeMemberDay = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  day: DayValue,
  cursor: number
): Change | undefined => {
  if (!SHARED_DAY_FIELDS.includes(day.field)) {
    return undefined;
  }
  const stored = db
    .select()
    .from(memberDays)
    .where(
      and(
        eq(memberDays.userId, userId),
        eq(memberDays.date, day.date),
        eq(memberDays.field, day.field)
      )
    )
    .get();
  const clock = clockOfHlc(day.hlc);
  if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
    return undefined;
  }
  const row: DayRow = {
    ...clockColumns(clock),
    cursor,
    date: day.date,
    field: day.field,
    userId,
    value: day.value ?? null,
  };
  db.insert(memberDays)
    .values(row)
    .onConflictDoUpdate({
      set: row,
      target: [memberDays.userId, memberDays.date, memberDays.field],
    })
    .run();
  return memberDayChange(row);
};

/** A member's pattern, written at `cursor` when it is newer. */
export const takeMemberPattern = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  value: PatternValue,
  cursor: number
): Change | undefined => {
  const stored = db
    .select()
    .from(memberPatterns)
    .where(
      and(
        eq(memberPatterns.userId, userId),
        eq(memberPatterns.patternId, value.id)
      )
    )
    .get();
  const clock = clockOfHlc(value.hlc);
  if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
    return undefined;
  }
  const row: PatternRow = {
    ...clockColumns(clock),
    cursor,
    data:
      value.pattern === undefined
        ? null
        : toJsonString(PatternSchema, value.pattern),
    patternId: value.id,
    userId,
  };
  db.insert(memberPatterns)
    .values(row)
    .onConflictDoUpdate({
      set: row,
      target: [memberPatterns.userId, memberPatterns.patternId],
    })
    .run();
  return memberPatternChange(row);
};

export const memberRepeatOrdersChange = (row: OrdersRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "memberRepeatOrders",
      value: { orders: ordersOfRow(row), userId: row.userId },
    },
  });

/** A member's repeating orders, written at `cursor` when they are newer. */
export const takeMemberRepeatOrders = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  orders: RepeatOrders,
  cursor: number
): Change | undefined => {
  const stored = db
    .select()
    .from(memberRepeatOrders)
    .where(eq(memberRepeatOrders.userId, userId))
    .get();
  const clock = clockOfHlc(orders.hlc);
  if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
    return undefined;
  }
  const row: OrdersRow = {
    ...clockColumns(clock),
    cursor,
    data: encodeOrders(orders.orders),
    userId,
  };
  db.insert(memberRepeatOrders)
    .values(row)
    .onConflictDoUpdate({ set: row, target: memberRepeatOrders.userId })
    .run();
  return memberRepeatOrdersChange(row);
};
