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
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  or,
} from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import type { Alert } from "./apns";
import { pinStep } from "./chat-pins";
import type { PinStep } from "./chat-pins";
import { isDate } from "./day-values";
import type { LinkPreview } from "./gen/pochical/v1/chat_pb";
import { ChangeSchema, ChatLineSchema } from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatEdit,
  ChatLine,
  ChatDecide,
  ChatPin,
  ChatReact,
  ChatSend,
  ChatVote,
} from "./gen/pochical/v1/sync_pb";
import {
  chatLines,
  memberBlocks,
  chatPhotos,
  chatReactions,
  chatVotes,
  readMarks,
} from "./group-do-schema";
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

/** A poll's votes: each day someone can come, with who can, in order. */
const votesOf = (
  db: DrizzleSqliteDODatabase,
  row: LineRow
): { day: string; userIds: string[] }[] => {
  if (!row.poll) {
    return [];
  }
  const said = db
    .select()
    .from(chatVotes)
    .where(
      and(eq(chatVotes.threadId, row.threadId), eq(chatVotes.seq, row.seq))
    )
    .orderBy(asc(chatVotes.madeCursor))
    .all();
  return (row.days ?? []).flatMap((day) => {
    const userIds = said
      .filter((vote) => vote.day === day)
      .map((vote) => vote.userId);
    return userIds.length === 0 ? [] : [{ day, userIds }];
  });
};

const lineOf = (db: DrizzleSqliteDODatabase, row: LineRow): ChatLine =>
  create(ChatLineSchema, {
    authorId: row.authorId,
    days: row.days ?? [],
    decided: row.decided ?? "",
    edited: row.edited,
    opId: row.opId,
    photo: row.photo ?? undefined,
    pinnedOrder: BigInt(row.pinnedAt ?? 0),
    poll: row.poll,
    preview: row.preview ?? undefined,
    reactions: reactionsOf(db, row),
    sentAtMs: BigInt(row.sentAt.getTime()),
    seq: BigInt(row.seq),
    text: row.text,
    threadId: row.threadId,
    unsent: row.unsent,
    votes: votesOf(db, row),
  });

export const chatLineChange = (
  db: DrizzleSqliteDODatabase,
  row: LineRow
): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: { case: "chatLine", value: lineOf(db, row) },
  });

/**
 * A line's change as `userId` gets it: a one-to-one chat's line from
 * someone they had blocked when it was sent comes without its content,
 * marked hidden, so their device keeps its place and shows nothing.
 */
export const forReader = (
  db: DrizzleSqliteDODatabase,
  change: Change,
  userId: string
): Change => {
  if (change.kind.case !== "chatLine") {
    return change;
  }
  const line = change.kind.value;
  const hidden = db
    .select({ hiddenFrom: chatLines.hiddenFrom })
    .from(chatLines)
    .where(
      and(
        eq(chatLines.threadId, line.threadId),
        eq(chatLines.seq, Number(line.seq))
      )
    )
    .get()?.hiddenFrom;
  if (hidden !== userId) {
    return change;
  }
  return create(ChangeSchema, {
    cursor: change.cursor,
    kind: {
      case: "chatLine",
      value: create(ChatLineSchema, {
        authorId: line.authorId,
        hidden: true,
        opId: line.opId,
        sentAtMs: line.sentAtMs,
        seq: line.seq,
        threadId: line.threadId,
      }),
    },
  });
};

/** Whether `userId` has blocked `blockedId`, as their User DO told the group. */
const hasBlocked = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  blockedId: string
): boolean =>
  db
    .select()
    .from(memberBlocks)
    .where(
      and(
        eq(memberBlocks.userId, userId),
        eq(memberBlocks.blockedId, blockedId)
      )
    )
    .get() !== undefined;

/** The other of a one-to-one chat, when they have blocked `userId`. */
const blockedBy = (
  db: DrizzleSqliteDODatabase,
  threadId: string,
  userId: string
): string | null => {
  const other = otherIn(threadId, userId);
  return other !== undefined && hasBlocked(db, other, userId) ? other : null;
};

/**
 * A member's blocks as their User DO says them, all of them, so a group
 * that missed one is put right by the next.
 */
export const setMemberBlocks = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  blockedIds: string[]
): void => {
  db.delete(memberBlocks).where(eq(memberBlocks.userId, userId)).run();
  if (blockedIds.length > 0) {
    db.insert(memberBlocks)
      .values(blockedIds.map((blockedId) => ({ blockedId, userId })))
      .run();
  }
};

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

