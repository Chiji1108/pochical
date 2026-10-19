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
import {
  GROUP_THREAD,
  lineKey,
  linesAt,
  pageRows,
  reactionsOn,
} from "./group-chat";
import {
  chatLines,
  logHead,
  supportRelay,
  supportSlackLines,
} from "./group-do-schema";
import { overLimit } from "./rate-limits";
import { retryWait } from "./retry-wait";
import {
  SlackRefusedError,
  tellStaffOfAnswer,
  tellStaffOfLine,
  tellStaffOfReaction,
  tellStaffOfUnsend,
} from "./slack";
import type { SlackRefusal } from "./slack";
import { wordsOf } from "./support-lines";
import type { SupportLine } from "./support-lines";

type LineRow = typeof chatLines.$inferSelect;

/**
 * The rows as the admin pages and Slack read them, their reactions read
 * for all of them at once.
 */
const linesOfRows = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  rows: LineRow[]
): SupportLine[] => {
  const reactions = reactionsOn(db, rows);
  return rows.map((row) => ({
    device: row.device,
    fromPochical: row.authorId === chatRules.pochicalMember,
    photo:
      row.photo === null
        ? null
        : {
            height: row.photo.height,
            id: row.photo.id,
            width: row.photo.width,
          },
    preview:
      row.preview === null
        ? null
        : {
            site: row.preview.site,
            title: row.preview.title,
            url: row.preview.url,
          },
    reactions: (reactions.get(lineKey(row.threadId, row.seq)) ?? []).map(
      ({ emoji, userIds }) => ({
        emoji,
        mine: userIds.some((id) => id !== chatRules.pochicalMember),
        support: userIds.includes(chatRules.pochicalMember),
      })
    ),
    replyTo: row.replyTo,
    sentAtMs: row.sentAt.getTime(),
    seq: row.seq,
    text: row.text,
    unsent: row.unsent,
    userId,
  }));
};

/** The lines at `seqs` of the chat, those there are. */
const linesAtSeqs = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  seqs: number[]
): SupportLine[] =>
  linesOfRows(
    db,
    userId,
    linesAt(
      db,
      seqs.map((seq) => ({ seq, threadId: GROUP_THREAD }))
    )
  );

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
  const lines = linesOfRows(db, userId, rows);
  const first = lines[0]?.seq ?? beforeSeq;
  const quoted = linesAtSeqs(
    db,
    userId,
    lines.flatMap(({ replyTo }) =>
      replyTo !== null && replyTo < first ? [replyTo] : []
    )
  );
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
  const [line] = linesOfRows(db, userId, [latest]);
  if (line === undefined) {
    return undefined;
  }
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
 * Marks the line at `seq` as being posted to Slack, before its first
 * call: a try that ends with no word of Slack taking it (its answer lost,
 * the DO stopped) leaves the mark. Since when an earlier try of the line
 * may have posted it, for this one to look for it in Slack first, or null.
 */
const startPosting = (
  db: DrizzleSqliteDODatabase,
  seq: number
): Date | null => {
  const relay = db.select().from(supportRelay).get();
  const unsureSince =
    relay?.postingSeq === seq ? (relay.postingSince ?? null) : null;
  const posting = { postingSeq: seq, postingSince: unsureSince ?? new Date() };
  db.insert(supportRelay)
    .values({ cursor: 0, id: 1, ...posting })
    .onConflictDoUpdate({ set: posting, target: supportRelay.id })
    .run();
  return unsureSince;
};

