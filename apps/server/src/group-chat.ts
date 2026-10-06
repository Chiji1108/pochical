import { create } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { SHARED_DAYS_MAX, textLimits } from "@pochical/design/limits";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  lt,
  lte,
  max,
  ne,
  or,
} from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { pinStep } from "./chat-pins";
import { isDate } from "./day-values";
import { ChangeSchema, ChatLineSchema } from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatEdit,
  ChatLine,
  ChatPin,
  ChatReact,
  ChatSend,
} from "./gen/pochical/v1/sync_pb";
import { chatLines, chatReactions, readMarks } from "./group-do-schema";
import { isId } from "./ids";
import { fitsText, isEmoji } from "./text-limits";

// A group's chats as its Group DO keeps them (spec/sync-protocol.md,
// Chat): lines at their place in each chat (seq) and on the group's change
// log (cursor), and how far each member has read. The group orders
// everything as it takes it, so no clocks are kept.

/** The group's own chat, 全体チャット. */
export const GROUP_THREAD = "group";

const DIRECT = "direct:";

/**
 * Two members' one-to-one chat: their ids in order after "direct:", so
 * either of them names it alike.
 */
export const directThread = (a: string, b: string): string =>
  `${DIRECT}${[a, b].toSorted().join(":")}`;

/** The two members of a one-to-one chat; none for any other id. */
const pairOf = (threadId: string): [string, string] | undefined => {
  if (!threadId.startsWith(DIRECT)) {
    return undefined;
  }
  const [first, second, ...rest] = threadId.slice(DIRECT.length).split(":");
  if (
    first === undefined ||
    second === undefined ||
    rest.length > 0 ||
    !(isId(first) && isId(second)) ||
    first === second ||
    directThread(first, second) !== threadId
  ) {
    return undefined;
  }
  return [first, second];
};

/** The other member of a one-to-one chat of the member's; none otherwise. */
export const otherIn = (
  threadId: string,
  userId: string
): string | undefined => {
  const pair = pairOf(threadId);
  if (pair === undefined || !pair.includes(userId)) {
    return undefined;
  }
  return pair[0] === userId ? pair[1] : pair[0];
};

/** Whether the member may read the chat: the group's, or one of their own. */
export const mayRead = (threadId: string, userId: string): boolean =>
  threadId === GROUP_THREAD || otherIn(threadId, userId) !== undefined;

/**
 * Whether the member may see the change: anything but the lines and read
 * marks of others' one-to-one chats.
 */
export const seenBy = (change: Change, userId: string): boolean => {
  const { kind } = change;
  if (kind.case === "chatLine" || kind.case === "readMark") {
    return mayRead(kind.value.threadId, userId);
  }
  return true;
};

type LineRow = typeof chatLines.$inferSelect;
type MarkRow = typeof readMarks.$inferSelect;

/**
 * A line's reactions: each emoji, in the order first chosen, with who
 * chose it in the order they did.
 */
const reactionsOf = (
  db: DrizzleSqliteDODatabase,
  row: LineRow
): { emoji: string; userIds: string[] }[] => {
  const chosen = db
    .select()
    .from(chatReactions)
    .where(
      and(
        eq(chatReactions.threadId, row.threadId),
        eq(chatReactions.seq, row.seq)
      )
    )
    .orderBy(asc(chatReactions.madeCursor))
    .all();
  const byEmoji = new Map<string, string[]>();
  for (const { emoji, userId } of chosen) {
    byEmoji.set(emoji, [...(byEmoji.get(emoji) ?? []), userId]);
  }
  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
};

const lineOf = (db: DrizzleSqliteDODatabase, row: LineRow): ChatLine =>
  create(ChatLineSchema, {
    authorId: row.authorId,
    days: row.days ?? [],
    edited: row.edited,
    opId: row.opId,
    pinnedOrder: BigInt(row.pinnedAt ?? 0),
    reactions: reactionsOf(db, row),
    sentAtMs: BigInt(row.sentAt.getTime()),
    seq: BigInt(row.seq),
    text: row.text,
    threadId: row.threadId,
    unsent: row.unsent,
  });

export const chatLineChange = (
  db: DrizzleSqliteDODatabase,
  row: LineRow
): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: { case: "chatLine", value: lineOf(db, row) },
  });

