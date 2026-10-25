// The devices' push tokens (spec/sync-protocol.md, Push), kept in D1 with
// the session each was registered under, where the sessions are: a
// session's tokens go with it, and a token is one user's at a time.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { session } from "./db/auth-schema";
import { pushTokens } from "./db/schema";

/**
 * A device notifications go to: an iPhone through APNs, its sandbox for a
 * development build, or an Android phone through FCM.
 */
export type Device =
  | { platform: "apns"; token: string; sandbox: boolean }
  | { platform: "fcm"; token: string };

/**
 * Keeps the device's token under the session, moved from whichever
 * session, of this user or another, had it before.
 */
export const registerPushToken = async (
  db: D1Database,
  sessionId: string,
  device: Device
): Promise<void> => {
  const row = {
    platform: device.platform,
    sandbox: device.platform === "apns" && device.sandbox,
    sessionId,
    token: device.token,
    updatedAt: new Date(),
  };
  await drizzle(db)
    .insert(pushTokens)
    .values(row)
    .onConflictDoUpdate({ set: row, target: pushTokens.token });
};

/** The devices of every session of the user's. */
export const devicesOf = async (
  db: D1Database,
  userId: string
): Promise<Device[]> => {
  const rows = await drizzle(db)
    .select({
      platform: pushTokens.platform,
      sandbox: pushTokens.sandbox,
      token: pushTokens.token,
    })
    .from(pushTokens)
    .innerJoin(session, eq(session.id, pushTokens.sessionId))
    .where(eq(session.userId, userId));
  return rows.map(({ platform, sandbox, token }) =>
    platform === "apns" ? { platform, sandbox, token } : { platform, token }
  );
};

/** Drops a token its push service says is no longer the app's. */
export const dropPushToken = async (
  db: D1Database,
  token: string
): Promise<void> => {
  await drizzle(db).delete(pushTokens).where(eq(pushTokens.token, token));
};
