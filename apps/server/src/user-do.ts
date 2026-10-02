import { create, toBinary } from "@bufbuild/protobuf";
import { COWORKERS_MAX, syncLimits } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  max,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { fitsField, hasKey, SHARED_DAY_FIELDS } from "./day-values";
import { ChangesSchema, ServerError_Code } from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  CoworkerEdits,
  CoworkerOrder,
  CoworkerValue,
  DayEdits,
  DayValue,
  PatternEdits,
  PatternOrder,
  PatternValue,
  RepeatOrdersEdit,
  RepeatOrdersEdits,
} from "./gen/pochical/v1/sync_pb";
import { clockAfter, compareClocks } from "./hlc";
import type { Clock } from "./hlc";
import { isId } from "./ids";
import { givesWay, heldBackBy, ORDER_FIELDS } from "./order-clears";
import type { Floor } from "./order-clears";
import {
  fitsClearFrom,
  fitsCoworkerName,
  fitsCoworkerOrder,
  fitsOrders,
  isIdList,
} from "./order-values";
import { fitsOrder, fitsPattern } from "./pattern-values";
import {
  acceptSyncSocket,
  handleSyncMessage,
  isSynced,
  rejectAndClose,
  send,
  sendChanges,
} from "./sync-socket";
import migrations from "./user-do-migrations/migrations.js";
import {
  coworkerOrder,
  coworkers,
  dayFields,
  memberships,
  orderClears,
  patternOrder,
  patterns,
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
  orderChange,
  ordersOfRow,
  parseIds,
  patternChange,
  repeatOrdersChange,
} from "./user-do-values";
import type {
  CoworkerOrderRow,
  CoworkerRow,
  DayRow,
  OrderRow,
  PatternRow,
  RepeatOrdersRow,
} from "./user-do-values";

// Values in one push to a group.
const VALUES_PER_PUSH = 500;
// After a round of pushes where one failed, the alarm comes back after
// this long, twice as long each round that fails in a row, up to the most.
const PUSH_RETRY_FIRST_MS = 10_000;
const PUSH_RETRY_MOST_MS = 3_600_000;
// How many rounds of pushes in a row have failed, in the DO's storage.
const PUSH_FAILURES_KEY = "pushFailures";

/** One kind of value the user owns, as UserDO.logs lists them. */
type SyncedLog = {
  after: (cursor: number, sharedOnly: boolean) => Change[];
  shared: boolean;
  table:
    | typeof dayFields
    | typeof patterns
    | typeof patternOrder
    | typeof repeatOrders
    | typeof coworkers
    | typeof coworkerOrder;
};

const byCursor = (changes: Change[]): Change[] =>
  changes.toSorted((a, b) => (a.cursor < b.cursor ? -1 : 1));

/**
 * The clock a value is written with: the edit's own when the value fits,
 * else one just past it, so the device that made it takes the correction.
 */
const writtenClock = (clock: Clock, fits: boolean): Clock =>
  fits ? clock : clockAfter(clock);

/**
 * One Durable Object per signed-in user, named by their better-auth user
 * id. It owns their days, patterns, repeating orders and coworkers, synced between their own
 * devices over their socket (spec/sync-protocol.md, Shifts), and knows
 * which groups they are in.
 */
