// What Pochical's people's admin site (apps/admin, admin.pochical.app)
// asks of the server, as Workers RPC through its service binding to this
// named entrypoint (spec/admin.md). Nothing here has a public address: the
// apps and the internet reach only the default entrypoint's fetch.
import { create } from "@bufbuild/protobuf";
import { WorkerEntrypoint } from "cloudflare:workers";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { auditBucket, cleanBucket } from "./bucket-audit";
import type { BucketAudit, BucketCleanup } from "./bucket-audit";
import { account, session, user } from "./db/auth-schema";
import { pushTokens, reports, supportChats } from "./db/schema";
import { ChatEditSchema } from "./gen/pochical/v1/sync_pb";
import { GROUP_THREAD } from "./group-chat";
import { photoKey } from "./photos";
import { previewReset, resetEverything } from "./reset";
import type { ResetPreview } from "./reset";
import { supportPlace } from "./support-lines";
import type { SupportLine } from "./support-lines";

/** A user's chat as the list shows it: its latest line, and whose. */
export type SupportChatSummary = {
  userId: string;
  lastAtMs: number;
  text: string;
  fromSupport: boolean;
  unsent: boolean;
  /** The user's lines since Pochical's people last wrote (未返信). */
  unanswered: number;
  /**
   * Since when, and why (Slack's word for it), the chat's lines have not
   * reached Slack; null while they do.
   */
  slackFailure: { sinceMs: number; why: string } | null;
};

/** A page of a user's chat, as a device pages it (supportPage). */
export type SupportChatPage = {
  lines: SupportLine[];
  /** The lines its replies answer from before the page. */
  quoted: SupportLine[];
  /** The page reaches the chat's first line. */
  atStart: boolean;
};

/** What a member reported, with what they saw. */
export type ReportSummary = {
  atMs: number;
  reason: string;
  groupId: string;
  reporterId: string;
  targetId: string;
  context: string;
};

/** A user as the list of them shows them: from D1 alone. */
export type UserSummary = {
  userId: string;
  createdAtMs: number;
  anonymous: boolean;
  /** How they sign in besides anonymously: apple. */
  signIns: string[];
  /** Their chat with Pochical's people waits for an answer (未返信). */
  unanswered: number;
};

/** One user's page: what D1 and their own DO know of them. */
export type UserPage = UserSummary & {
  /** Their usual name; empty before they set one. */
  name: string;
  /** The groups they are in or have left, the latest joined first. */
  groups: {
    groupId: string;
    name: string;
    joinedAtMs: number;
    leftAtMs: number | null;
  }[];
  /** The sessions signed in, one a device, and their push tokens. */
  sessions: number;
  pushTokens: number;
  /** Their chat with Pochical's people, if they ever opened it. */
  supportChat: { lastAtMs: number } | null;
  /** What they reported, and what members reported of them. */
  reportsBy: ReportSummary[];
  reportsAbout: ReportSummary[];
};

/** The most a list gives at once. */
const PAGE = 200;

/** How each user signs in besides anonymously, by their ids. */
const signInsOf = async (
  env: Env,
  userIds: string[]
): Promise<Map<string, string[]>> => {
  const byUser = new Map<string, string[]>();
  if (userIds.length === 0) {
    return byUser;
  }
  const rows = await drizzle(env.DB)
    .select({ providerId: account.providerId, userId: account.userId })
    .from(account)
    .where(inArray(account.userId, userIds));
  for (const { providerId, userId } of rows) {
    byUser.set(userId, [...(byUser.get(userId) ?? []), providerId]);
  }
  return byUser;
};

/** The reports, the latest first: all, or those `where` picks. */
const reportsWhere = async (
  env: Env,
  where?: SQL
): Promise<ReportSummary[]> => {
  const rows = await drizzle(env.DB)
    .select()
    .from(reports)
    .where(where)
    .orderBy(desc(reports.createdAt))
    .limit(PAGE);
  return rows.map((row) => ({
    atMs: row.createdAt.getTime(),
    context: row.context,
    groupId: row.groupId,
    reason: row.reason,
    reporterId: row.reporterId,
    targetId: row.targetId,
  }));
};

export class AdminEntrypoint extends WorkerEntrypoint<Env> {
  /** Every user's chat, the latest first, from D1's index of them. */
  async supportChats(): Promise<SupportChatSummary[]> {
    const rows = await drizzle(this.env.DB)
      .select()
      .from(supportChats)
      .orderBy(desc(supportChats.lastAt))
      .limit(PAGE);
    return rows.map((row) => ({
      fromSupport: row.lastFromPochical,
      lastAtMs: row.lastAt.getTime(),
      slackFailure:
        row.slackFailingSince === null
          ? null
          : {
              sinceMs: row.slackFailingSince.getTime(),
              why: row.slackFailure ?? "",
            },
      text: row.lastText,
      unanswered: row.unanswered,
      unsent: row.lastUnsent,
      userId: row.userId,
    }));
  }

  /**
   * A page of one user's chat from its Group DO: the latest, or the one
   * before `beforeSeq`, oldest first.
   */
  async supportChat(userId: string, beforeSeq = 0): Promise<SupportChatPage> {
    const page = await this.env.GROUPS.getByName(
      supportPlace(userId)
    ).supportPage(beforeSeq);
    return page ?? { atStart: true, lines: [], quoted: [] };
  }