export const readMarkChange = (row: MarkRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "readMark",
      value: {
        lastReadSeq: BigInt(row.lastReadSeq),
        threadId: row.threadId,
        userId: row.userId,
      },
    },
  });

const fitsLine = (text: string): boolean =>
  fitsText(text, textLimits.chatMessage);

/** Days a line may share: 1 to SHARED_DAYS_MAX dates, each once, in order. */
const fitsDays = (days: readonly string[]): boolean =>
  days.length > 0 &&
  days.length <= SHARED_DAYS_MAX &&
  days.every(
    (day, at) => isDate(day) && (at === 0 || (days[at - 1] ?? "") < day)
  );

/** A new line's words, or its days with no words. */
const fitsSend = ({ text, days }: ChatSend): boolean =>
  days.length === 0 ? fitsLine(text) : text === "" && fitsDays(days);

/** The chat's last seq, 0 before any line. */
export const chatHead = (
  db: DrizzleSqliteDODatabase,
  threadId: string
): number =>
  db
    .select({ head: max(chatLines.seq) })
    .from(chatLines)
    .where(eq(chatLines.threadId, threadId))
    .get()?.head ?? 0;

const lineAt = (
  db: DrizzleSqliteDODatabase,
  threadId: string,
  seq: bigint
): LineRow | undefined =>
  db
    .select()
    .from(chatLines)
    .where(
      and(eq(chatLines.threadId, threadId), eq(chatLines.seq, Number(seq)))
    )
    .get();

/**
 * Moves the member's mark in the chat forward to `seq` at `cursor`; none
 * when it is there already.
 */
export const moveReadMark = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string,
  seq: number,
  cursor: number
): Change | undefined => {
  const stored = db
    .select({ lastReadSeq: readMarks.lastReadSeq })
    .from(readMarks)
    .where(and(eq(readMarks.userId, userId), eq(readMarks.threadId, threadId)))
    .get();
  // No mark reads as none read, so one at 0 is never written.
  if ((stored?.lastReadSeq ?? 0) >= seq) {
    return undefined;
  }
  const row = { cursor, lastReadSeq: seq, threadId, userId };
  db.insert(readMarks)
    .values(row)
    .onConflictDoUpdate({
      set: { cursor, lastReadSeq: seq },
      target: [readMarks.userId, readMarks.threadId],
    })
    .run();
  return readMarkChange(row);
};

/**
 * How many of the chat's lines the member has not read: others' lines
 * past their mark (spec/sync-protocol.md, Read states).
 */
export const unreadCount = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string
): number => {
  const read =
    db
      .select({ lastReadSeq: readMarks.lastReadSeq })
      .from(readMarks)
      .where(
        and(eq(readMarks.userId, userId), eq(readMarks.threadId, threadId))
      )
      .get()?.lastReadSeq ?? 0;
  return (
    db
      .select({ n: count() })
      .from(chatLines)
      .where(
        and(
          eq(chatLines.threadId, threadId),
          gt(chatLines.seq, read),
          ne(chatLines.authorId, userId)
        )
      )
      .get()?.n ?? 0
  );
};

/**
 * Whether the member may make the edit in its chat: one they may read,
 * and in a one-to-one chat new lines only while the other is in the group.
 */
const mayWrite = (
  userId: string,
  kind: ChatEdit["kind"],
  isMember: (userId: string) => boolean
): boolean => {
  if (kind.case === undefined || !mayRead(kind.value.threadId, userId)) {
    return false;
  }
  const other = otherIn(kind.value.threadId, userId);
  return kind.case !== "send" || other === undefined || isMember(other);
};

/**
 * The member's reaction on a line put on or taken off, the line moving to
 * `cursor` with it; nothing for a line taken back, gone, or an emoji that
 * is not one, nor when it changes nothing.
 */
