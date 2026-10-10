import { COWORKERS_MAX } from "@pochical/design/limits";
import { and, asc, count, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { fitsField } from "./day-values";
import type {
  Change,
  CoworkerOrder,
  CoworkerValue,
  DayValue,
  PatternOrder,
  PatternValue,
  PreferenceValue,
  RepeatOrdersEdit,
} from "./gen/pochical/v1/sync_pb";
import { clockAfter } from "./hlc";
import type { Clock } from "./hlc";
import { hasDeviceClock, isId, isIdList } from "./ids";
import { givesWay, heldBackBy, ORDER_FIELDS } from "./order-clears";
import type { Floor } from "./order-clears";
import {
  fitsClearFrom,
  fitsCoworkerName,
  fitsCoworkerOrder,
  fitsOrders,
} from "./order-values";
import { fitsOrder, fitsPattern } from "./pattern-values";
import { fitsPreference } from "./preference-values";
import {
  coworkerOrder,
  coworkers,
  dayFields,
  orderClears,
  patternOrder,
  patterns,
  preferences,
  repeatOrders,
} from "./user-do-schema";
import {
  clockColumns,
  clockOfHlc,
  clockOfRow,
  coworkerChange,
  coworkerOrderChange,
  dayChange,
  encodeOrders,
  encodePattern,
  isNewer,
  orderChange,
  ordersOfRow,
  parseIds,
  patternChange,
  preferenceChange,
  repeatOrdersChange,
} from "./user-do-values";
import type {
  CoworkerOrderRow,
  CoworkerRow,
  DayRow,
  OrderRow,
  PatternRow,
  PreferenceRow,
  RepeatOrdersRow,
} from "./user-do-values";

// The owner's edits as the User DO takes them (spec/sync-protocol.md,
// Shifts): each value written at `cursor` when its clock is newer than the
// one stored, checked against what it may hold first.

/**
 * The clock a value is written with: the edit's own when the value fits,
 * else one just past it, so the device that made it takes the correction.
 */
const writtenClock = (clock: Clock, fits: boolean): Clock =>
  fits ? clock : clockAfter(clock);

const writeDay = (db: DrizzleSqliteDODatabase, row: DayRow): Change => {
  db.insert(dayFields)
    .values(row)
    .onConflictDoUpdate({
      set: row,
      target: [dayFields.date, dayFields.field],
    })
    .run();
  return dayChange(row);
};

export const applyDay = (
  db: DrizzleSqliteDODatabase,
  edit: DayValue,
  cursor: number,
  floors: readonly Floor[]
): Change | undefined => {
  const key = and(
    eq(dayFields.date, edit.date),
    eq(dayFields.field, edit.field)
  );
  const stored = db.select().from(dayFields).where(key).get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return undefined;
  }
  // An edit made before orders that cleared its day arrived late: it
  // would bring back what they took, so it gets the clear instead, under
  // the clear's clock, which a later edit from the same device outranks.
  const floor = heldBackBy(floors, edit.date, edit.field, clock);
  if (floor) {
    return writeDay(db, {
      ...clockColumns(floor.clock),
      cursor,
      date: edit.date,
      field: edit.field,
      value: null,
    });
  }
  const fits = fitsField(edit.field, edit.value);
  const row: DayRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    date: edit.date,
    field: edit.field,
    // A value that does not fit leaves what was stored (or nothing).
    value: fits ? (edit.value ?? null) : (stored?.value ?? null),
  };
  return writeDay(db, row);
};

export const applyPattern = (
  db: DrizzleSqliteDODatabase,
  edit: PatternValue,
  cursor: number
): Change | undefined => {
  if (!(isId(edit.id) && hasDeviceClock(edit))) {
    return undefined;
  }
  const stored = db
    .select()
    .from(patterns)
    .where(eq(patterns.id, edit.id))
    .get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return undefined;
  }
  const fits = edit.pattern === undefined || fitsPattern(edit.id, edit.pattern);
  let data = stored?.data ?? null;
  if (fits) {
    data = edit.pattern === undefined ? null : encodePattern(edit.pattern);
  }
  const row: PatternRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    data,
    id: edit.id,
  };
  db.insert(patterns)
    .values(row)
    .onConflictDoUpdate({ set: row, target: patterns.id })
    .run();
  return patternChange(row);
};

