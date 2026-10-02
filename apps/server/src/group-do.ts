import { fromBinary } from "@bufbuild/protobuf";
import { GROUP_MAX_MEMBERS } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import { asc, count, eq, gt, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { ChangesSchema } from "./gen/pochical/v1/sync_pb";
import type { Change } from "./gen/pochical/v1/sync_pb";
import migrations from "./group-do-migrations/migrations.js";
import {
  memberDays,
  memberPatterns,
  memberRepeatOrders,
  members,
  profile,
} from "./group-do-schema";
import {
  memberDayChange,
  memberPatternChange,
  memberRepeatOrdersChange,
  takeMemberDay,
  takeMemberPattern,
  takeMemberRepeatOrders,
} from "./group-shifts";
import {
  acceptSyncSocket,
  answerKeepalive,
  closeSessionSockets,
  handleSyncMessage,
  isSynced,
  send,
  sendChanges,
  sendWelcome,
} from "./sync-socket";

/** What the group shows of itself to members and to invite links. */
export type GroupProfile = {
  name: string;
  // Set when the group's mark is an emoji.
  emoji: string | null;
};

/** Someone in the group, as they appear in it. */
export type NewMember = { userId: string; displayName: string };

/** How a join went: in now, in already, or kept out of a full group. */
export type JoinResult = "added" | "already" | "full";

/** One kind of value the group keeps of its members, as GroupDO.logs lists them. */
type MemberLog = {
  after: (cursor: number) => Change[];
  table: typeof memberDays | typeof memberPatterns | typeof memberRepeatOrders;
};

/** One Durable Object per group, named by the group's id. */
export class GroupDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
    answerKeepalive(ctx);
    // Nothing reaches the group before its tables are up to date.
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  /** The group's name and mark, or null before the group is set up. */
  getProfile(): GroupProfile | null {
    const row = this.db
      .select({ emoji: profile.emoji, name: profile.name })
      .from(profile)
      .get();
    return row ?? null;
  }

  /**
   * Sets the group up with its first member. False when it already is, so
   * a group id is never set up twice.
   */
  create(group: GroupProfile, creator: NewMember): boolean {
    if (this.getProfile() !== null) {
      return false;
    }
    this.ctx.storage.transactionSync(() => {
      this.setProfile(group);
      this.addMember(creator);
    });
    return true;
  }

  /**
   * Adds a member unless they are in already or the group is full. The
   * object takes one call at a time, so two joins cannot both take the
   * last place.
   */
  addMember({ userId, displayName }: NewMember): JoinResult {
    if (this.isMember(userId)) {
      return "already";
    }
    if (this.memberCount() >= GROUP_MAX_MEMBERS) {
      return "full";
    }
    this.db
      .insert(members)
      .values({ displayName, joinedAt: new Date(), userId })
      .run();
    return "added";
  }

  /** Everyone in the group as they appear in it, in the order they joined. */
  memberList(): { displayName: string }[] {
    return this.db
      .select({ displayName: members.displayName })
      .from(members)
      .orderBy(asc(members.joinedAt))
      .all();
  }

  /** Closes a member's sockets opened with a session that has ended. */
  endSession(sessionId: string): void {
    closeSessionSockets(this.ctx, sessionId);
  }

  /** Whether the user is in the group. */
  isMember(userId: string): boolean {
    return (
      this.db
        .select({ userId: members.userId })
        .from(members)
        .where(eq(members.userId, userId))
        .get() !== undefined
    );
  }

  /** How many are in the group. */
  memberCount(): number {
    return this.db.select({ n: count() }).from(members).get()?.n ?? 0;
  }

  /** Written when the group is created, and later when it is renamed. */
  setProfile({ name, emoji }: GroupProfile): void {
    this.db
      .insert(profile)
      .values({ emoji, id: 1, name })
      .onConflictDoUpdate({ set: { emoji, name }, target: profile.id })
      .run();
  }

  /** A member's socket, forwarded once the Worker has checked them. */
  fetch(request: Request): Response {
    return acceptSyncSocket(this.ctx, request);
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    handleSyncMessage(ws, message, {
      welcome: (socket, cursor) => {
        this.welcome(socket, cursor);
      },
    });
  }

  /**
   * A member's shared days and patterns, pushed by their User DO as
   * pochical.v1.Changes' bytes: each value kept when newer, at the group's
   * own cursor, and sent to everyone with the group open. Pushes from
   * someone no longer in the group are dropped.
   */
  takeMemberShifts(userId: string, pushed: Uint8Array): void {
    if (!this.isMember(userId)) {
      return;
    }
    const { changes } = fromBinary(ChangesSchema, pushed);
    const taken = this.ctx.storage.transactionSync(() => {
      let cursor = this.head();
      const kept: Change[] = [];
      for (const { kind } of changes) {
        let change: Change | undefined;
        if (kind.case === "day") {
          change = takeMemberDay(this.db, userId, kind.value, cursor + 1);
        } else if (kind.case === "pattern") {
          change = takeMemberPattern(this.db, userId, kind.value, cursor + 1);
        } else if (kind.case === "repeatOrders") {
          change = takeMemberRepeatOrders(
            this.db,
            userId,
            kind.value,
            cursor + 1
          );
        }
        if (change) {
          cursor = Number(change.cursor);
          kept.push(change);
        }
      }
      return kept;
    });
    for (const socket of this.ctx.getWebSockets()) {
      if (isSynced(socket)) {
        sendChanges(socket, taken);
      }
    }
  }

  /**
   * Every kind of value the group keeps of its members, in one list so
   * catch-up and the cursor head cover the same ones.
   */
  private logs(): MemberLog[] {
    const { db } = this;
    return [
      {
        after: (cursor) =>
          db
            .select()
            .from(memberDays)
            .where(gt(memberDays.cursor, cursor))
            .all()
            .map(memberDayChange),
        table: memberDays,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberPatterns)
            .where(gt(memberPatterns.cursor, cursor))
            .all()
            .map(memberPatternChange),
        table: memberPatterns,
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberRepeatOrders)
            .where(gt(memberRepeatOrders.cursor, cursor))
            .all()
            .map(memberRepeatOrdersChange),
        table: memberRepeatOrders,
      },
    ];
  }

  /** The newest cursor of the group's log, 0 before any. */
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
    return this.logs()
      .flatMap(({ after }) => after(cursor))
      .toSorted((a, b) => (a.cursor < b.cursor ? -1 : 1));
  }

  /**
   * Welcome, then every value changed after the member's cursor; one ahead
   * of the group is told to reset and gets everything.
   */
  private welcome(ws: WebSocket, cursor: bigint): void {
    const head = this.head();
    sendWelcome(ws, head);
    if (cursor > BigInt(head)) {
      send(ws, { case: "reset", value: {} });
      sendChanges(ws, this.changesAfter(0));
      return;
    }
    sendChanges(ws, this.changesAfter(Number(cursor)));
  }
}