const takeReaction = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { threadId, seq, emoji, on }: ChatReact,
  cursor: number
): Taken => {
  const line = lineAt(db, threadId, seq);
  if (line === undefined || line.unsent || !isEmoji(emoji)) {
    return {};
  }
  const mine = and(
    eq(chatReactions.threadId, threadId),
    eq(chatReactions.seq, line.seq),
    eq(chatReactions.userId, userId),
    eq(chatReactions.emoji, emoji)
  );
  const had = db.select().from(chatReactions).where(mine).get() !== undefined;
  if (had === on) {
    return {};
  }
  if (on) {
    db.insert(chatReactions)
      .values({ emoji, madeCursor: cursor, seq: line.seq, threadId, userId })
      .run();
  } else {
    db.delete(chatReactions).where(mine).run();
  }
  const row = db
    .update(chatLines)
    .set({ cursor })
    .where(and(eq(chatLines.threadId, threadId), eq(chatLines.seq, line.seq)))
    .returning()
    .get();
  return row === undefined ? {} : { change: chatLineChange(db, row) };
};

/**
 * New words for one of the member's own lines, or the line taken back
 * with its days, reactions and pin; the line comes back to the member as
 * the group holds it when it is not theirs, taken back already, a line of
 * days (which has no words to change), or the words do not fit.
 */
const takeWords = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  kind: Extract<ChatEdit["kind"], { case: "change" | "unsend" }>,
  cursor: number
): Taken => {
  const line = lineAt(db, kind.value.threadId, kind.value.seq);
  if (line === undefined) {
    return {};
  }
  const unsend = kind.case === "unsend";
  const text = unsend ? "" : kind.value.text;
  // A line of days has no words to change.
  const words = unsend || (line.days === null && fitsLine(text));
  if (line.authorId !== userId || line.unsent || !words) {
    return { refused: chatLineChange(db, line) };
  }
  // Taking a line back takes its reactions with it.
  if (unsend) {
    db.delete(chatReactions)
      .where(
        and(
          eq(chatReactions.threadId, line.threadId),
          eq(chatReactions.seq, line.seq)
        )
      )
      .run();
  }
  const row = db
    .update(chatLines)
    .set(
      // Taking a line back takes its pin off too.
      unsend
        ? { cursor, days: null, pinnedAt: null, text, unsent: true }
        : { cursor, edited: true, text }
    )
    .where(
      and(eq(chatLines.threadId, line.threadId), eq(chatLines.seq, line.seq))
    )
    .returning()
    .get();
  return row === undefined ? {} : { change: chatLineChange(db, row) };
};

/**
 * A line pinned for everyone, or its pin taken off, at `cursor`; a pin
 * that a new one took the place of comes off at the cursor after
 * (spec/chat.md, Pins). Nothing for a line taken back or gone, nor when
 * it changes nothing.
 */
const takePin = (
  db: DrizzleSqliteDODatabase,
  { threadId, seq, on }: ChatPin,
  cursor: number
): Taken => {
  const line = lineAt(db, threadId, seq);
  // Taking off a pin that is not there changes nothing; pinning a pinned
  // line moves it up.
  if (line === undefined || line.unsent || (!on && line.pinnedAt === null)) {
    return {};
  }
  const pinned = db
    .select({ seq: chatLines.seq })
    .from(chatLines)
    .where(and(eq(chatLines.threadId, threadId), isNotNull(chatLines.pinnedAt)))
    .orderBy(desc(chatLines.pinnedAt))
    .all()
    .map((row) => String(row.seq));
  const id = String(line.seq);
  const { dropped } = pinStep(pinned, on ? { pin: id } : { unpin: id });
  const set = (at: number, lineSeq: number, pinnedAt: number | null) =>
    db
      .update(chatLines)
      .set({ cursor: at, pinnedAt })
      .where(and(eq(chatLines.threadId, threadId), eq(chatLines.seq, lineSeq)))
      .returning()
      .get();
  const row = set(cursor, line.seq, on ? cursor : null);
  const off =
    dropped === null ? undefined : set(cursor + 1, Number(dropped), null);
  return {
    alsoChanged: off === undefined ? undefined : chatLineChange(db, off),
    change: row === undefined ? undefined : chatLineChange(db, row),
  };
};

/** What taking an edit did: its change, and the line to send back when it was refused. */
type Taken = {
  change?: Change;
  // A second line it changed, at the cursor after: the pin a new pin
  // took the place of.
  alsoChanged?: Change;
  refused?: Change;
};