export const applyPatternOrder = (
  db: DrizzleSqliteDODatabase,
  edit: PatternOrder,
  cursor: number
): Change | undefined => {
  if (!hasDeviceClock(edit)) {
    return undefined;
  }
  const stored = db.select().from(patternOrder).get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return undefined;
  }
  const fits = fitsOrder(edit.ids);
  const ids = fits ? edit.ids : parseIds(stored?.ids ?? "[]");
  const row: OrderRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    id: 1,
    ids: JSON.stringify(ids),
  };
  db.insert(patternOrder)
    .values(row)
    .onConflictDoUpdate({ set: row, target: patternOrder.id })
    .run();
  return orderChange(row);
};

/** Where taken orders cleared the user's days, and when. */
export const orderFloors = (db: DrizzleSqliteDODatabase): Floor[] =>
  db
    .select()
    .from(orderClears)
    .all()
    .map((row) => ({ clock: clockOfRow(row), from: row.fromDate }));

/**
 * Clears the own pattern and times of the days from `from` set before
 * the orders, each at the next cursor, and keeps where they cleared, so
 * an edit made before them that arrives later cannot bring them back.
 */
const giveDaysToOrders = (
  db: DrizzleSqliteDODatabase,
  from: string,
  orders: RepeatOrdersRow,
  cursor: number
): Change[] => {
  const floor: Floor = { clock: clockOfRow(orders), from };
  const stored = db
    .select()
    .from(orderClears)
    .where(eq(orderClears.fromDate, from))
    .get();
  if (isNewer(floor.clock, stored)) {
    const row = { ...clockColumns(floor.clock), fromDate: from };
    db.insert(orderClears)
      .values(row)
      .onConflictDoUpdate({ set: row, target: orderClears.fromDate })
      .run();
  }
  const owned = db
    .select()
    .from(dayFields)
    .where(
      and(
        gte(dayFields.date, from),
        inArray(dayFields.field, ORDER_FIELDS),
        isNotNull(dayFields.value)
      )
    )
    .orderBy(asc(dayFields.date), asc(dayFields.field))
    .all()
    .filter((row) => givesWay(row.date, row.field, clockOfRow(row), floor));
  return owned.map((kept, index) => {
    const row: DayRow = {
      ...clockColumns(floor.clock),
      cursor: cursor + index,
      date: kept.date,
      field: kept.field,
      value: null,
    };
    db.update(dayFields)
      .set(row)
      .where(and(eq(dayFields.date, row.date), eq(dayFields.field, row.field)))
      .run();
    return dayChange(row);
  });
};

/**
 * Orders taken when newer and fitting; then, in the same transaction,
 * the days from `clear_from` give their own pattern and times back to
 * them, those older than the edit (spec/sync-protocol.md, Repeating
 * orders). Orders that lose, or do not fit, clear nothing.
 */
export const applyRepeatOrders = (
  db: DrizzleSqliteDODatabase,
  { clearFrom, orders: edit }: RepeatOrdersEdit,
  cursor: number
): Change[] => {
  if (!hasDeviceClock(edit)) {
    return [];
  }
  const stored = db.select().from(repeatOrders).get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return [];
  }
  const fits = fitsOrders(edit.orders) && fitsClearFrom(edit.orders, clearFrom);
  // Orders that do not fit leave what was stored (or none).
  let kept = edit.orders;
  if (!fits) {
    kept = stored ? ordersOfRow(stored).orders : [];
  }
  const row: RepeatOrdersRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    data: encodeOrders(kept),
    id: 1,
  };
  db.insert(repeatOrders)
    .values(row)
    .onConflictDoUpdate({ set: row, target: repeatOrders.id })
    .run();
  const changes = [repeatOrdersChange(row)];
  if (fits && clearFrom !== undefined) {
    changes.push(...giveDaysToOrders(db, clearFrom, row, cursor + 1));
  }
  return changes;
};

