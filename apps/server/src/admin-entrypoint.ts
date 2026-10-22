// What Pochical's people's admin site (apps/admin, admin.pochical.app)
// asks of the server, as Workers RPC through its service binding to this
// named entrypoint (spec/admin.md). Nothing here has a public address: the
// apps and the internet reach only the default entrypoint's fetch.
import { create } from "@bufbuild/protobuf";
import { withinLimit } from "@pochical/design/text";
import { WorkerEntrypoint } from "cloudflare:workers";
import { count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { auditBucket, cleanBucket } from "./bucket-audit";
import type { BucketAudit, BucketCleanup } from "./bucket-audit";
import { account, session, user } from "./db/auth-schema";
import { adminActions, pushTokens, reports, supportChats } from "./db/schema";
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

/** Where a report stands with Pochical's people (spec/admin.md, 通報). */
export const REPORT_STATES = ["open", "acted", "dismissed"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

/** Each state as 記録 says it. */
const STATE_WORDS: Record<ReportState, string> = {
  acted: "対応済み",
  dismissed: "問題なし",
  open: "未対応",
};

const isReportState = (state: string): state is ReportState =>
  REPORT_STATES.some((one) => one === state);

/** The most a report's note holds, in characters as a reader counts them. */
export const REPORT_NOTE_MAX = 1000;

/** What a member reported, with what they saw, and where it stands. */
export type ReportSummary = {
  id: string;
  atMs: number;
  reason: string;
  groupId: string;
  reporterId: string;
  targetId: string;
  context: string;
  state: ReportState;
  note: string;
  /** When Pochical's people last set its state, and who; null while open. */
  handled: { atMs: number; by: string } | null;
};

/** One thing Pochical's people did on the admin site (記録). */
export type AdminAction = {
  atMs: number;
  by: string;
  action: string;
  target: string;
  detail: string;
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
    // Those waiting first, then the latest.
    .orderBy(sql`${reports.status} = 'open' desc`, desc(reports.createdAt))
    .limit(PAGE);
  return rows.map((row) => ({
    atMs: row.createdAt.getTime(),
    context: row.context,
    groupId: row.groupId,
    handled:
      row.handledAt === null
        ? null
        : { atMs: row.handledAt.getTime(), by: row.handledBy ?? "" },
    id: row.id,
    note: row.note,
    reason: row.reason,
    reporterId: row.reporterId,
    // A state not of these would be a bug's; it is shown as waiting.
    state: isReportState(row.status) ? row.status : "open",
    targetId: row.targetId,
  }));
};

/**
 * What Pochical's people did, noted for 記録. `id` keeps one note of an
 * action sent again (an answer pressed twice is one answer).
 */
const noteAction = async (
  env: Env,
  action: Omit<AdminAction, "atMs">,
  id: string = crypto.randomUUID()
): Promise<void> => {
  await drizzle(env.DB)
    .insert(adminActions)
    .values({ ...action, at: new Date(), id })
    .onConflictDoNothing()
    .run();
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
    opId: string,
    by: string
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
    if (seqs.length === 0) {
      return false;
    }
    await noteAction(
      this.env,
      {
        action: "answer",
        by,
        detail: text.trim().slice(0, 80),
        target: userId,
      },
      `answer:${opId}`
    );
    return true;
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
  async cleanBucket(asOfMs: number, by: string): Promise<BucketCleanup> {
    if (!Number.isFinite(asOfMs)) {
      throw new TypeError("No audit's time to delete as of");
    }
    try {
      const cleanup = await cleanBucket(this.env, Math.min(asOfMs, Date.now()));
      const deleted = cleanup.rows.reduce(
        (sum, row) => sum + row.deleted.count,
        0
      );
      const failed = cleanup.rows.reduce(
        (sum, row) => sum + row.failed.count,
        0
      );
      await noteAction(this.env, {
        action: "cleanBucket",
        by,
        detail: `${deleted} 件を消した、${failed} 件失敗`,
        target: "",
      });
      return cleanup;
    } catch (error) {
      await noteAction(this.env, {
        action: "cleanBucket",
        by,
        detail: "途中で止まった",
        target: "",
      });
      throw error;
    }
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
  async reset(by: string): Promise<void> {
    try {
      await resetEverything(this.env);
    } finally {
      // Noted whether it finished or stopped part way; 全消去 leaves the
      // notes of what was done, this one among them.
      await noteAction(this.env, {
        action: "reset",
        by,
        detail: "",
        target: "",
      });
    }
  }

  /** What members reported, the latest first. */
  async reports(): Promise<ReportSummary[]> {
    return await reportsWhere(this.env);
  }

  /**
   * A report's state and note set by Pochical's people, and who did it.
   * False, setting nothing, for no such report, a state not of
   * REPORT_STATES, or a note longer than REPORT_NOTE_MAX.
   */
  async handleReport(
    reportId: string,
    state: string,
    note: string,
    by: string
  ): Promise<boolean> {
    const kept = note.trim();
    if (!isReportState(state) || !withinLimit(kept, REPORT_NOTE_MAX)) {
      return false;
    }
    const handled = state === "open" ? null : new Date();
    const updated = await drizzle(this.env.DB)
      .update(reports)
      .set({
        handledAt: handled,
        handledBy: handled === null ? null : by,
        note: kept,
        status: state,
      })
      .where(eq(reports.id, reportId))
      .returning({ id: reports.id });
    if (updated.length === 0) {
      return false;
    }
    await noteAction(this.env, {
      action: "report",
      by,
      detail:
        kept === "" ? STATE_WORDS[state] : `${STATE_WORDS[state]}：${kept}`,
      target: reportId,
    });
    return true;
  }

  /** What waits for Pochical's people: reports open, chats unanswered. */
  async waiting(): Promise<{ reports: number; chats: number }> {
    const db = drizzle(this.env.DB);
    const [open, unanswered] = await Promise.all([
      db
        .select({ n: count() })
        .from(reports)
        .where(eq(reports.status, "open"))
        .get(),
      db
        .select({ n: count() })
        .from(supportChats)
        .where(gt(supportChats.unanswered, 0))
        .get(),
    ]);
    return { chats: unanswered?.n ?? 0, reports: open?.n ?? 0 };
  }

  /** What Pochical's people did on the admin site, the latest first. */
  async actions(): Promise<AdminAction[]> {
    const rows = await drizzle(this.env.DB)
      .select()
      .from(adminActions)
      .orderBy(desc(adminActions.at))
      .limit(PAGE);
    return rows.map((row) => ({
      action: row.action,
      atMs: row.at.getTime(),
      by: row.by,
      detail: row.detail,
      target: row.target,
    }));
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