export class UserDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    // Nothing reaches the user before their tables are up to date.
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /** Whether the user is in the group. */
  isMember(groupId: string): boolean {
    return (
      this.db
        .select({ groupId: memberships.groupId })
        .from(memberships)
        .where(eq(memberships.groupId, groupId))
        .get() !== undefined
    );
  }

  /**
   * Written as the user joins a group or makes one; their shared days and
   * patterns then start on their way to it.
   */
  addMembership(groupId: string): void {
    this.db
      .insert(memberships)
      .values({ groupId, joinedAt: new Date() })
      .onConflictDoNothing()
      .run();
    this.schedulePush();
  }

  /**
   * Pushes each of the user's groups what changed for it since it last
   * took a push. Run by the DO's alarm. A group that could not be reached
   * keeps its cursor and gets the values on a later round, without holding
   * back the groups after it; they carry their clocks, so one taken twice
   * changes nothing.
   */
  async alarm(): Promise<void> {
    const userId = this.ctx.id.name;
    if (userId === undefined) {
      return;
    }
    const head = this.head();
    const groups = this.db.select().from(memberships).all();
    let failed = false;
    for (const { groupId, pushedCursor } of groups) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one group at a time
        await this.pushTo(groupId, userId, this.sharedAfter(pushedCursor));
      } catch (error) {
        console.error(`Pushing to group ${groupId} failed`, error);
        failed = true;
        continue;
      }
      this.db
        .update(memberships)
        .set({ pushedCursor: head })
        .where(eq(memberships.groupId, groupId))
        .run();
    }
    await this.retryFailedPushes(failed);
  }

  /**
   * After a round where a push failed, comes back for it, waiting longer
   * each round that fails in a row. The runtime's own retries of an alarm
   * that throws stop after a few, which would leave the values waiting for
   * the user's next edit. An alarm set sooner, by an edit, is kept.
   */
  private async retryFailedPushes(failed: boolean): Promise<void> {
    const { kv } = this.ctx.storage;
    if (!failed) {
      kv.delete(PUSH_FAILURES_KEY);
      return;
    }
    const stored: unknown = kv.get(PUSH_FAILURES_KEY);
    const failures = (typeof stored === "number" ? stored : 0) + 1;
    kv.put(PUSH_FAILURES_KEY, failures);
    const retryAt =
      Date.now() +
      Math.min(PUSH_RETRY_FIRST_MS * 2 ** (failures - 1), PUSH_RETRY_MOST_MS);
    const pending = await this.ctx.storage.getAlarm();
    if (pending === null || pending > retryAt) {
      await this.ctx.storage.setAlarm(retryAt);
    }
  }

  private schedulePush(): void {
    void this.ctx.storage.setAlarm(Date.now());
  }

  /**
   * Every kind of value the user owns, in one list so catch-up, the cursor
   * head and the pushes to groups cover the same ones: its table, its rows
   * changed after a cursor as changes (only what groups see, when asked),
   * and whether groups see it at all.
   */
  private logs(): SyncedLog[] {
    const { db } = this;
    return [
      {
        after: (cursor, sharedOnly) =>
          db
            .select()
            .from(dayFields)
            .where(
              and(
                gt(dayFields.cursor, cursor),
                // Memos and people stay with their owner.
                sharedOnly
                  ? inArray(dayFields.field, SHARED_DAY_FIELDS)
                  : undefined
              )
            )
            .all()
            .map(dayChange),
        shared: true,
        table: dayFields,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(patterns)
            .where(gt(patterns.cursor, cursor))
            .all()
            .map(patternChange),
        shared: true,
        table: patterns,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(patternOrder)
            .where(gt(patternOrder.cursor, cursor))
            .all()
            .map(orderChange),
        shared: false,
        table: patternOrder,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(repeatOrders)
            .where(gt(repeatOrders.cursor, cursor))
            .all()
            .map(repeatOrdersChange),
        shared: true,
        table: repeatOrders,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(coworkers)
            .where(gt(coworkers.cursor, cursor))
            .all()
            .map(coworkerChange),
        shared: false,
        table: coworkers,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(coworkerOrder)
            .where(gt(coworkerOrder.cursor, cursor))
            .all()
            .map(coworkerOrderChange),
        shared: false,
        table: coworkerOrder,
      },
    ];
  }

  /** The newest cursor across everything the user owns, 0 before any. */
  private head(): number {
    const heads = this.logs().map(
      ({ table }) =>
        this.db
          .select({ head: max(table.cursor) })
          .from(table)
          .get()?.head ?? 0
    );
    return Math.max(0, ...heads);
  }

  /** Every value changed after `cursor`, in cursor order. */
  private changesAfter(cursor: number): Change[] {
    return byCursor(this.logs().flatMap(({ after }) => after(cursor, false)));
  }

  /**
   * What a group sees of the user, changed after `cursor`: days' pattern
   * and times, never the memo or the people, their patterns and their
   * repeating orders.
   */
  private sharedAfter(cursor: number): Change[] {
    return byCursor(
      this.logs().flatMap(({ after, shared }) =>
        shared ? after(cursor, true) : []
      )
    );
  }

  private async pushTo(
    groupId: string,
    userId: string,
    changes: Change[]
  ): Promise<void> {
    const group = this.env.GROUPS.getByName(groupId);
    for (let at = 0; at < changes.length; at += VALUES_PER_PUSH) {
      const pushed = toBinary(
        ChangesSchema,
        create(ChangesSchema, {
          changes: changes.slice(at, at + VALUES_PER_PUSH),
        })
      );
      // oxlint-disable-next-line no-await-in-loop -- in order, to one group
      await group.takeMemberShifts(userId, pushed);
    }
  }

  /** The user's own socket, forwarded once the Worker has checked them. */
  fetch(request: Request): Response {
    return acceptSyncSocket(this.ctx, request);
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    handleSyncMessage(ws, message, {
      coworkerEdits: (socket, edits) => {
        this.takeCoworkerEdits(socket, edits);
      },
      dayEdits: (socket, edits) => {
        this.takeDayEdits(socket, edits);
      },
      patternEdits: (socket, edits) => {
        this.takePatternEdits(socket, edits);
      },
      repeatOrdersEdits: (socket, edits) => {
        this.takeRepeatOrdersEdits(socket, edits);
      },
      welcome: (socket, cursor) => {
        this.welcome(socket, cursor);
      },
    });
  }

  /**
   * Welcome, then every value changed after the device's cursor. Each
   * value keeps only its latest change, so this reaches back any distance;
   * a device ahead of the server (its data restored from an older copy)
   * is told to reset and gets everything.
   */
  private welcome(ws: WebSocket, cursor: bigint): void {
    const head = this.head();
    send(ws, { case: "welcome", value: { cursor: BigInt(head) } });
    if (cursor > BigInt(head)) {
      send(ws, { case: "reset", value: {} });
      sendChanges(ws, this.changesAfter(0));
      return;
    }
    sendChanges(ws, this.changesAfter(Number(cursor)));
  }

  /**
   * Takes a frame of edits in one transaction, each change given the next
   * cursor; acknowledges every edit and sends what changed to every
   * device of the user. An edit may change nothing, one value, or several
   * (an order and the days it takes back), from `cursor` on.
   */
  private takeEdits<Edit extends { opId: string }>(
    ws: WebSocket,
    edits: Edit[],
    apply: (edit: Edit, cursor: number) => Change | Change[] | undefined
  ): void {
    if (edits.length > syncLimits.editsPerFrame) {
      rejectAndClose(
        ws,
        ServerError_Code.BAD_FRAME,
        `At most ${syncLimits.editsPerFrame} edits a frame`
      );
      return;
    }
    const changed = this.ctx.storage.transactionSync(() => {
      let cursor = this.head();
      const changes: Change[] = [];
      for (const edit of edits) {
        const made = [apply(edit, cursor + 1) ?? []].flat();
        const last = made.at(-1);
        if (last) {
          cursor = Number(last.cursor);
          changes.push(...made);
        }
      }
      return changes;
    });
    send(ws, {
      case: "acked",
      value: { opIds: edits.map(({ opId }) => opId) },
    });
    if (changed.length > 0) {
      this.schedulePush();
    }
    for (const socket of this.ctx.getWebSockets()) {
      if (isSynced(socket)) {
        sendChanges(socket, changed);
      }
    }
  }

  /**
   * The owner's day edits: each field taken when its clock is newer than
   * the one stored. An edit whose value does not fit its field is answered
   * with the stored value under a newer clock, so the device that made it
   * is corrected; one for no real day or field is only acknowledged.
   */
  private takeDayEdits(ws: WebSocket, { edits }: DayEdits): void {
    // Read once a frame: no day edit lays a floor.
    const floors = this.floors();
    this.takeEdits(ws, edits, ({ value }, cursor) =>
      hasKey(value) ? this.applyDay(value, cursor, floors) : undefined
    );
  }

  /** The owner's pattern edits, taken as their days are. */
  private takePatternEdits(ws: WebSocket, { edits }: PatternEdits): void {
    this.takeEdits(ws, edits, ({ kind }, cursor) => {
      if (kind.case === "pattern") {
        return this.applyPattern(kind.value, cursor);
      }
      if (kind.case === "order") {
        return this.applyOrder(kind.value, cursor);
      }
      return undefined;
    });
  }

  /** The owner's repeating orders, each edit one whole timeline. */
  private takeRepeatOrdersEdits(
    ws: WebSocket,
    { edits }: RepeatOrdersEdits
  ): void {
    this.takeEdits(ws, edits, (edit, cursor) =>
      this.applyRepeatOrders(edit, cursor)
    );
  }

  /** The owner's coworker edits, taken as their patterns are. */
  private takeCoworkerEdits(ws: WebSocket, { edits }: CoworkerEdits): void {
    this.takeEdits(ws, edits, ({ kind }, cursor) => {
      if (kind.case === "coworker") {
        return this.applyCoworker(kind.value, cursor);
      }
      if (kind.case === "order") {
        return this.applyCoworkerOrder(kind.value, cursor);
      }
      return undefined;
    });
  }

  private applyDay(
    edit: DayValue,
    cursor: number,
    floors: readonly Floor[]
  ): Change | undefined {
    const key = and(
      eq(dayFields.date, edit.date),
      eq(dayFields.field, edit.field)
    );
    const stored = this.db.select().from(dayFields).where(key).get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
      return undefined;
    }
    // An edit made before orders that cleared its day arrived late: it
    // would bring back what they took, so it gets the clear instead, under
    // the clear's clock, which a later edit from the same device outranks.
    const floor = heldBackBy(floors, edit.date, edit.field, clock);
    if (floor) {
      return this.writeDay({
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
    return this.writeDay(row);
  }

  private writeDay(row: DayRow): Change {
    this.db
      .insert(dayFields)
      .values(row)
      .onConflictDoUpdate({
        set: row,
        target: [dayFields.date, dayFields.field],
      })
      .run();
    return dayChange(row);
  }

  private applyPattern(edit: PatternValue, cursor: number): Change | undefined {
    if (!(isId(edit.id) && edit.hlc && isId(edit.hlc.deviceId))) {
      return undefined;
    }
    const stored = this.db
      .select()
      .from(patterns)
      .where(eq(patterns.id, edit.id))
      .get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
      return undefined;
    }
    const fits =
      edit.pattern === undefined || fitsPattern(edit.id, edit.pattern);
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
    this.db
      .insert(patterns)
      .values(row)
      .onConflictDoUpdate({ set: row, target: patterns.id })
      .run();
    return patternChange(row);
  }

  private applyOrder(edit: PatternOrder, cursor: number): Change | undefined {
    if (!(edit.hlc && isId(edit.hlc.deviceId))) {
      return undefined;
    }
    const stored = this.db.select().from(patternOrder).get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
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
    this.db
      .insert(patternOrder)
      .values(row)
      .onConflictDoUpdate({ set: row, target: patternOrder.id })
      .run();
    return orderChange(row);
  }

  /**
   * Orders taken when newer and fitting; then, in the same transaction,
   * the days from `clear_from` give their own pattern and times back to
   * them, those older than the edit (spec/sync-protocol.md, Repeating
   * orders). Orders that lose, or do not fit, clear nothing.
   */
  private applyRepeatOrders(
    { clearFrom, orders: edit }: RepeatOrdersEdit,
    cursor: number
  ): Change[] {
    if (!(edit?.hlc && isId(edit.hlc.deviceId))) {
      return [];
    }
    const stored = this.db.select().from(repeatOrders).get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
      return [];
    }
    const fits =
      fitsOrders(edit.orders) && fitsClearFrom(edit.orders, clearFrom);
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
    this.db
      .insert(repeatOrders)
      .values(row)
      .onConflictDoUpdate({ set: row, target: repeatOrders.id })
      .run();
    const changes = [repeatOrdersChange(row)];
    if (fits && clearFrom !== undefined) {
      changes.push(...this.giveDaysToOrders(clearFrom, row, cursor + 1));
    }
    return changes;
  }

  /** Where taken orders cleared the user's days, and when. */
  private floors(): Floor[] {
    return this.db
      .select()
      .from(orderClears)
      .all()
      .map((row) => ({ clock: clockOfRow(row), from: row.fromDate }));
  }

  /**
   * Clears the own pattern and times of the days from `from` set before
   * the orders, each at the next cursor, and keeps where they cleared, so
   * an edit made before them that arrives later cannot bring them back.
   */
  private giveDaysToOrders(
    from: string,
    orders: RepeatOrdersRow,
    cursor: number
  ): Change[] {
    const floor: Floor = { clock: clockOfRow(orders), from };
    const stored = this.db
      .select()
      .from(orderClears)
      .where(eq(orderClears.fromDate, from))
      .get();
    if (!stored || compareClocks(clockOfRow(stored), floor.clock) < 0) {
      const row = { ...clockColumns(floor.clock), fromDate: from };
      this.db
        .insert(orderClears)
        .values(row)
        .onConflictDoUpdate({ set: row, target: orderClears.fromDate })
        .run();
    }
    const owned = this.db
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
      this.db
        .update(dayFields)
        .set(row)
        .where(
          and(eq(dayFields.date, row.date), eq(dayFields.field, row.field))
        )
        .run();
      return dayChange(row);
    });
  }

  private applyCoworker(
    edit: CoworkerValue,
    cursor: number
  ): Change | undefined {
    if (!(isId(edit.id) && edit.hlc && isId(edit.hlc.deviceId))) {
      return undefined;
    }
    const stored = this.db
      .select()
      .from(coworkers)
      .where(eq(coworkers.id, edit.id))
      .get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
      return undefined;
    }
    // A coworker newly kept past COWORKERS_MAX is refused, answered as
    // deleted, like a name that does not fit.
    const adding = edit.name !== undefined && (stored?.name ?? null) === null;
    const fits =
      edit.name === undefined ||
      (fitsCoworkerName(edit.name) && !(adding && this.coworkersFull()));
    const row: CoworkerRow = {
      ...clockColumns(writtenClock(clock, fits)),
      cursor,
      id: edit.id,
      name: fits ? (edit.name ?? null) : (stored?.name ?? null),
    };
    this.db
      .insert(coworkers)
      .values(row)
      .onConflictDoUpdate({ set: row, target: coworkers.id })
      .run();
    return coworkerChange(row);
  }

  /** Whether the user keeps COWORKERS_MAX coworkers already. */
  private coworkersFull(): boolean {
    const kept =
      this.db
        .select({ kept: count() })
        .from(coworkers)
        .where(isNotNull(coworkers.name))
        .get()?.kept ?? 0;
    return kept >= COWORKERS_MAX;
  }

  private applyCoworkerOrder(
    edit: CoworkerOrder,
    cursor: number
  ): Change | undefined {
    if (!(edit.hlc && isId(edit.hlc.deviceId))) {
      return undefined;
    }
    const stored = this.db.select().from(coworkerOrder).get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
      return undefined;
    }
    const fits = fitsCoworkerOrder(edit.ids);
    let ids = fits ? edit.ids : parseIds(stored?.ids ?? "[]");
    // An order past COWORKERS_MAX names coworkers the server refused: it
    // keeps the person's order of those they do keep.
    if (!fits && isIdList(edit.ids)) {
      const kept = new Set(
        this.db
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
    this.db
      .insert(coworkerOrder)
      .values(row)
      .onConflictDoUpdate({ set: row, target: coworkerOrder.id })
      .run();
    return coworkerOrderChange(row);
  }
}
