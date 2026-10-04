import { create, toBinary } from "@bufbuild/protobuf";
import { syncLimits } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import { and, eq, gt, inArray, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { hasKey, SHARED_DAY_FIELDS } from "./day-values";
import { ChangesSchema, ServerError_Code } from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  CoworkerEdits,
  DayEdits,
  Hlc,
  PatternEdits,
  RepeatOrdersEdits,
} from "./gen/pochical/v1/sync_pb";
import { isAhead } from "./hlc";
import {
  acceptSyncSocket,
  answerKeepalive,
  broadcastChanges,
  byCursor,
  closeSessionSockets,
  handleSyncMessage,
  rejectAndClose,
  send,
  welcome,
} from "./sync-socket";
import {
  applyCoworker,
  applyCoworkerOrder,
  applyDay,
  applyPattern,
  applyPatternOrder,
  applyRepeatOrders,
  orderFloors,
} from "./user-do-edits";
import migrations from "./user-do-migrations/migrations.js";
import {
  coworkerOrder,
  coworkers,
  dayFields,
  groupRequests,
  memberships,
  patternOrder,
  patterns,
  repeatOrders,
} from "./user-do-schema";
import {
  clockOfHlc,
  coworkerChange,
  coworkerOrderChange,
  dayChange,
  orderChange,
  patternChange,
  repeatOrdersChange,
} from "./user-do-values";

// Values in one push to a group.
const VALUES_PER_PUSH = 500;
// After a push to a group fails, the alarm comes back for it after this
// long, twice as long each time it fails in a row, up to the most…
export const PUSH_RETRY_FIRST_MS = 10_000;
const PUSH_RETRY_MOST_MS = 3_600_000;
// …and stops coming back after this many in a row, about a day: the
// user's next change tries it again.
const PUSH_RETRIES_MOST = 30;

// How many pushes to the group have failed in a row, in the DO's storage.
const pushFailuresKey = (groupId: string): string => `pushFailures:${groupId}`;

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

/**
 * One Durable Object per signed-in user, named by their better-auth user
 * id. It owns their days, patterns, repeating orders and coworkers, synced between their own
 * devices over their socket (spec/sync-protocol.md, Shifts), and knows
 * which groups they are in.
 */
