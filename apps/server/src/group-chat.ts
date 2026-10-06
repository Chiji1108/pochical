import { create } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { textLimits } from "@pochical/design/limits";
import { and, asc, desc, eq, gt, lt, lte, max, or } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { ChangeSchema, ChatLineSchema } from "./gen/pochical/v1/sync_pb";
import type { Change, ChatEdit, ChatLine } from "./gen/pochical/v1/sync_pb";
import { chatLines, readMarks } from "./group-do-schema";
import { isId } from "./ids";
import { fitsText } from "./text-limits";

// A group's chats as its Group DO keeps them (spec/sync-protocol.md,
// Chat): lines at their place in each chat (seq) and on the group's change
// log (cursor), and how far each member has read. The group orders
// everything as it takes it, so no clocks are kept.

/** The group's own chat, 全体チャット. One-to-one chats come later. */
export const GROUP_THREAD = "group";

type LineRow = typeof chatLines.$inferSelect;
type MarkRow = typeof readMarks.$inferSelect;

const lineOf = (row: LineRow): ChatLine =>
  create(ChatLineSchema, {
    authorId: row.authorId,
    edited: row.edited,
    opId: row.opId,
    sentAtMs: BigInt(row.sentAt.getTime()),
    seq: BigInt(row.seq),
    text: row.text,
    threadId: row.threadId,
    unsent: row.unsent,
  });

export const chatLineChange = (row: LineRow): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: { case: "chatLine", value: lineOf(row) },
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

const isThread = (threadId: string): boolean => threadId === GROUP_THREAD;

const fitsLine = (text: string): boolean =>
  fitsText(text, textLimits.chatMessage);

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

/** What taking an edit did: its change, and the line to send back when it was refused. */
type Taken = { change?: Change; refused?: Change };

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
  cursor: number
): Taken => {
  if (
    !(isId(opId) && kind.case !== undefined && isThread(kind.value.threadId))
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
      if (taken !== undefined || !fitsLine(kind.value.text)) {
        return {};
      }
      const row = db
        .insert(chatLines)
        .values({
          authorId: userId,
          createdCursor: cursor,
          cursor,
          opId,
          sentAt: new Date(),
          seq: chatHead(db, kind.value.threadId) + 1,
          text: kind.value.text,
          threadId: kind.value.threadId,
        })
        .returning()
        .get();
      return { change: chatLineChange(row) };
    }
    case "change":
    case "unsend": {
      const line = lineAt(db, kind.value.threadId, kind.value.seq);
      if (line === undefined) {
        return {};
      }
      const unsend = kind.case === "unsend";
      const text = unsend ? "" : kind.value.text;
      if (
        line.authorId !== userId ||
        line.unsent ||
        !(unsend || fitsLine(text))
      ) {
        return { refused: chatLineChange(line) };
      }
      const row = db
        .update(chatLines)
        .set(
          unsend
            ? { cursor, text, unsent: true }
            : { cursor, edited: true, text }
        )
        .where(
          and(
            eq(chatLines.threadId, line.threadId),
            eq(chatLines.seq, line.seq)
          )
        )
        .returning()
        .get();
      return row === undefined ? {} : { change: chatLineChange(row) };
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
  threadId: string,
  beforeSeq: bigint
): { lines: ChatLine[]; atStart: boolean } => {
  if (!isThread(threadId)) {
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
  return { atStart: (rows[0]?.seq ?? 1) <= 1, lines: rows.map(lineOf) };
};

/**
 * The chats' lines and read marks changed after `cursor`, for a device
 * catching up: every read mark, every change to a line it may hold (one
 * written by then), and of the lines written since only each chat's
 * latest page, the rest coming as pages as it scrolls back.
 */
export const chatChangesAfter = (
  db: DrizzleSqliteDODatabase,
  cursor: number
): Change[] => {
  // Each chat's own latest page, by its own last seq.
  const threads = db
    .selectDistinct({ threadId: chatLines.threadId })
    .from(chatLines)
    .all();
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
            gt(chatLines.seq, chatHead(db, threadId) - chatRules.pageSize)
          )
        )
      )
      .orderBy(asc(chatLines.cursor))
      .all()
      .map(chatLineChange)
  );
  const marks = db
    .select()
    .from(readMarks)
    .where(gt(readMarks.cursor, cursor))
    .all()
    .map(readMarkChange);
  return [...lines, ...marks];
};