  /**
   * An answer from Pochical's people, taken as theirs in the user's chat,
   * which tells the user and the chat's Slack thread. `opId` is the
   * answer's own, made once by the page for what it sends, so sending it
   * again (twice pressed, or after an answer lost) is one line and true
   * as the first. False, keeping nothing, for no words, more than
   * textLimits.chatMessage, or an op id that is not an id.
   */
  async answerSupport(
    userId: string,
    text: string,
    opId: string
  ): Promise<boolean> {
    // Only a chat the user opened: one never set up takes nothing.
    const place = this.env.GROUPS.getByName(supportPlace(userId));
    const seqs = await place.answerAsPochical([
      create(ChatEditSchema, {
        kind: {
          case: "send",
          value: {
            content: { kind: { case: "words", value: { text: text.trim() } } },
            threadId: GROUP_THREAD,
          },
        },
        opId,
      }),
    ]);
    return seqs.length > 0;
  }

  /** A photo in a user's chat, its bytes and their type; null when gone. */
  async supportPhoto(
    userId: string,
    photoId: string
  ): Promise<{ bytes: ArrayBuffer; type: string } | null> {
    const photo = await this.env.PHOTOS.get(
      photoKey(supportPlace(userId), photoId)
    );
    if (photo === null) {
      return null;
    }
    return {
      bytes: await photo.arrayBuffer(),
      type: photo.httpMetadata?.contentType ?? "image/jpeg",
    };
  }

  /**
   * The photos bucket audited now (棚卸し): its objects nothing names, by
   * prefix and why, with their count, bytes and a few keys. Only reads,
   * so it may be run again at any time.
   */
  async bucketAudit(): Promise<BucketAudit> {
    return await auditBucket(this.env, Date.now());
  }

  /**
   * What the audit finds nothing names deleted from the photos bucket
   * (削除), but the keys no part of the server writes, each judged again
   * by its owner first: what was deleted, skipped and failed, by verdict.
   * Judged as of `asOfMs`, the audit Pochical's people read, so nothing
   * that passed the grace since is deleted unseen. It cannot be undone;
   * run again, it deletes what a run cut short left.
   */
  async cleanBucket(asOfMs: number): Promise<BucketCleanup> {
    if (!Number.isFinite(asOfMs)) {
      throw new TypeError("No audit's time to delete as of");
    }
    return await cleanBucket(this.env, Math.min(asOfMs, Date.now()));
  }

  /** What 全消去 would erase now: it only reads. */
  async resetPreview(): Promise<ResetPreview> {
    return await previewReset(this.env);
  }

  /**
   * Every account, group, report and photo erased (全消去), before
   * release only. It cannot be undone; run again, it erases what a run
   * cut short left, and after one that finished, nothing.
   */
  async reset(): Promise<void> {
    await resetEverything(this.env);
  }

  /** What members reported, the latest first. */
  async reports(): Promise<ReportSummary[]> {
    return await reportsWhere(this.env);
  }

  /**
   * The users whose id starts with `prefix`, the latest signed up first:
   * every user for an empty one.
   */
  async users(prefix: string): Promise<UserSummary[]> {
    const db = drizzle(this.env.DB);
    const rows = await db
      .select({
        anonymous: user.isAnonymous,
        createdAt: user.createdAt,
        unanswered: supportChats.unanswered,
        userId: user.id,
      })
      .from(user)
      .leftJoin(supportChats, eq(supportChats.userId, user.id))
      // The id's start compared as it is, no character taken as a pattern.
      .where(sql`substr(${user.id}, 1, ${prefix.length}) = ${prefix}`)
      .orderBy(desc(user.createdAt))
      .limit(PAGE);
    const signIns = await signInsOf(
      this.env,
      rows.map((row) => row.userId)
    );
    return rows.map((row) => ({
      anonymous: row.anonymous ?? false,
      createdAtMs: row.createdAt.getTime(),
      signIns: signIns.get(row.userId) ?? [],
      unanswered: row.unanswered ?? 0,
      userId: row.userId,
    }));
  }

  /**
   * One user's page, or null for an id with no account. Their own DO is
   * asked only once D1 has their row, so asking makes none.
   */
  async user(userId: string): Promise<UserPage | null> {
    const db = drizzle(this.env.DB);
    const row = await db.select().from(user).where(eq(user.id, userId)).get();
    if (row === undefined) {
      return null;
    }
    const own = this.env.USERS.getByName(userId);
    const [signIns, profile, groups, signedIn, tokens, chat, by, about] =
      await Promise.all([
        signInsOf(this.env, [userId]),
        own.profileOf(),
        own.groupsListed(),
        db
          .select({ n: count() })
          .from(session)
          .where(eq(session.userId, userId))
          .get(),
        db
          .select({ n: count() })
          .from(pushTokens)
          .innerJoin(session, eq(session.id, pushTokens.sessionId))
          .where(eq(session.userId, userId))
          .get(),
        db
          .select()
          .from(supportChats)
          .where(eq(supportChats.userId, userId))
          .get(),
        reportsWhere(this.env, eq(reports.reporterId, userId)),
        reportsWhere(this.env, eq(reports.targetId, userId)),
      ]);
    return {
      anonymous: row.isAnonymous ?? false,
      createdAtMs: row.createdAt.getTime(),
      groups,
      name: profile.name,
      pushTokens: tokens?.n ?? 0,
      reportsAbout: about,
      reportsBy: by,
      sessions: signedIn?.n ?? 0,
      signIns: signIns.get(userId) ?? [],
      supportChat:
        chat === undefined ? null : { lastAtMs: chat.lastAt.getTime() },
      unanswered: chat?.unanswered ?? 0,
      userId,
    };
  }
}
