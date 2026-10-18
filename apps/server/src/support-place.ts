// A user's chat with Pochical's people as its Group DO (support:{userId})
// keeps it (spec/chat.md, The chat with Pochical's people), told outside:
// to D1's index of every chat, which the admin pages list and Slack's
// replies are found by, and to the chat's thread in Pochical's people's
// Slack channel. The DO's alarm tells what changed after its relayed
// cursor, as the User DO pushes its groups after pushed_cursor.
import { chatRules } from "@pochical/design/chat";
import { and, asc, count, desc, eq, gt, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { supportChats, supportSlack } from "./db/schema";
import { GROUP_THREAD, lineAt, pageRows, reactionsOf } from "./group-chat";
import {
  chatLines,
  logHead,
  supportRelay,
  supportSlackLines,
} from "./group-do-schema";
import { overLimit } from "./rate-limits";
import {
  tellStaffOfAnswer,
  tellStaffOfLine,
  tellStaffOfReaction,
  tellStaffOfUnsend,
} from "./slack";
import { wordsOf } from "./support-lines";
import type { SupportLine } from "./support-lines";

type LineRow = typeof chatLines.$inferSelect;

const lineOf = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  row: LineRow
): SupportLine => ({
  device: row.device,
  fromPochical: row.authorId === chatRules.pochicalMember,
  photo:
    row.photo === null
      ? null
      : { height: row.photo.height, id: row.photo.id, width: row.photo.width },
  preview:
    row.preview === null
      ? null
      : {
          site: row.preview.site,
          title: row.preview.title,
          url: row.preview.url,
        },
  reactions: reactionsOf(db, row).map(({ emoji, userIds }) => ({
    emoji,
    mine: userIds.some((id) => id !== chatRules.pochicalMember),
    support: userIds.includes(chatRules.pochicalMember),
  })),
  replyTo: row.replyTo,
  sentAtMs: row.sentAt.getTime(),
  seq: row.seq,
  text: row.text,
  unsent: row.unsent,
  userId,
});

/** The line at `seq` of the chat a reply answers, if there is one. */
const answeredLine = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  seq: number
): SupportLine | null => {
  const row = lineAt(db, GROUP_THREAD, BigInt(seq));
  return row === undefined ? null : lineOf(db, userId, row);
};

/**
 * A page of the chat for the admin pages: up to chatRules.pageSize lines
 * before `beforeSeq` (0 for the latest), oldest first, as a device pages
 * it, and whether they reach the first; with the lines its replies
 * answer from before the page, for their quotes.
 */
export const supportPage = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  beforeSeq: number
): { lines: SupportLine[]; quoted: SupportLine[]; atStart: boolean } => {
  const { atStart, rows } = pageRows(db, GROUP_THREAD, beforeSeq);
  const lines = rows.map((row) => lineOf(db, userId, row));
  const first = lines[0]?.seq ?? beforeSeq;
  const quoted = [
    ...new Set(
      lines.flatMap(({ replyTo }) =>
        replyTo !== null && replyTo < first ? [replyTo] : []
      )
    ),
  ].flatMap((seq) => answeredLine(db, userId, seq) ?? []);
  return { atStart, lines, quoted };
};

/** The chat's latest line and what waits for an answer, for D1's index. */
const indexRow = (db: DrizzleSqliteDODatabase, userId: string) => {
  const latest = db
    .select()
    .from(chatLines)
    .where(eq(chatLines.threadId, GROUP_THREAD))
    .orderBy(desc(chatLines.seq))
    .limit(1)
    .get();
  if (latest === undefined) {
    return undefined;
  }
  const answered =
    db
      .select({ seq: max(chatLines.seq) })
      .from(chatLines)
      .where(
        and(
          eq(chatLines.threadId, GROUP_THREAD),
          eq(chatLines.authorId, chatRules.pochicalMember)
        )
      )
      .get()?.seq ?? 0;
  const unanswered =
    db
      .select({ n: count() })
      .from(chatLines)
      .where(
        and(
          eq(chatLines.threadId, GROUP_THREAD),
          eq(chatLines.authorId, userId),
          gt(chatLines.seq, answered)
        )
      )
      .get()?.n ?? 0;
  const line = lineOf(db, userId, latest);
  return {
    lastAt: new Date(line.sentAtMs),
    lastFromPochical: line.fromPochical,
    lastText: wordsOf(line),
    lastUnsent: line.unsent,
    unanswered,
    userId,
  };
};

/** What a line's Slack message has been told, kept with the chat. */
const keepTold = (
  db: DrizzleSqliteDODatabase,
  told: typeof supportSlackLines.$inferInsert
): void => {
  db.insert(supportSlackLines)
    .values(told)
    .onConflictDoUpdate({ set: told, target: supportSlackLines.seq })
    .run();
};