/** The line being posted settled: kept, or surely not posted. */
const stopPosting = (db: DrizzleSqliteDODatabase): void => {
  db.update(supportRelay)
    .set({ postingSeq: null, postingSince: null })
    .where(eq(supportRelay.id, 1))
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
    const [repliedTo = null] =
      line.replyTo === null ? [] : linesAtSeqs(db, line.userId, [line.replyTo]);
    // Past the user's limit their lines stay in the chat and on the admin
    // pages, but are not posted, so no one floods the channel.
    const flooding =
      !line.fromPochical && (await overLimit(env.SUPPORT_LIMIT, line.userId));
    let ts: string | null = null;
    if (line.fromPochical || !flooding) {
      const unsureSince = startPosting(db, line.seq);
      ts = line.fromPochical
        ? await tellStaffOfAnswer(env, line, unsureSince)
        : await tellStaffOfLine(env, line, repliedTo, unsureSince);
    }
    told = { ...told, slackTs: ts };
    // Kept at once, before anything that may fail, so a retry never
    // posts the line again: a kept line is settled, its message or none
    // when it is not to be posted (past the limit, say).
    keepTold(db, told);
    stopPosting(db);
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
 * How long the relay waits after its first failure in a row, twice as long
 * each time after, up to the most for what failed: Slack's own trouble
 * passes by itself, so it is tried again sooner than a setup that waits
 * for Pochical's people to put it right. A new change in the chat tries
 * again at once all the same.
 */
const RELAY_RETRY_FIRST_MS = 60_000;
const RELAY_RETRY_MOST_MS: Record<SlackRefusal["kind"], number> = {
  lasting: 3_600_000,
  passing: 600_000,
};

/** Why the relay failed: Slack's refusal, or the server's own trouble. */
const refusalOf = (error: unknown): SlackRefusal =>
  error instanceof SlackRefusedError
    ? error.refusal
    : { afterMs: null, kind: "passing", why: "server_error" };

type RelayState = typeof supportRelay.$inferSelect | undefined;

/**
 * Counts a failed relay: kept in the DO, said in one log line and on D1's
 * index for the admin pages (since when, and Slack's word for why), and
 * how long to wait before trying again, never sooner than Slack asked.
 */
const relayFailed = async (
  env: Env,
  db: DrizzleSqliteDODatabase,
  userId: string,
  relay: RelayState,
  error: unknown
): Promise<number> => {
  const failures = (relay?.failures ?? 0) + 1;
  const failingSince = relay?.failingSince ?? new Date();
  db.insert(supportRelay)
    .values({ cursor: relay?.cursor ?? 0, failingSince, failures, id: 1 })
    .onConflictDoUpdate({
      set: { failingSince, failures },
      target: supportRelay.id,
    })
    .run();
  if (error instanceof SlackRefusedError && error.notPosted) {
    stopPosting(db);
  }
  const refusal = refusalOf(error);
  const asked = refusal.kind === "passing" ? (refusal.afterMs ?? 0) : 0;
  const waitMs = Math.max(
    asked,
    retryWait(failures, RELAY_RETRY_FIRST_MS, RELAY_RETRY_MOST_MS[refusal.kind])
  );
  const log = refusal.kind === "lasting" ? console.error : console.warn;
  log({
    error: String(error),
    failingSince: failingSince.toISOString(),
    failures,
    kind: refusal.kind,
    message: "Support relay failed",
    retryInMs: waitMs,
    userId,
    why: refusal.why,
  });
  try {
    await drizzle(env.DB)
      .update(supportChats)
      .set({ slackFailingSince: failingSince, slackFailure: refusal.why })
      .where(eq(supportChats.userId, userId));
  } catch (indexError) {
    console.error("Support relay's failure not kept in D1", indexError);
  }
  return waitMs;
};

/** Tells D1's index and the chat's Slack thread what changed after `relayed`. */
const tellSince = async (
  env: Env,
  db: DrizzleSqliteDODatabase,
  userId: string,
  relayed: number
): Promise<void> => {
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
  for (const line of linesOfRows(db, userId, changed)) {
    // oxlint-disable-next-line no-await-in-loop -- in the chat's order
    await relayLine(env, db, line);
  }
};

/**
 * Tells D1's index and the chat's Slack thread what changed in the chat
 * after the relayed cursor, then moves it to the log's head, a failure
 * before it cleared from D1's index. A failure leaves the cursor, and
 * gives how long to wait before trying again; null once all is told.
 */
export const relaySupport = async (
  env: Env,
  db: DrizzleSqliteDODatabase,
  userId: string
): Promise<number | null> => {
  const head = db.select().from(logHead).get()?.cursor ?? 0;
  const relay = db.select().from(supportRelay).get();
  const relayed = relay?.cursor ?? 0;
  const failing = (relay?.failures ?? 0) > 0;
  if (head <= relayed && !failing) {
    return null;
  }
  try {
    await tellSince(env, db, userId, relayed);
    if (failing) {
      await drizzle(env.DB)
        .update(supportChats)
        .set({ slackFailingSince: null, slackFailure: null })
        .where(eq(supportChats.userId, userId));
    }
  } catch (error) {
    return await relayFailed(env, db, userId, relay, error);
  }
  db.insert(supportRelay)
    .values({ cursor: head, id: 1 })
    .onConflictDoUpdate({
      set: { cursor: head, failingSince: null, failures: 0 },
      target: supportRelay.id,
    })
    .run();
  return null;
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
