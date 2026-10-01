import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import migrations from "./group-do-migrations/migrations.js";
import { profile } from "./group-do-schema";
import { acceptSyncSocket, handleSyncMessage } from "./sync-socket";

/** What the group shows of itself to members and to invite links. */
export type GroupProfile = {
  name: string;
  // Set when the group's mark is an emoji.
  emoji: string | null;
};

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

  /** Written when the group is created or renamed (neither is built yet). */
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
    handleSyncMessage(ws, message);
  }
}