export class UserDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase;
  // Set when a change asks for a push, so an alarm running meanwhile
  // leaves the next one to it.
  private pushRequested = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    answerKeepalive(ctx);
    // Nothing reaches the user before their tables are up to date.
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /**
   * Closes the sockets the session opened, here and in the user's groups,
   * once it has ended.
   */
  async endSession(sessionId: string): Promise<void> {
    closeSessionSockets(this.ctx, sessionId);
    const groups = this.db
      .select({ groupId: memberships.groupId })
      .from(memberships)
      .all();
    await Promise.all(
      groups.map(async ({ groupId }) => {
        await this.env.GROUPS.getByName(groupId).endSession(sessionId);
      })
    );
  }

  /** The group the user's request made, or null for a new request. */
  groupOf(requestId: string): string | null {
    return (
      this.db
        .select({ groupId: groupRequests.groupId })
        .from(groupRequests)
        .where(eq(groupRequests.requestId, requestId))
        .get()?.groupId ?? null
    );
  }

  /**
   * The id of the group the user's request makes: a new one the first
   * time the request id comes, the same one each time after, so a
   * repeated CreateGroup sets up the same group. The object takes one call
   * at a time, so two tries at once get the same id.
   */
  groupIdFor(requestId: string): string {
    const made = this.groupOf(requestId);
    if (made !== null) {
      return made;
    }
    const groupId = crypto.randomUUID();
    this.db.insert(groupRequests).values({ groupId, requestId }).run();
    return groupId;
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
   *
   * The runtime's own retries of an alarm that throws stop after a few,
   * which would leave the values waiting for the user's next change, so
   * the alarm comes back for a failed group itself, each group waiting by
   * its own failures. A change made while it runs has set the next alarm
   * already, which is kept.
   */
  async alarm(): Promise<void> {
    const userId = this.ctx.id.name;
    if (userId === undefined) {
      return;
    }
    this.pushRequested = false;
    const head = this.head();
    const groups = this.db.select().from(memberships).all();
    const retries: number[] = [];
    for (const { groupId, pushedCursor } of groups) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one group at a time
        await this.pushTo(groupId, userId, this.sharedAfter(pushedCursor));
      } catch (error) {
        console.error(`Pushing to group ${groupId} failed`, error);
        const wait = this.pushFailed(groupId);
        if (wait !== undefined) {
          retries.push(wait);
        }
        continue;
      }
      this.pushSucceeded(groupId);
      this.db
        .update(memberships)
        .set({ pushedCursor: head })
        .where(eq(memberships.groupId, groupId))
        .run();
    }
    if (!this.pushRequested && retries.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + Math.min(...retries));
    }
  }

  /**
   * Counts a failed push to the group: how long to wait before trying it
   * again, or undefined once it has failed too many times in a row.
   */
  private pushFailed(groupId: string): number | undefined {
    const { kv } = this.ctx.storage;
    const stored: unknown = kv.get(pushFailuresKey(groupId));
    const failures = (typeof stored === "number" ? stored : 0) + 1;
    kv.put(pushFailuresKey(groupId), failures);
    if (failures > PUSH_RETRIES_MOST) {
      return undefined;
    }
    return Math.min(
      PUSH_RETRY_FIRST_MS * 2 ** (failures - 1),
      PUSH_RETRY_MOST_MS
    );
  }

  private pushSucceeded(groupId: string): void {
    const { kv } = this.ctx.storage;
    if (kv.get(pushFailuresKey(groupId)) !== undefined) {
      kv.delete(pushFailuresKey(groupId));
    }
  }

  private schedulePush(): void {
    this.pushRequested = true;
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
                // Only the fields groups see: memos and people, and any
                // field not named there, stay with their owner.
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
        welcome(socket, cursor, this.head(), (after) =>
          this.changesAfter(after)
        );
      },
    });
  }

  /**
   * Takes a frame of edits in one transaction, each change given the next
   * cursor; sends what changed to every device of the user, then
   * acknowledges every edit to the sender. An edit may change nothing, one value, or several
   * (an order and the days it takes back), from `cursor` on. A frame with
   * a clock too far past the server's time is refused whole, so the
   * device corrects its clock and sends the edits again.
   */
  private takeEdits<Edit extends { opId: string }>(
    ws: WebSocket,
    edits: Edit[],
    clockOf: (edit: Edit) => Hlc | undefined,
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
    const now = Date.now();
    if (edits.some((edit) => isAhead(clockOfHlc(clockOf(edit)), now))) {
      rejectAndClose(
        ws,
        ServerError_Code.CLOCK_AHEAD,
        `A clock runs more than ${syncLimits.clockAheadMs} ms past the server's`
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
    if (changed.length > 0) {
      this.schedulePush();
    }
    broadcastChanges(this.ctx, changed);
    // After the changes, so the sender has the server's value by the time
    // its edits leave the outbox (spec/sync-protocol.md, Outbox).
    send(ws, {
      case: "acked",
      value: { opIds: edits.map(({ opId }) => opId) },
    });
  }

  /**
   * The owner's day edits: each field taken when its clock is newer than
   * the one stored. An edit whose value does not fit its field is answered
   * with the stored value under a newer clock, so the device that made it
   * is corrected; one for no real day or field is only acknowledged.
   */
  private takeDayEdits(ws: WebSocket, { edits }: DayEdits): void {
    // Read once a frame: no day edit lays a floor.
    const floors = orderFloors(this.db);
    this.takeEdits(
      ws,
      edits,
      ({ value }) => value?.hlc,
      ({ value }, cursor) =>
        hasKey(value) ? applyDay(this.db, value, cursor, floors) : undefined
    );
  }

  /** The owner's pattern edits, taken as their days are. */
  private takePatternEdits(ws: WebSocket, { edits }: PatternEdits): void {
    this.takeEdits(
      ws,
      edits,
      ({ kind }) => kind.value?.hlc,
      ({ kind }, cursor) => {
        if (kind.case === "pattern") {
          return applyPattern(this.db, kind.value, cursor);
        }
        if (kind.case === "order") {
          return applyPatternOrder(this.db, kind.value, cursor);
        }
        return undefined;
      }
    );
  }

  /** The owner's repeating orders, each edit one whole timeline. */
  private takeRepeatOrdersEdits(
    ws: WebSocket,
    { edits }: RepeatOrdersEdits
  ): void {
    this.takeEdits(
      ws,
      edits,
      ({ orders }) => orders?.hlc,
      (edit, cursor) => applyRepeatOrders(this.db, edit, cursor)
    );
  }

  /** The owner's coworker edits, taken as their patterns are. */
  private takeCoworkerEdits(ws: WebSocket, { edits }: CoworkerEdits): void {
    this.takeEdits(
      ws,
      edits,
      ({ kind }) => kind.value?.hlc,
      ({ kind }, cursor) => {
        if (kind.case === "coworker") {
          return applyCoworker(this.db, kind.value, cursor);
        }
        if (kind.case === "order") {
          return applyCoworkerOrder(this.db, kind.value, cursor);
        }
        return undefined;
      }
    );
  }
}