/**
 * A member's edit of a chat, taken at `cursor` when it is theirs to make:
 * a new line at the chat's end, new words or a taking back of one of
 * their own lines, or their read mark moved forward. A send taken before
 * (the same op_id) changes nothing. A change or unsend that is not theirs,
 * or does not fit, gives back the line as the group holds it, so the
 * device puts it right.
 */
export const takeChatEdit = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { opId, kind }: ChatEdit,
  cursor: number,
  isMember: (userId: string) => boolean
): Taken => {
  if (
    kind.case === undefined ||
    !(isId(opId) && mayWrite(userId, kind, isMember))
  ) {
    return {};
  }
  switch (kind.case) {
    case "send": {
      const taken = db
        .select({ opId: chatLines.opId })
        .from(chatLines)
        .where(eq(chatLines.opId, opId))
        .get();
      if (taken !== undefined || !fitsSend(kind.value)) {
        return {};
      }
      const row = db
        .insert(chatLines)
        .values({
          authorId: userId,
          createdCursor: cursor,
          cursor,
          days: kind.value.days.length === 0 ? null : kind.value.days,
          opId,
          sentAt: new Date(),
          seq: chatHead(db, kind.value.threadId) + 1,
          text: kind.value.text,
          threadId: kind.value.threadId,
        })
        .returning()
        .get();
      return { change: chatLineChange(db, row) };
    }
    case "change":
    case "unsend": {
      return takeWords(db, userId, kind, cursor);
    }
    case "react": {
      return takeReaction(db, userId, kind.value, cursor);
    }
    case "pin": {
      return takePin(db, kind.value, cursor);
    }
    case "read": {
      // Never past the chat's end, and only forward.
      const seq = Math.min(
        Number(kind.value.lastReadSeq),
        chatHead(db, kind.value.threadId)
      );
      return {
        change: moveReadMark(db, userId, kind.value.threadId, seq, cursor),
      };
    }
    default: {
      return {};
    }
  }
};

/**
 * Up to chatRules.pageSize lines of the chat before `beforeSeq` (the
 * latest with 0), oldest first, and whether they reach its first line.
 */
export const chatPage = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string,
  beforeSeq: bigint
): { lines: ChatLine[]; atStart: boolean } => {
  if (!mayRead(threadId, userId)) {
    return { atStart: true, lines: [] };
  }
  const rows = db
    .select()
    .from(chatLines)
    .where(
      and(
        eq(chatLines.threadId, threadId),
        beforeSeq > 0n ? lt(chatLines.seq, Number(beforeSeq)) : undefined
      )
    )
    .orderBy(desc(chatLines.seq))
    .limit(chatRules.pageSize)
    .all()
    .toReversed();
  return {
    atStart: (rows[0]?.seq ?? 1) <= 1,
    lines: rows.map((row) => lineOf(db, row)),
  };
};

/**
 * The chats' lines and read marks changed after `cursor`, for a member's
 * device catching up, of the chats they may read: every read mark, every change to a line it may hold (one
 * written by then), and of the lines written since only each chat's
 * latest page, the rest coming as pages as it scrolls back.
 */
export const chatChangesAfter = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  cursor: number
): Change[] => {
  // Each chat the member may read, its own latest page by its own last seq.
  const threads = db
    .selectDistinct({ threadId: chatLines.threadId })
    .from(chatLines)
    .all()
    .filter(({ threadId }) => mayRead(threadId, userId));
  const lines = threads.flatMap(({ threadId }) =>
    db
      .select()
      .from(chatLines)
      .where(
        and(
          eq(chatLines.threadId, threadId),
          gt(chatLines.cursor, cursor),
          or(
            lte(chatLines.createdCursor, cursor),
            gt(chatLines.seq, chatHead(db, threadId) - chatRules.pageSize),
            // Pinned lines however far back, for the pins over the chat.
            isNotNull(chatLines.pinnedAt)
          )
        )
      )
      .orderBy(asc(chatLines.cursor))
      .all()
      .map((row) => chatLineChange(db, row))
  );
  const marks = db
    .select()
    .from(readMarks)
    .where(gt(readMarks.cursor, cursor))
    .all()
    .filter(({ threadId }) => mayRead(threadId, userId))
    .map(readMarkChange);
  return [...lines, ...marks];
};
