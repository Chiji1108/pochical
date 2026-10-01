import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";

import { acceptSyncSocket, handleSyncMessage } from "./sync-socket";
import migrations from "./user-do-migrations/migrations.js";
import { memberships } from "./user-do-schema";

/**
 * One Durable Object per signed-in user, named by their better-auth user
 * id. It will own their shifts (spec/sync-protocol.md); for now it knows
 * which groups they are in, and holds their own socket.
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
    handleSyncMessage(ws, message);
  }
}