/**
 * What the chat's Slack thread is told of a line changed since: a new
 * line posted (the user's, or an answer written on the admin site; one
 * written in Slack is there already), the user's taking one back, and the
 * user's reactions put on or taken off. A line Slack did not take throws,
 * left untold for the alarm to post again; it never fails what the user
 * did.
 */
const relayLine = async (
  env: Env,
  db: DrizzleSqliteDODatabase,
  line: SupportLine
): Promise<void> => {
  const kept = db
    .select()
    .from(supportSlackLines)
    .where(eq(supportSlackLines.seq, line.seq))
    .get();
  let told = kept ?? {
    notices: {},
    seq: line.seq,
    slackTs: null,
    toldReactions: [],
    toldUnsent: false,
  };
  if (kept === undefined && !line.unsent) {
    const repliedTo =
      line.replyTo === null
        ? null
        : answeredLine(db, line.userId, line.replyTo);
    // Past the user's limit their lines stay in the chat and on the admin
    // pages, but are not posted, so no one floods the channel.
    const flooding =
      !line.fromPochical && (await overLimit(env.SUPPORT_LIMIT, line.userId));
    let ts: string | null = null;
    if (line.fromPochical) {
      ts = await tellStaffOfAnswer(env, line);
    } else if (!flooding) {
      ts = await tellStaffOfLine(env, line, repliedTo);
    }
    told = { ...told, slackTs: ts };
    // Kept at once, before anything that may fail, so a retry never
    // posts the line again: a kept line is settled, its message or none
    // when it is not to be posted (past the limit, say).
    keepTold(db, told);
  }
  // Which line its Slack message is, for what Pochical's people do to it
  // there: kept again each time the line is told, so a write that failed
  // is put right as the relay tries again.
  if (told.slackTs !== null) {
    await drizzle(env.DB)
      .insert(supportSlack)
      .values({ seq: line.seq, ts: told.slackTs, userId: line.userId })
      .onConflictDoNothing();
  }
  if (line.unsent && !told.toldUnsent) {
    if (kept !== undefined && !line.fromPochical && told.slackTs !== null) {
      await tellStaffOfUnsend(env, line, told.slackTs);
    }
    told = { ...told, toldUnsent: true };
  }
  const mine = line.reactions.filter((each) => each.mine).map((r) => r.emoji);
  const notices = new Map(Object.entries(told.notices));
  if (told.slackTs !== null) {
    for (const emoji of mine.filter((e) => !told.toldReactions.includes(e))) {
      // oxlint-disable-next-line no-await-in-loop -- in the order put on
      const notice = await tellStaffOfReaction(
        env,
        line,
        told.slackTs,
        emoji,
        true
      );
      if (notice !== undefined) {
        notices.set(emoji, notice);
      }
    }
    for (const emoji of told.toldReactions.filter((e) => !mine.includes(e))) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await tellStaffOfReaction(
        env,
        line,
        told.slackTs,
        emoji,
        false,
        notices.get(emoji)
      );
      notices.delete(emoji);
    }
  }
  keepTold(db, {
    ...told,
    notices: Object.fromEntries(notices),
    toldReactions: mine,
  });
};

/**
 * Tells D1's index and the chat's Slack thread what changed in the chat
 * after the relayed cursor, then moves it to the log's head. A failure
 * with D1 leaves the cursor, for the alarm to try again.
 */
export const relaySupport = async (
  env: Env,
  db: DrizzleSqliteDODatabase,
  userId: string
): Promise<void> => {
  const head = db.select().from(logHead).get()?.cursor ?? 0;
  const relayed = db.select().from(supportRelay).get()?.cursor ?? 0;
  if (head <= relayed) {
    return;
  }
  const index = indexRow(db, userId);
  if (index !== undefined) {
    // The row first, so a new chat's thread is kept with it.
    await drizzle(env.DB)
      .insert(supportChats)
      .values(index)
      .onConflictDoUpdate({ set: index, target: supportChats.userId });
  }
  const changed = db
    .select()
    .from(chatLines)
    .where(
      and(eq(chatLines.threadId, GROUP_THREAD), gt(chatLines.cursor, relayed))
    )
    .orderBy(asc(chatLines.seq))
    .all();
  for (const row of changed) {
    // oxlint-disable-next-line no-await-in-loop -- in the chat's order
    await relayLine(env, db, lineOf(db, userId, row));
  }
  db.insert(supportRelay)
    .values({ cursor: head, id: 1 })
    .onConflictDoUpdate({ set: { cursor: head }, target: supportRelay.id })
    .run();
};

/** The lines a Slack message is, or was, in a user's chat. */
export const linesOfSlackTs = async (
  env: Env,
  ts: string
): Promise<{ userId: string; seq: number }[]> =>
  await drizzle(env.DB)
    .select({ seq: supportSlack.seq, userId: supportSlack.userId })
    .from(supportSlack)
    .where(eq(supportSlack.ts, ts));
