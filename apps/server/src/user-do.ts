import { create } from "@bufbuild/protobuf";
import { DurableObject } from "cloudflare:workers";
import { and, asc, eq, gt, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { fitsField, hasKey } from "./day-values";
import {
  ChangeSchema,
  DayValueSchema,
  ServerError_Code,
} from "./gen/pochical/v1/sync_pb";
import type { Change, DayEdits, DayValue } from "./gen/pochical/v1/sync_pb";
import { clockAfter, compareClocks } from "./hlc";
import type { Clock } from "./hlc";
import {
  acceptSyncSocket,
  handleSyncMessage,
  isSynced,
  rejectAndClose,
  send,
} from "./sync-socket";
import migrations from "./user-do-migrations/migrations.js";
import { dayFields, memberships } from "./user-do-schema";

type DayRow = typeof dayFields.$inferSelect;

// A frame of changes stays well under a WebSocket message's size.
const CHANGES_PER_FRAME = 500;
// Edits in one frame; an outbox sends more as several.
const MAX_EDITS_PER_FRAME = 500;

const clockOf = (row: DayRow): Clock => ({
  counter: row.hlcCounter,
  device: row.hlcDevice,
  ms: row.hlcMs,
});

const changeOf = (row: DayRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "day",
      value: create(DayValueSchema, {
        date: row.date,
        field: row.field,
        hlc: {
          counter: row.hlcCounter,
          deviceId: row.hlcDevice,
          physicalMs: BigInt(row.hlcMs),
        },
        value: row.value ?? undefined,
      }),
    },
  });

const sendChanges = (ws: WebSocket, rows: DayRow[]): void => {
  for (let at = 0; at < rows.length; at += CHANGES_PER_FRAME) {
    send(ws, {
      case: "changes",
      value: {
        changes: rows.slice(at, at + CHANGES_PER_FRAME).map(changeOf),
      },
    });
  }
};

/**
 * One Durable Object per signed-in user, named by their better-auth user
 * id. It owns their days, synced between their own devices over their
 * socket (spec/sync-protocol.md, Shifts), and knows which groups they are
 * in.
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
      welcome: (socket, cursor) => {
        this.welcome(socket, cursor);
      },
    });
  }

  /** The newest cursor, 0 before anything was written. */
  private head(): number {
    return (
      this.db
        .select({ head: max(dayFields.cursor) })
        .from(dayFields)
        .get()?.head ?? 0
    );
  }

  private rowsAfter(cursor: number): DayRow[] {
    return this.db
      .select()
      .from(dayFields)
      .where(gt(dayFields.cursor, cursor))
      .orderBy(asc(dayFields.cursor))
      .all();
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
      sendChanges(ws, this.rowsAfter(0));
      return;
    }
    sendChanges(ws, this.rowsAfter(Number(cursor)));
  }

  /**
   * The owner's edits: each field taken when its clock is newer than the
   * one stored. An edit whose value does not fit its field is answered
   * with the stored value under a newer clock, so the device that made it
   * is corrected. All are acknowledged, and what changed goes to every
   * device of the user.
   */
  private takeDayEdits(ws: WebSocket, { edits }: DayEdits): void {
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
      const rows: DayRow[] = [];
      for (const { value } of edits) {
        const row = hasKey(value) ? this.apply(value, cursor + 1) : undefined;
        if (row) {
          ({ cursor } = row);
          rows.push(row);
        }
      }
      return rows;
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

  /** One edit, written at `cursor` when it changes anything. */
  private apply(edit: DayValue, cursor: number): DayRow | undefined {
    const key = and(
      eq(dayFields.date, edit.date),
      eq(dayFields.field, edit.field)
    );
    const stored = this.db.select().from(dayFields).where(key).get();
    const clock: Clock = {
      counter: edit.hlc?.counter ?? 0,
      device: edit.hlc?.deviceId ?? "",
      ms: Number(edit.hlc?.physicalMs ?? 0n),
    };
    if (stored && compareClocks(clock, clockOf(stored)) <= 0) {
      return undefined;
    }
    const fits = fitsField(edit.field, edit.value);
    const written = fits ? clock : clockAfter(clock, Date.now());
    const row: DayRow = {
      cursor,
      date: edit.date,
      field: edit.field,
      hlcCounter: written.counter,
      hlcDevice: written.device,
      hlcMs: written.ms,
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
    return row;
  }
}