/** The fewest days a poll puts to the vote. */
const POLL_MIN_DAYS = 2;

/** The most characters of a preview's title or site name. */
const PREVIEW_TEXT_MAX = 300;

/** A link's page as a line keeps it, if it is one the server could make. */
const keptPreview = (preview: LinkPreview | undefined): LineRow["preview"] => {
  const link = preview === undefined ? null : URL.parse(preview.url);
  const fits =
    preview !== undefined &&
    (link?.protocol === "https:" || link?.protocol === "http:") &&
    preview.title.length <= PREVIEW_TEXT_MAX &&
    preview.site.length <= PREVIEW_TEXT_MAX &&
    (preview.imageId === "" || isId(preview.imageId));
  if (!fits) {
    return null;
  }
  return {
    imageHeight: preview.imageHeight,
    imageId: preview.imageId,
    imageWidth: preview.imageWidth,
    site: preview.site,
    title: preview.title,
    url: preview.url,
  };
};

/** A photo's size, as the sender read it while shrinking it to send. */
const fitsPhotoSize = (side: number): boolean =>
  side >= 1 && side <= chatRules.photoMaxEdge;

/**
 * A photo line: the sender's own photo, uploaded and not sent before,
 * with no words or days.
 */
const fitsPhoto = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { text, days, poll, photo }: ChatSend
): boolean => {
  if (photo === undefined || text !== "" || days.length > 0 || poll) {
    return false;
  }
  const uploaded = db
    .select()
    .from(chatPhotos)
    .where(eq(chatPhotos.id, photo.id))
    .get();
  return (
    uploaded?.userId === userId &&
    !uploaded.sent &&
    fitsPhotoSize(photo.width) &&
    fitsPhotoSize(photo.height)
  );
};

/**
 * A new line's words, or its days with no words; a poll's days are two
 * at least, in the group chat (a one-to-one chat has no polls).
 */
const fitsSend = ({ text, days, poll, threadId }: ChatSend): boolean => {
  if (days.length === 0) {
    return !poll && fitsLine(text);
  }
  const pollFits =
    !poll || (threadId === GROUP_THREAD && days.length >= POLL_MIN_DAYS);
  return text === "" && fitsDays(days) && pollFits;
};

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
          ne(chatLines.authorId, userId),
          // Lines kept from them, from someone they blocked, never count.
          or(isNull(chatLines.hiddenFrom), ne(chatLines.hiddenFrom, userId))
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
  // A line of days or a photo has no words to change.
  const words =
    unsend || (line.days === null && line.photo === null && fitsLine(text));
  if (line.authorId !== userId || line.unsent || !words) {
    return { refused: chatLineChange(db, line) };
  }
  // Taking a line back takes its reactions and votes with it.
  if (unsend) {
    db.delete(chatReactions)
      .where(
        and(
          eq(chatReactions.threadId, line.threadId),
          eq(chatReactions.seq, line.seq)
        )
      )
      .run();
    db.delete(chatVotes)
      .where(
        and(eq(chatVotes.threadId, line.threadId), eq(chatVotes.seq, line.seq))
      )
      .run();
  }
  const row = db
    .update(chatLines)
    .set(
      // Taking a line back takes its pin off too.
      unsend
        ? {
            cursor,
            days: null,
            decided: null,
            photo: null,
            pinnedAt: null,
            preview: null,
            text,
            unsent: true,
          }
        : {
            cursor,
            edited: true,
            // The page stays while the first link does (spec/vectors/chat.json,
            // edited); else the new link's, or none.
            preview:
              kind.case === "change" && kind.value.keepsPreview
                ? line.preview
                : keptPreview(
                    kind.case === "change" ? kind.value.preview : undefined
                  ),
            text,
          }
    )
    .where(
      and(eq(chatLines.threadId, line.threadId), eq(chatLines.seq, line.seq))
    )
    .returning()
    .get();
  if (row === undefined) {
    return {};
  }
  // Its photo goes from the group's photos too, once the change is kept.
  return unsend && line.photo !== null
    ? { change: chatLineChange(db, row), photoGone: line.photo.id }
    : { change: chatLineChange(db, row) };
};

/**
 * A line moved to `cursor` with `values` and its pin as `step` leaves it;
 * a pin the step took the place of comes off at the cursor after.
 */