/** Whether the user keeps COWORKERS_MAX coworkers already. */
const coworkersFull = (db: DrizzleSqliteDODatabase): boolean => {
  const kept =
    db
      .select({ kept: count() })
      .from(coworkers)
      .where(isNotNull(coworkers.name))
      .get()?.kept ?? 0;
  return kept >= COWORKERS_MAX;
};

export const applyCoworker = (
  db: DrizzleSqliteDODatabase,
  edit: CoworkerValue,
  cursor: number
): Change | undefined => {
  if (!(isId(edit.id) && hasDeviceClock(edit))) {
    return undefined;
  }
  const stored = db
    .select()
    .from(coworkers)
    .where(eq(coworkers.id, edit.id))
    .get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return undefined;
  }
  // A coworker newly kept past COWORKERS_MAX is refused, answered as
  // deleted, like a name that does not fit.
  const adding = edit.name !== undefined && (stored?.name ?? null) === null;
  const fits =
    edit.name === undefined ||
    (fitsCoworkerName(edit.name) && !(adding && coworkersFull(db)));
  const row: CoworkerRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    id: edit.id,
    name: fits ? (edit.name ?? null) : (stored?.name ?? null),
  };
  db.insert(coworkers)
    .values(row)
    .onConflictDoUpdate({ set: row, target: coworkers.id })
    .run();
  return coworkerChange(row);
};

export const applyCoworkerOrder = (
  db: DrizzleSqliteDODatabase,
  edit: CoworkerOrder,
  cursor: number
): Change | undefined => {
  if (!hasDeviceClock(edit)) {
    return undefined;
  }
  const stored = db.select().from(coworkerOrder).get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return undefined;
  }
  const fits = fitsCoworkerOrder(edit.ids);
  let ids = fits ? edit.ids : parseIds(stored?.ids ?? "[]");
  // An order past COWORKERS_MAX names coworkers the server refused: it
  // keeps the person's order of those they do keep.
  if (!fits && isIdList(edit.ids)) {
    const kept = new Set(
      db
        .select({ id: coworkers.id })
        .from(coworkers)
        .where(isNotNull(coworkers.name))
        .all()
        .map(({ id }) => id)
    );
    ids = edit.ids.filter((id) => kept.has(id)).slice(0, COWORKERS_MAX);
  }
  const row: CoworkerOrderRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    id: 1,
    ids: JSON.stringify(ids),
  };
  db.insert(coworkerOrder)
    .values(row)
    .onConflictDoUpdate({ set: row, target: coworkerOrder.id })
    .run();
  return coworkerOrderChange(row);
};

export const applyPreference = (
  db: DrizzleSqliteDODatabase,
  edit: PreferenceValue,
  cursor: number
): Change | undefined => {
  if (!(isId(edit.key) && hasDeviceClock(edit))) {
    return undefined;
  }
  const stored = db
    .select()
    .from(preferences)
    .where(eq(preferences.key, edit.key))
    .get();
  const clock = clockOfHlc(edit.hlc);
  if (!isNewer(clock, stored)) {
    return undefined;
  }
  // One too long keeps what was there, as a name that does not fit.
  const fits = edit.value === undefined || fitsPreference(edit.value);
  const row: PreferenceRow = {
    ...clockColumns(writtenClock(clock, fits)),
    cursor,
    key: edit.key,
    value: fits ? (edit.value ?? null) : (stored?.value ?? null),
  };
  db.insert(preferences)
    .values(row)
    .onConflictDoUpdate({ set: row, target: preferences.key })
    .run();
  return preferenceChange(row);
};
