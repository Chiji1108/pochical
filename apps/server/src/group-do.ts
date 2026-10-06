import { create, fromBinary } from "@bufbuild/protobuf";
import { GROUP_MAX_MEMBERS, syncLimits } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import { and, asc, count, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import {
  ChangeSchema,
  ChangesSchema,
  ServerError_Code,
} from "./gen/pochical/v1/sync_pb";
import type { Change, ChatEdits } from "./gen/pochical/v1/sync_pb";
import {
  chatChangesAfter,
  chatHead,
  chatPage,
  GROUP_THREAD,
  moveReadMark,
  takeChatEdit,
} from "./group-chat";
import migrations from "./group-do-migrations/migrations.js";
import {
  logHead,
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
  broadcastChanges,
  rejectAndClose,
  send,
  byCursor,
  closeSessionSockets,
  closeUserSockets,
  handleSyncMessage,
  welcome,
} from "./sync-socket";

/** What the group shows of itself to members and to invite links. */
export type GroupProfile = {
  name: string;
  // Set when the group's mark is an emoji.
  emoji: string | null;
};

/** Someone in the group, as they appear in it. */
type NewMember = { userId: string; displayName: string };

/** How a join went: in now, in already, or kept out of a full group. */
type JoinResult = "added" | "already" | "full";

type ProfileRow = Pick<
  typeof profile.$inferSelect,
  "cursor" | "emoji" | "name"
>;
type MemberRow = typeof members.$inferSelect;

const profileChange = ({ cursor, emoji, name }: ProfileRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(cursor),
    kind: { case: "groupProfile", value: { emoji: emoji ?? "", name } },
  });

const memberChange = ({
  cursor,
  displayName,
  joinedAt,
  leftAt,
  userId,
}: MemberRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(cursor),
    kind: {
      case: "member",
      value: {
        displayName,
        joinedAtMs: BigInt(joinedAt.getTime()),
        left: leftAt !== null,
        userId,
      },
    },
  });

/** Someone in the group now: their row, not left. */
const inGroup = (userId?: string) =>
  and(
    isNull(members.leftAt),
    userId === undefined ? undefined : eq(members.userId, userId)
  );