const pinning = (
  db: DrizzleSqliteDODatabase,
  line: LineRow,
  step: PinStep,
  values: Partial<LineRow>,
  cursor: number
): Taken => {
  const { threadId } = line;
  const pinned = db
    .select({ seq: chatLines.seq })
    .from(chatLines)
    .where(and(eq(chatLines.threadId, threadId), isNotNull(chatLines.pinnedAt)))
    .orderBy(desc(chatLines.pinnedAt))
    .all()
    .map((row) => String(row.seq));
  const { dropped, pins } = pinStep(pinned, step);
  const set = (at: number, lineSeq: number, more: Partial<LineRow>) =>
    db
      .update(chatLines)
      .set({ cursor: at, ...more })
      .where(and(eq(chatLines.threadId, threadId), eq(chatLines.seq, lineSeq)))
      .returning()
      .get();
  const stays = pins.includes(String(line.seq));
  const row = set(cursor, line.seq, {
    ...values,
    pinnedAt: stays ? cursor : null,
  });
  const off =
    dropped === null
      ? undefined
      : set(cursor + 1, Number(dropped), { pinnedAt: null });
  return {
    alsoChanged: off === undefined ? undefined : chatLineChange(db, off),
    change: row === undefined ? undefined : chatLineChange(db, row),
  };
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
  const id = String(line.seq);
  return pinning(db, line, on ? { pin: id } : { unpin: id }, {}, cursor);
};

/**
 * The member can come on one of a poll's days, or takes it back, the
 * poll moving to `cursor`; nothing for a settled poll, a day not on it,
 * a line that is no poll, nor when it changes nothing.
 */
