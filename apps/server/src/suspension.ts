import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { user } from "./db/auth-schema";

/**
 * Whether Pochical's people suspended the user (spec/admin.md, ユーザー):
 * what signing in and switching to an account both ask.
 */
export const isSuspended = async (
  d1: D1Database,
  userId: string
): Promise<boolean> => {
  const [row] = await drizzle(d1)
    .select({ suspendedAt: user.suspendedAt })
    .from(user)
    .where(eq(user.id, userId));
  return row?.suspendedAt !== null && row?.suspendedAt !== undefined;
};
