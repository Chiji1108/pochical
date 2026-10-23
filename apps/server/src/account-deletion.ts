// Deleting a user's account (spec/sync-protocol.md, Deleting an account),
// in an order that may be run again: a deletion cut off part way is
// finished by trying again, as the user's session goes last.
import { Code, ConnectError } from "@connectrpc/connect";
import { waitUntil } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { revokeApple } from "./apple";
import { account } from "./db/auth-schema";
import {
  erasingSlackThreads,
  invites,
  supportChats,
  supportSlack,
} from "./db/schema";
import { noteDeletedAccount } from "./report-retention";
import { getAuth } from "./session";
import { eraseSupportThread } from "./slack";
import { supportPlace } from "./support-lines";

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

/**
 * A group gone whole, as its last member's account goes (or everything,
 * at a reset): its Group DO first, which deletes its photos before its
 * notes of them, then its invitation, which finds it again should this be
 * cut off part way. Once the DO is erased, no one joins it: it is no
 * group to join (`addMember`).
 */
export const eraseGroup = async (env: Env, groupId: string): Promise<void> => {
  await env.GROUPS.getByName(groupId).erase();
  await drizzle(env.DB).delete(invites).where(eq(invites.groupId, groupId));
};

/**
 * Everything of a user gone but Apple's tokens: their part in every group
 * they were ever in, a group they were the last of gone whole; their chat
 * with Pochical's people, and the app's posts of it in Slack (now, or by
 * the daily cron while Slack does not take it); their own values; the
 * reports by or about them set to go a year on; and last their sign-ins
 * and provider accounts, which closes what is still open. Also how
 * switching to an account in use deletes the side not kept.
 */
export const eraseUser = async (env: Env, userId: string): Promise<void> => {
  const user = env.USERS.getByName(userId);
  // Every group they asked to make or join, noted before the group heard
  // of them, so none they are in is missed.
  for (const groupId of await user.groupsEver()) {
    // oxlint-disable-next-line no-await-in-loop -- one group at a time
    if (await env.GROUPS.getByName(groupId).deleteMember(userId)) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await eraseGroup(env, groupId);
    }
  }
  // Their chat with Pochical's people, kept as a group's chats are.
  await eraseGroup(env, supportPlace(userId));
  const db = drizzle(env.DB);
  const [chat] = await db
    .select({ thread: supportChats.slackThreadTs })
    .from(supportChats)
    .where(eq(supportChats.userId, userId));
  const thread = chat?.thread ?? null;
  // Its Slack thread noted to be erased as the index that finds it goes,
  // in one transaction, so a deletion cut off never loses track of it.
  const unindexed = [
    db.delete(supportChats).where(eq(supportChats.userId, userId)),
    db.delete(supportSlack).where(eq(supportSlack.userId, userId)),
  ] as const;
  if (thread === null) {
    await db.batch(unindexed);
  } else {
    await db.batch([
      db
        .insert(erasingSlackThreads)
        .values({ notedAt: new Date(), threadTs: thread })
        .onConflictDoNothing(),
      ...unindexed,
    ]);
    // Tried at once; the daily cron finishes what Slack did not take.
    waitUntil(eraseSupportThread(env, thread));
  }
  // With their own photos, and their uploads not taken.
  await user.erase();
  // The reports by or about them go a year from now.
  await noteDeletedAccount(env, userId, new Date());
  const auth = await getAuth().$context;
  await auth.internalAdapter.deleteUser(userId);
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
  await eraseUser(env, userId);
};

/**
 * How long a deleted account's Slack thread is looked at again after its
 * note: a post of the chat's relay under way as the chat was erased may
 * land after the first try, and a try this long after finds it.
 */
const THREAD_SETTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Each deleted account's Slack thread noted erased by `now`'s sweep (the
 * daily cron) of what the app posted there, its note kept until a try
 * past THREAD_SETTLE_MS finds nothing left; one Slack does not take waits
 * for the next sweep.
 */
export const eraseNotedSlackThreads = async (
  env: Env,
  now: Date
): Promise<void> => {
  const db = drizzle(env.DB);
  const noted = await db.select().from(erasingSlackThreads);
  for (const { notedAt, threadTs } of noted) {
    if (
      // oxlint-disable-next-line no-await-in-loop -- Slack takes one at a time
      (await eraseSupportThread(env, threadTs)) &&
      notedAt.getTime() <= now.getTime() - THREAD_SETTLE_MS
    ) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await db
        .delete(erasingSlackThreads)
        .where(eq(erasingSlackThreads.threadTs, threadTs));
    }
  }
};
