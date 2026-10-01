import { DurableObject } from "cloudflare:workers";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { fitsField, hasKey } from "./day-values";
import { ServerError_Code } from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  DayEdits,
  DayValue,
  PatternEdits,
  PatternOrder,
  PatternValue,
} from "./gen/pochical/v1/sync_pb";
import { clockAfter, compareClocks } from "./hlc";
import type { Clock } from "./hlc";
import { fitsOrder, fitsPattern, isId } from "./pattern-values";
import {
  acceptSyncSocket,
  handleSyncMessage,
  isSynced,
  rejectAndClose,
  send,
} from "./sync-socket";
import migrations from "./user-do-migrations/migrations.js";
import {
  dayFields,
  memberships,
  patternOrder,
  patterns,
} from "./user-do-schema";
import {
  clockColumns,
  clockOfHlc,
  clockOfRow,
  dayChange,
  encodePattern,
  orderChange,
  parseIds,
  patternChange,
} from "./user-do-values";
import type { DayRow, OrderRow, PatternRow } from "./user-do-values";

// A frame of changes stays well under a WebSocket message's size.
const CHANGES_PER_FRAME = 500;
// Edits in one frame; an outbox sends more as several.
const MAX_EDITS_PER_FRAME = 500;

const sendChanges = (ws: WebSocket, changes: Change[]): void => {
  for (let at = 0; at < changes.length; at += CHANGES_PER_FRAME) {
    send(ws, {
      case: "changes",
      value: { changes: changes.slice(at, at + CHANGES_PER_FRAME) },
    });
  }
};

/**
 * The clock a value is written with: the edit's own when the value fits,
 * else one just past it, so the device that made it takes the correction.
 */
const writtenClock = (clock: Clock, fits: boolean): Clock =>
  fits ? clock : clockAfter(clock, Date.now());

/**
 * One Durable Object per signed-in user, named by their better-auth user
 * id. It owns their days and their patterns, synced between their own
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

  /** Written as the user joins a group (joining is not built yet). */
  addMembership(groupId: string): void {
    this.db
      .insert(memberships)
      .values({ groupId, joinedAt: new Date() })
      .onConflictDoNothing()
      .run();
  }

  /** The user's own socket, forwarded once the Worker has checked them. */
  fetch(request: Request): Response {
    return acceptSyncSocket(this.ctx, request);
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    handleSyncMessage(ws, message, {
      dayEdits: (socket, edits) => {
        this.takeDayEdits(socket, edits);
      },
      patternEdits: (socket, edits) => {
        this.takePatternEdits(socket, edits);
      },
      welcome: (socket, cursor) => {
        this.welcome(socket, cursor);
      },
    });
  }

  /** The newest cursor across days and patterns, 0 before any. */
  private head(): number {
    const heads = [
      this.db
        .select({ head: max(dayFields.cursor) })
        .from(dayFields)
        .get(),
      this.db
        .select({ head: max(patterns.cursor) })
        .from(patterns)
        .get(),
      this.db
        .select({ head: max(patternOrder.cursor) })
        .from(patternOrder)
        .get(),
    ];
    return Math.max(0, ...heads.map((row) => row?.head ?? 0));
  }

  /** Every value changed after `cursor`, in cursor order. */
  private changesAfter(cursor: number): Change[] {
    const days = this.db
      .select()
      .from(dayFields)
      .where(gt(dayFields.cursor, cursor))
      .orderBy(asc(dayFields.cursor))
      .all();
    const kept = this.db
      .select()
      .from(patterns)
      .where(gt(patterns.cursor, cursor))
      .all();
    const order = this.db
      .select()
      .from(patternOrder)
      .where(gt(patternOrder.cursor, cursor))
      .all();
    return [
      ...days.map(dayChange),
      ...kept.map(patternChange),
      ...order.map(orderChange),
    ].toSorted((a, b) => (a.cursor < b.cursor ? -1 : 1));
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
   * Takes a frame of edits in one transaction, each given the next cursor
   * when it changes anything; acknowledges every edit and sends what
   * changed to every device of the user.
   */
  private takeEdits<Edit extends { opId: string }>(
    ws: WebSocket,
    edits: Edit[],
    apply: (edit: Edit, cursor: number) => Change | undefined
  ): void {
    if (edits.length > MAX_EDITS_PER_FRAME) {
      rejectAndClose(
        ws,
        ServerError_Code.BAD_FRAME,
        `At most ${MAX_EDITS_PER_FRAME} edits a frame`
      );
      return;
    }
    const changed = this.ctx.storage.transactionSync(() => {
      let cursor = this.head();
      const changes: Change[] = [];
      for (const edit of edits) {
        const change = apply(edit, cursor + 1);
        if (change) {
          cursor = Number(change.cursor);
          changes.push(change);
        }
      }
      return changes;
    });
    send(ws, {
      case: "acked",
      value: { opIds: edits.map(({ opId }) => opId) },
    });
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
    this.takeEdits(ws, edits, ({ value }, cursor) =>
      hasKey(value) ? this.applyDay(value, cursor) : undefined
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

  private applyDay(edit: DayValue, cursor: number): Change | undefined {
    const key = and(
      eq(dayFields.date, edit.date),
      eq(dayFields.field, edit.field)
    );
    const stored = this.db.select().from(dayFields).where(key).get();
    const clock = clockOfHlc(edit.hlc);
    if (stored && compareClocks(clock, clockOfRow(stored)) <= 0) {
      return undefined;
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
}
