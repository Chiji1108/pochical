import { verifyProviderIdToken } from "@better-auth/core/oauth2";
// Switching to an account in use (spec/sync-protocol.md): a device whose
// user links a provider's account (Apple or Google) that is another user's
// already keeps one side whole and deletes the other. Both calls take the
// provider's ID token and the nonce it was asked with, as linking does,
// which proves the person holds the account.
import { Code, ConnectError } from "@connectrpc/connect";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { eraseUser } from "./account-deletion";
import { account } from "./db/auth-schema";
import type { ProviderToken } from "./gen/pochical/v1/user_pb";
import { getAuth } from "./session";
import { betterAuthProvider } from "./sign-in-providers";
import { isSuspended } from "./suspension";

/** A provider's account, as better-auth keys it. */
type ProviderAccount = { providerId: string; accountId: string };

/**
 * The provider's account an ID token is of, once checked; else
 * UNAUTHENTICATED, or INVALID_ARGUMENT for no provider or no nonce.
 */
const accountOf = async (
  token: ProviderToken | undefined
): Promise<ProviderAccount> => {
  const providerId = betterAuthProvider(token?.provider);
  if (token === undefined || providerId === undefined) {
    throw new ConnectError("No provider", Code.InvalidArgument);
  }
  // better-auth checks the nonce only when one is given (auth.ts).
  if (token.nonce === "") {
    throw new ConnectError("No nonce", Code.InvalidArgument);
  }
  const auth = await getAuth().$context;
  const provider = auth.socialProviders.find(({ id }) => id === providerId);
  const verified =
    provider !== undefined &&
    (await verifyProviderIdToken(provider, token.idToken, token.nonce));
  const info = verified
    ? await provider.getUserInfo({ idToken: token.idToken })
    : null;
  const data = info?.data;
  const subject: unknown =
    data !== undefined && "sub" in data ? data.sub : undefined;
  if (typeof subject !== "string") {
    throw new ConnectError("Not the provider's word", Code.Unauthenticated);
  }
  return { accountId: subject, providerId };
};

/** The user the provider's account is linked to, if any. */
const userWith = async (
  env: Env,
  { accountId, providerId }: ProviderAccount
): Promise<string | undefined> => {
  const [linked] = await drizzle(env.DB)
    .select({ userId: account.userId })
    .from(account)
    .where(
      and(eq(account.providerId, providerId), eq(account.accountId, accountId))
    );
  return linked?.userId;
};

/**
 * Refuses a suspended account (PERMISSION_DENIED), which the apps say as
 * such: switching to it would sign in as it, and keeping the device's
 * data would delete it and take its provider's account elsewhere, out of
 * the suspension (spec/admin.md, ユーザー).
 */
const refuseSuspended = async (env: Env, userId: string): Promise<void> => {
  if (await isSuspended(env.DB, userId)) {
    throw new ConnectError("This account is suspended", Code.PermissionDenied);
  }
};

/**
 * What the account an ID token is of holds, when it is another user's
 * than `callerId`: for the person to choose which side to keep.
 */
export const peekAccount = async (
  env: Env,
  callerId: string,
  token: ProviderToken | undefined
) => {
  const other = await userWith(env, await accountOf(token));
  if (other === undefined || other === callerId) {
    throw new ConnectError("No other user holds it", Code.NotFound);
  }
  await refuseSuspended(env, other);
  return await env.USERS.getByName(other).holdings();
};

/**
 * Keeps the caller's data: the account's user deleted, everything of it
 * with it, and the provider's account linked to the caller instead, which
 * makes them anonymous no more. Again after it was done, nothing changes.
 * A caller linked to a provider already is refused (FAILED_PRECONDITION)
 * before anything is deleted, as a user is linked to one at most.
 */
export const takeAccount = async (
  env: Env,
  caller: { id: string; anonymous: boolean },
  token: ProviderToken | undefined
): Promise<void> => {
  const linking = await accountOf(token);
  const other = await userWith(env, linking);
  if (other === caller.id) {
    return;
  }
  if (!caller.anonymous) {
    throw new ConnectError("Linked already", Code.FailedPrecondition);
  }
  if (other !== undefined) {
    await refuseSuspended(env, other);
    await eraseUser(env, other);
  }
  const auth = await getAuth().$context;
  await auth.internalAdapter.createAccount({ ...linking, userId: caller.id });
};
