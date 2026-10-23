// Everything the server holds erased, before release (spec/admin.md,
// 全消去): every account as deleting it erases it, every group left, and
// the photos bucket. Each step may be run again, so a reset cut off part
// way is finished by running it again. To be removed before release
// (POC-155).
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { eraseGroup, eraseUser } from "./account-deletion";
import { user, verification } from "./db/auth-schema";
import {
  deletedAccounts,
  invites,
  reports,
  supportChats,
  supportSlack,
} from "./db/schema";
import { bucketPages, deletePhotosUnder } from "./photos";

/** What a reset erases, as it is now. */
export type ResetPreview = {
  /** Those with an account, and any an erasure cut off part way left. */
  users: number;
  /** Of the accounts, those never linked to Apple or Google. */
  anonymous: number;
  /**
   * Those with a live invitation (every group set up has one), and any
   * an erasure cut off part way left.
   */
  groups: number;
  supportChats: number;
  reports: number;
  objects: { count: number; bytes: number };
};

const GROUPS = "groups/";

/**
 * Whose data is kept: every user with an account, or with a chat with
 * Pochical's people that an erasure cut off part way left; and every
 * group with a live invitation or photos in the bucket: a group's erasure
 * deletes its photos, then its Group DO, then its invitation, so one cut
 * off part way is found again by what is left.
 */
const holders = async (env: Env) => {
  const db = drizzle(env.DB);
  const [accounts, chats, slack, invited] = await Promise.all([
    db.select({ id: user.id }).from(user).all(),
    db.select({ id: supportChats.userId }).from(supportChats).all(),
    db.selectDistinct({ id: supportSlack.userId }).from(supportSlack).all(),
    db.select({ id: invites.groupId }).from(invites).all(),
  ]);
  const groups = new Set(invited.map(({ id }) => id));
  for await (const page of bucketPages(env.PHOTOS, {
    delimiter: "/",
    prefix: GROUPS,
  })) {
    for (const dir of page.delimitedPrefixes) {
      groups.add(dir.slice(GROUPS.length, -1));
    }
  }
  return {
    groups: [...groups],
    users: [...new Set([...accounts, ...chats, ...slack].map(({ id }) => id))],
  };
};

/** Every object in the bucket counted and weighed, a page at a time. */
const weighBucket = async (bucket: R2Bucket) => {
  const weight = { bytes: 0, count: 0 };
  for await (const page of bucketPages(bucket, {})) {
    for (const { size } of page.objects) {
      weight.bytes += size;
      weight.count += 1;
    }
  }
  return weight;
};

/** What a reset would erase now, counted as it finds it. It only reads. */
export const previewReset = async (env: Env): Promise<ResetPreview> => {
  const db = drizzle(env.DB);
  const [{ groups, users }, [anonymous], [chats], [reported], objects] =
    await Promise.all([
      holders(env),
      db.select({ n: count() }).from(user).where(eq(user.isAnonymous, true)),
      db.select({ n: count() }).from(supportChats),
      db.select({ n: count() }).from(reports),
      weighBucket(env.PHOTOS),
    ]);
  return {
    anonymous: anonymous?.n ?? 0,
    groups: groups.length,
    objects,
    reports: reported?.n ?? 0,
    supportChats: chats?.n ?? 0,
    users: users.length,
  };
};

/**
 * Everything erased: each user as deleting their account erases them,
 * but for Apple's tokens, which only a fresh code from the person
 * revokes (signing in with Apple again makes a new user); then any
 * group still kept that no user's erasure reached; then what members
 * reported, with the deleted accounts noted for it, and better-auth's
 * sign-ins under way; and last every object left in the bucket. Run
 * again, it erases what a run cut off left, and after one that finished,
 * nothing.
 */
export const resetEverything = async (env: Env): Promise<void> => {
  const { users } = await holders(env);
  for (const userId of users) {
    // oxlint-disable-next-line no-await-in-loop -- one at a time, as users share groups
    await eraseUser(env, userId);
  }
  const { groups } = await holders(env);
  for (const groupId of groups) {
    // oxlint-disable-next-line no-await-in-loop -- as above
    await eraseGroup(env, groupId);
  }
  const db = drizzle(env.DB);
  await db.delete(reports);
  await db.delete(deletedAccounts);
  await db.delete(verification);
  await deletePhotosUnder(env, "");
};
