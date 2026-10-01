import { GROUP_MAX_MEMBERS } from "@pochical/design/limits";
import { DurableObject } from "cloudflare:workers";
import { asc, count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import migrations from "./group-do-migrations/migrations.js";
import { members, profile } from "./group-do-schema";
import { acceptSyncSocket, handleSyncMessage, send } from "./sync-socket";

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

/** One Durable Object per group, named by the group's id. */
export class GroupDO extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage);
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
      // The group's change log does not exist yet; cursor 0 means
      // "nothing to sync".
      welcome: (socket) => {
        send(socket, { case: "welcome", value: { cursor: 0n } });
      },
    });
  }
}
