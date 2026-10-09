import { verifyProviderIdToken } from "@better-auth/core/oauth2";
// Switching to an account in use (spec/sync-protocol.md): a device whose
// user links a Sign in with Apple account that is another user's already
// keeps one side whole and deletes the other. Both calls take Apple's ID
// token and the nonce it was asked with, as linking does, which proves
// the person holds the account.
import { Code, ConnectError } from "@connectrpc/connect";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { eraseUser } from "./account-deletion";
import { account } from "./db/auth-schema";
import { getAuth } from "./session";

const APPLE = "apple";

/** The Apple account an ID token is of, once checked; else UNAUTHENTICATED. */
const appleSubjectOf = async (
  token: string,
  nonce: string
): Promise<string> => {
  const auth = await getAuth().$context;
  const provider = auth.socialProviders.find(({ id }) => id === APPLE);
  const verified =
    provider !== undefined &&
    (await verifyProviderIdToken(provider, token, nonce));
  const info = verified ? await provider.getUserInfo({ idToken: token }) : null;
  const data = info?.data;
  const subject: unknown =
    data !== undefined && "sub" in data ? data.sub : undefined;
  if (typeof subject !== "string") {
    throw new ConnectError("Not Apple's word", Code.Unauthenticated);
  }
  return subject;
};

/** The user the Apple account is linked to, if any. */
const userWith = async (
  env: Env,
  subject: string
): Promise<string | undefined> => {
  const [linked] = await drizzle(env.DB)
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, APPLE), eq(account.accountId, subject)));
  return linked?.userId;
};

/**
 * What the account an ID token is of holds, when it is another user's
 * than `callerId`: for the person to choose which side to keep.
 */
export const peekAccount = async (
  env: Env,
  callerId: string,
  token: string,
  nonce: string
) => {
  const other = await userWith(env, await appleSubjectOf(token, nonce));
  if (other === undefined || other === callerId) {
    throw new ConnectError("No other user holds it", Code.NotFound);
  }
  return await env.USERS.getByName(other).holdings();
};

/**
 * Keeps the caller's data: the account's user deleted, everything of it
 * with it, and the Apple account linked to the caller instead, which
 * makes them anonymous no more. Again after it was done, nothing changes.
 */
export const takeAccount = async (
  env: Env,
  callerId: string,
  token: string,
  nonce: string
): Promise<void> => {
  const subject = await appleSubjectOf(token, nonce);
  const other = await userWith(env, subject);
  if (other === callerId) {
    return;
  }
  if (other !== undefined) {
    await eraseUser(env, other);
  }
  const auth = await getAuth().$context;
  await auth.internalAdapter.createAccount({
    accountId: subject,
    providerId: APPLE,
    userId: callerId,
  });
};