const takeVote = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { threadId, seq, day, on }: ChatVote,
  cursor: number
): Taken => {
  const line = lineAt(db, threadId, seq);
  const open =
    line?.poll === true &&
    !line.unsent &&
    line.decided === null &&
    (line.days ?? []).includes(day);
  if (!open) {
    return {};
  }
  const mine = and(
    eq(chatVotes.threadId, threadId),
    eq(chatVotes.seq, line.seq),
    eq(chatVotes.day, day),
    eq(chatVotes.userId, userId)
  );
  const had = db.select().from(chatVotes).where(mine).get() !== undefined;
  if (had === on) {
    return {};
  }
  if (on) {
    db.insert(chatVotes)
      .values({ day, madeCursor: cursor, seq: line.seq, threadId, userId })
      .run();
  } else {
    db.delete(chatVotes).where(mine).run();
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
 * A poll settled on one of its days, by its writer, or by anyone once
 * they have left; it is pinned, as the day is to stay found (spec/chat.md,
 * Polls). Nothing for a day not on it, nor the day it is settled on.
 */
const takeDecide = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { threadId, seq, day }: ChatDecide,
  cursor: number,
  isMember: (userId: string) => boolean
): Taken => {
  const line = lineAt(db, threadId, seq);
  const settles =
    line?.poll === true &&
    !line.unsent &&
    line.decided !== day &&
    (line.days ?? []).includes(day) &&
    (line.authorId === userId || !isMember(line.authorId));
  if (!settles) {
    return {};
  }
  return pinning(
    db,
    line,
    { settle: String(line.seq) },
    { decided: day },
    cursor
  );
};

/** What taking an edit did: its change, and the line to send back when it was refused. */
type Taken = {
  change?: Change;
  // A second line it changed, at the cursor after: the pin a new pin
  // took the place of.
  alsoChanged?: Change;
  // The photo of a line taken back, to delete from the group's photos.
  photoGone?: string;
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
      const { photo } = kind.value;
      const fits =
        photo === undefined
          ? fitsSend(kind.value)
          : fitsPhoto(db, userId, kind.value);
      if (taken !== undefined || !fits) {
        return {};
      }
      if (photo !== undefined) {
        db.update(chatPhotos)
          .set({ sent: true })
          .where(eq(chatPhotos.id, photo.id))
          .run();
      }
      const row = db
        .insert(chatLines)
        .values({
          authorId: userId,
          createdCursor: cursor,
          cursor,
          days: kind.value.days.length === 0 ? null : kind.value.days,
          // Not delivered to the other of a one-to-one chat who blocked
          // its writer.
          hiddenFrom: blockedBy(db, kind.value.threadId, userId),
          opId,
          photo:
            photo === undefined
              ? null
              : { height: photo.height, id: photo.id, width: photo.width },
          poll: kind.value.poll,
          // A page goes with words alone.
          preview:
            kind.value.text === "" ? null : keptPreview(kind.value.preview),
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
    case "vote": {
      return takeVote(db, userId, kind.value, cursor);
    }
    case "decide": {
      return takeDecide(db, userId, kind.value, cursor, isMember);
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
    lines: rows.flatMap((row) => {
      const change = forReader(db, chatLineChange(db, row), userId);
      return change.kind.case === "chatLine" ? [change.kind.value] : [];
    }),
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
      .map((row) => forReader(db, chatLineChange(db, row), userId))
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

/**
 * Notes a photo a member has uploaded to the group's chats, so they alone
 * may send it as a line; false when the id is someone else's already.
 */
export const notePhoto = (
  db: DrizzleSqliteDODatabase,
  photoId: string,
  userId: string
): boolean => {
  const noted = db
    .select()
    .from(chatPhotos)
    .where(eq(chatPhotos.id, photoId))
    .get();
  if (noted !== undefined) {
    return noted.userId === userId;
  }
  db.insert(chatPhotos).values({ id: photoId, userId }).run();
  return true;
};

/** How many lines either side of a reported line go with the report. */
const REPORT_AROUND = 3;

/**
 * What a report is kept with (spec/chat.md, Reporting and blocking): a
 * line's writer and the line with the few around it, as JSON, or a
 * member's name. Null when the reporter cannot read the line or reports
 * themselves.
 */
export const reportContext = (
  db: DrizzleSqliteDODatabase,
  reporterId: string,
  target: { threadId: string; seq: number } | { userId: string },
  memberOf: (userId: string) => { displayName: string } | undefined
): { targetId: string; context: string } | null => {
  if ("userId" in target) {
    const member = memberOf(target.userId);
    return member === undefined || target.userId === reporterId
      ? null
      : {
          context: JSON.stringify({ name: member.displayName }),
          targetId: target.userId,
        };
  }
  const line = lineAt(db, target.threadId, BigInt(target.seq));
  if (
    line === undefined ||
    !mayRead(target.threadId, reporterId) ||
    line.authorId === reporterId ||
    line.hiddenFrom === reporterId
  ) {
    return null;
  }
  const around = db
    .select()
    .from(chatLines)
    .where(
      and(
        eq(chatLines.threadId, target.threadId),
        gte(chatLines.seq, target.seq - REPORT_AROUND),
        lte(chatLines.seq, target.seq + REPORT_AROUND)
      )
    )
    .orderBy(asc(chatLines.seq))
    .all()
    .filter((row) => row.hiddenFrom !== reporterId)
    .map((row) => ({
      authorId: row.authorId,
      days: row.days,
      photo: row.photo?.id,
      seq: row.seq,
      text: row.text,
      unsent: row.unsent,
    }));
  return { context: JSON.stringify(around), targetId: line.authorId };
};

const MENTION = /<@(?<id>[\w-]+)>/gu;

/** A message's words with each mention as @ and the name (spec/vectors/chat-text.json, plainText). */
export const plainText = (
  text: string,
  nameOf: (id: string) => string
): string => text.replace(MENTION, (_, id: string) => `@${nameOf(id)}`);

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** The most characters of a message's words a notification carries. */
const ALERT_TEXT_MAX = 200;

/**
 * A new line as its notification words it (spec/sync-protocol.md, Push):
 * keys from the app's strings and their arguments, never words put
 * together here, so the app says them in its own language. A group
 * chat's line is titled with the group and says who wrote it; a
 * one-to-one chat's is titled with the writer.
 */
export const alertOf = (
  line: ChatLine,
  group: { id: string; name: string },
  nameOf: (id: string) => string
): Alert => {
  const writer = nameOf(line.authorId);
  const direct = line.threadId !== GROUP_THREAD;
  let kind = "TEXT";
  if (line.photo !== undefined) {
    kind = "PHOTO";
  } else if (line.poll) {
    kind = "POLL";
  } else if (line.days.length > 0) {
    kind = "DAYS";
  }
  // Cut between characters as people see them, emoji whole.
  const words = [...graphemes.segment(plainText(line.text, nameOf))]
    .slice(0, ALERT_TEXT_MAX)
    .map(({ segment }) => segment)
    .join("");
  const said = kind === "TEXT" ? [words] : [];
  return {
    body: direct
      ? { args: said, key: `CHAT_${kind}` }
      : { args: [writer, ...said], key: `CHAT_GROUP_${kind}` },
    groupId: group.id,
    threadId: line.threadId,
    title: { args: [direct ? writer : group.name], key: "CHAT_TITLE" },
  };
};

/** Whether `userId` would hear of a line by `authorId`: not if they blocked them. */
export const hearsFrom = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  authorId: string
): boolean => !hasBlocked(db, userId, authorId);
