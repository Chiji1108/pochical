// Deleting a user's account (spec/sync-protocol.md, Deleting an account),
// in an order that may be run again: a deletion cut off part way is
// finished by trying again, as the user's session goes last.
import { Code, ConnectError } from "@connectrpc/connect";
import { waitUntil } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { revokeApple } from "./apple";
import { account } from "./db/auth-schema";
import { invites, supportChats } from "./db/schema";
import { getAuth } from "./session";
import { tellStaffOfDeletion } from "./slack";
import { deletePhotosUnder, eraseSupportChat } from "./support-chat";

/**
 * The Apple account the user signs in with, whose tokens must be revoked:
 * Apple's id for the person in this app, or undefined.
 */
const appleAccountOf = async (
  env: Env,
  userId: string
): Promise<string | undefined> => {
  const [linked] = await drizzle(env.DB)
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "apple")));
  return linked?.accountId;
};

/** A group whose last member's account went, gone whole. */
const eraseGroup = async (env: Env, groupId: string): Promise<void> => {
  await env.GROUPS.getByName(groupId).erase();
  await drizzle(env.DB).delete(invites).where(eq(invites.groupId, groupId));
  await deletePhotosUnder(env, `groups/${groupId}/`);
};

/**
 * Deletes everything of the user's account: Apple's tokens revoked first
 * (from `appleCode`, FAILED_PRECONDITION when one is needed and Apple
 * takes none); their part in every group they were ever in, a group they
 * were the last of gone whole; their chat with Pochical's people, said in
 * its Slack thread; their own values; and last their sign-ins, which
 * closes what is still open.
 */
export const deleteAccount = async (
  env: Env,
  userId: string,
  appleCode: string
): Promise<void> => {
  const apple = await appleAccountOf(env, userId);
  if (apple !== undefined) {
    if (appleCode === "") {
      throw new ConnectError(
        "Sign in with Apple again first",
        Code.FailedPrecondition
      );
    }
    const revoked = await revokeApple(env, appleCode, apple);
    if (revoked === "refused") {
      throw new ConnectError(
        "Apple did not take the code",
        Code.FailedPrecondition
      );
    }
  }
  const user = env.USERS.getByName(userId);
  for (const groupId of await user.groupsEver()) {
    // oxlint-disable-next-line no-await-in-loop -- one group at a time
    if (await env.GROUPS.getByName(groupId).deleteMember(userId)) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await eraseGroup(env, groupId);
    }
  }
  const [chat] = await drizzle(env.DB)
    .select({ thread: supportChats.slackThreadTs })
    .from(supportChats)
    .where(eq(supportChats.userId, userId));
  await eraseSupportChat(env, userId);
  if (chat?.thread !== undefined && chat.thread !== null) {
    waitUntil(tellStaffOfDeletion(env, chat.thread));
  }
  await user.erase();
  const auth = await getAuth().$context;
  await auth.internalAdapter.deleteUser(userId);
};
