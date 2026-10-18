// What Pochical's people's admin site (apps/admin, admin.pochical.app)
// asks of the server, as Workers RPC through its service binding to this
// named entrypoint (spec/admin.md). Nothing here has a public address: the
// apps and the internet reach only the default entrypoint's fetch.
import { create } from "@bufbuild/protobuf";
import { WorkerEntrypoint } from "cloudflare:workers";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats } from "./db/schema";
import { ChatEditSchema } from "./gen/pochical/v1/sync_pb";
import { GROUP_THREAD } from "./group-chat";
import { photoKey } from "./photos";
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

/** The most a list gives at once. */
const PAGE = 200;

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
   * which tells the user and the chat's Slack thread. False, keeping
   * nothing, for no words or more than textLimits.chatMessage.
   */
  async answerSupport(userId: string, text: string): Promise<boolean> {
    // Only a chat the user opened: one never set up takes nothing.
    const place = this.env.GROUPS.getByName(supportPlace(userId));
    const seqs = await place.answerAsPochical([
      create(ChatEditSchema, {
        kind: {
          case: "send",
          value: { text: text.trim(), threadId: GROUP_THREAD },
        },
        opId: crypto.randomUUID(),
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

  /** What members reported, the latest first. */
  async reports(): Promise<ReportSummary[]> {
    const { results } = await this.env.DB.prepare(
      "select created_at, reason, group_id, reporter_id, target_id, context from reports order by created_at desc limit ?"
    )
      .bind(PAGE)
      .all<{
        created_at: number;
        reason: string;
        group_id: string;
        reporter_id: string;
        target_id: string;
        context: string;
      }>();
    return results.map((row) => ({
      atMs: row.created_at,
      context: row.context,
      groupId: row.group_id,
      reason: row.reason,
      reporterId: row.reporter_id,
      targetId: row.target_id,
    }));
  }
}