/** One kind of value the group keeps, as GroupDO.logs lists them. */
type MemberLog = {
  after: (cursor: number) => Change[];
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
      this.writeProfile(group);
      this.writeMember(creator);
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
    const joined = this.ctx.storage.transactionSync(() => {
      const member = this.writeMember({ displayName, userId });
      // Lines from before they joined are not unread to them.
      const head = chatHead(this.db, GROUP_THREAD);
      const cursor = this.head() + 1;
      const mark = moveReadMark(this.db, userId, GROUP_THREAD, head, cursor);
      if (mark) {
        this.setHead(cursor);
      }
      return mark ? [member, mark] : [member];
    });
    broadcastChanges(this.ctx, joined);
    return "added";
  }

  /** Everyone in the group as they appear in it, in the order they joined. */
  memberList(): { displayName: string; userId: string }[] {
    return this.db
      .select({ displayName: members.displayName, userId: members.userId })
      .from(members)
      .where(inGroup())
      .orderBy(asc(members.joinedAt))
      .all();
  }

  /**
   * How the member appears in the group from now on; false when they are
   * not in it.
   */
  setDisplayName(userId: string, displayName: string): boolean {
    const changed = this.ctx.storage.transactionSync(() => {
      if (!this.isMember(userId)) {
        return undefined;
      }
      return this.db
        .update(members)
        .set({ cursor: this.nextCursor(), displayName })
        .where(eq(members.userId, userId))
        .returning()
        .get();
    });
    if (changed === undefined) {
      return false;
    }
    broadcastChanges(this.ctx, [memberChange(changed)]);
    return true;
  }

  /**
   * Takes the member out: their row stays as left, at the next cursor, so
   * devices catching up hear of it, and their shifts go. Their sockets
   * here close. Leaving when not in it changes nothing.
   */
  removeMember(userId: string): void {
    const left = this.ctx.storage.transactionSync(() => {
      if (!this.isMember(userId)) {
        return undefined;
      }
      this.db.delete(memberDays).where(eq(memberDays.userId, userId)).run();
      this.db
        .delete(memberPatterns)
        .where(eq(memberPatterns.userId, userId))
        .run();
      this.db
        .delete(memberRepeatOrders)
        .where(eq(memberRepeatOrders.userId, userId))
        .run();
      return this.db
        .update(members)
        .set({ cursor: this.nextCursor(), leftAt: new Date() })
        .where(eq(members.userId, userId))
        .returning()
        .get();
    });
    if (left === undefined) {
      return;
    }
    closeUserSockets(this.ctx, userId);
    broadcastChanges(this.ctx, [memberChange(left)]);
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
        .where(inGroup(userId))
        .get() !== undefined
    );
  }

  /** How many are in the group. */
  memberCount(): number {
    return (
      this.db.select({ n: count() }).from(members).where(inGroup()).get()?.n ??
      0
    );
  }

  /** Written when the group is created, and later when it is renamed. */
  setProfile(group: GroupProfile): void {
    broadcastChanges(this.ctx, [this.writeProfile(group)]);
  }

  /** The group's name and mark at the next cursor, as a change. */
  private writeProfile({ name, emoji }: GroupProfile): Change {
    const cursor = this.nextCursor();
    this.db
      .insert(profile)
      .values({ cursor, emoji, id: 1, name })
      .onConflictDoUpdate({ set: { cursor, emoji, name }, target: profile.id })
      .run();
    return profileChange({ cursor, emoji, name });
  }

  /** A new member at the next cursor, or one who left coming back, as a change. */
  private writeMember({ userId, displayName }: NewMember): Change {
    const row = {
      cursor: this.nextCursor(),
      displayName,
      joinedAt: new Date(),
      leftAt: null,
      userId,
    };
    this.db
      .insert(members)
      .values(row)
      .onConflictDoUpdate({ set: row, target: members.userId })
      .run();
    return memberChange(row);
  }

  /** Gives out the cursor after the newest, for a value written now. */
  private nextCursor(): number {
    const cursor = this.head() + 1;
    this.setHead(cursor);
    return cursor;
  }

  /** A member's socket, forwarded once the Worker has checked them. */
  fetch(request: Request): Response {
    return acceptSyncSocket(this.ctx, request);
  }

  webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    handleSyncMessage(ws, message, {
      chatEdits: (socket, userId, edits) => {
        this.takeChatEdits(socket, userId, edits);
      },
      chatPageRequest: (socket, { threadId, beforeSeq }) => {
        send(socket, {
          case: "chatPage",
          value: {
            beforeSeq,
            threadId,
            ...chatPage(this.db, threadId, beforeSeq),
          },
        });
      },
      welcome: (socket, cursor) => {
        welcome(socket, cursor, this.head(), (after) =>
          this.changesAfter(after)
        );
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
      return undefined;
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
      if (kept.length > 0) {
        this.db
          .insert(logHead)
          .values({ cursor, id: 1 })
          .onConflictDoUpdate({ set: { cursor }, target: logHead.id })
          .run();
      }
      return kept;
    });
    broadcastChanges(this.ctx, taken);
  }

  /**
   * A member's chat edits in one transaction, each change at the next
   * cursor; sends what changed to everyone with the group open, the lines
   * a refused edit concerned back to the sender, then acknowledges every
   * edit to the sender, as the User DO does its owner's (spec/sync-protocol.md,
   * Outbox). Someone not in the group is refused.
   */
  private takeChatEdits(
    ws: WebSocket,
    userId: string,
    { edits }: ChatEdits
  ): void {
    if (edits.length > syncLimits.editsPerFrame) {
      rejectAndClose(
        ws,
        ServerError_Code.BAD_FRAME,
        `At most ${syncLimits.editsPerFrame} edits a frame`
      );
      return;
    }
    if (!this.isMember(userId)) {
      rejectAndClose(ws, ServerError_Code.BAD_FRAME, "Not in the group");
      return;
    }
    const { changed, refused } = this.ctx.storage.transactionSync(() => {
      const made: Change[] = [];
      const back: Change[] = [];
      for (const edit of edits) {
        const cursor = this.head() + 1;
        const taken = takeChatEdit(this.db, userId, edit, cursor);
        if (taken.change) {
          this.setHead(cursor);
          made.push(taken.change);
        }
        if (taken.refused) {
          back.push(taken.refused);
        }
      }
      return { changed: made, refused: back };
    });
    broadcastChanges(this.ctx, changed);
    if (refused.length > 0) {
      send(ws, { case: "changes", value: { changes: refused } });
    }
    send(ws, {
      case: "acked",
      value: { opIds: edits.map(({ opId }) => opId) },
    });
  }

  /** Moves the log's head to `cursor`, a value having been written there. */
  private setHead(cursor: number): void {
    this.db
      .insert(logHead)
      .values({ cursor, id: 1 })
      .onConflictDoUpdate({ set: { cursor }, target: logHead.id })
      .run();
  }

  /**
   * Every kind of value the group keeps, of itself and its members, in
   * one list so catch-up covers them all.
   */
  private logs(): MemberLog[] {
    const { db } = this;
    return [
      {
        after: (cursor) =>
          db
            .select()
            .from(profile)
            .where(gt(profile.cursor, cursor))
            .all()
            .map(profileChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(members)
            .where(gt(members.cursor, cursor))
            .all()
            .map(memberChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberDays)
            .where(gt(memberDays.cursor, cursor))
            .all()
            .map(memberDayChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberPatterns)
            .where(gt(memberPatterns.cursor, cursor))
            .all()
            .map(memberPatternChange),
      },
      {
        after: (cursor) =>
          db
            .select()
            .from(memberRepeatOrders)
            .where(gt(memberRepeatOrders.cursor, cursor))
            .all()
            .map(memberRepeatOrdersChange),
      },
    ];
  }

  /**
   * The newest cursor the group's log has given out, 0 before any: kept
   * in a row of its own, not read off the values, which leaving members
   * take away.
   */
  private head(): number {
    return (
      this.db.select({ cursor: logHead.cursor }).from(logHead).get()?.cursor ??
      0
    );
  }

  /**
   * Every value changed after `cursor`, in cursor order; of the chats'
   * lines, those chatChangesAfter gives.
   */
  private changesAfter(cursor: number): Change[] {
    return byCursor([
      ...this.logs().flatMap(({ after }) => after(cursor)),
      ...chatChangesAfter(this.db, cursor),
    ]);
  }
}
