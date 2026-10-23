// Where a person signs in besides anonymously (spec/sync-protocol.md,
// Signing in): the proto's SignInProvider and better-auth's provider ids,
// which `account.provider_id` keeps.
import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { account } from "./db/auth-schema";
import { SignInProvider } from "./gen/pochical/v1/user_pb";

const PROVIDER_IDS = new Map([
  [SignInProvider.APPLE, "apple"],
  [SignInProvider.GOOGLE, "google"],
]);

/** better-auth's id for a provider; undefined for none. */
export const betterAuthProvider = (
  provider: SignInProvider | undefined
): string | undefined =>
  provider === undefined ? undefined : PROVIDER_IDS.get(provider);

/**
 * The provider the user is linked to, the first linked should there be
 * more; UNSPECIFIED while anonymous.
 */
export const linkedProvider = async (
  db: D1Database,
  userId: string
): Promise<SignInProvider> => {
  const [linked] = await drizzle(db)
    .select({ providerId: account.providerId })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        inArray(account.providerId, [...PROVIDER_IDS.values()])
      )
    )
    .orderBy(asc(account.createdAt))
    .limit(1);
  for (const [provider, id] of PROVIDER_IDS) {
    if (id === linked?.providerId) {
      return provider;
    }
  }
  return SignInProvider.UNSPECIFIED;
};
