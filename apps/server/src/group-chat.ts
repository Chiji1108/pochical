import { create } from "@bufbuild/protobuf";
import type { MessageInitShape } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import type { ChatPlaceRules } from "@pochical/design/chat";
import { SHARED_DAYS_MAX, textLimits } from "@pochical/design/limits";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  not,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import type { Alert } from "./apns";
import { photosOf } from "./chat-content";
import type {
  KeptPhoto,
  LineContent,
  LineKind,
  Notice,
  SentContent,
} from "./chat-content";
import { MENTION, mentionOf, mentions, previewLinkOf } from "./chat-links";
import { pinStep } from "./chat-pins";
import type { PinStep } from "./chat-pins";
import { isDate } from "./day-values";
import type { LinkPreview } from "./gen/pochical/v1/chat_pb";
import {
  ChangeSchema,
  ChatLineSchema,
  ChatNotice_Kind,
  RefusedSend_Reason,
} from "./gen/pochical/v1/sync_pb";
import type {
  Change,
  ChatChange,
  ChatContent,
  ChatContentSchema,
  ChatEdit,
  ChatPhotoEntrySchema,
  ChatLine,
  ChatDecide,
  ChatPin,
  ChatReact,
  ChatRecall,
  ChatSend,
  ChatVote,
} from "./gen/pochical/v1/sync_pb";
import {
  chatLines,
  memberBlocks,
  groupPhotos,
  chatReactions,
  chatRecalls,
  chatVotes,
  readMarks,
} from "./group-do-schema";
import { letGoUnsent, takeBack } from "./group-photos";
import { isId } from "./ids";
import { keptPreview, mayFetch, sentPreview } from "./link-preview";
import { fitsText, isEmoji } from "./text-limits";
import { fitsThumbHash, keptThumbHash, sentThumbHash } from "./thumb-hash";

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
 * The lines of one kind, its name written into the query, not bound, so
 * the partial index on photo lines (chat_lines_photos) serves it.
 */
export const kindIs = (kind: LineKind): SQL =>
  sql`${chatLines.content} ->> '$.kind' = ${sql.raw(`'${kind}'`)}`;

/** The condition for the chat's line at `seq`. */
export const atLine = (threadId: string, seq: number): SQL | undefined =>
  and(eq(chatLines.threadId, threadId), eq(chatLines.seq, seq));

/** A line by its chat and its place there. */
type LinePlace = { threadId: string; seq: number };

export const lineKey = (threadId: string, seq: bigint | number): string =>
  `${threadId}\n${seq}`;

/** The lines among `changes`. */
const linesOf = (changes: Change[]): ChatLine[] =>
  changes.flatMap(({ kind }) => (kind.case === "chatLine" ? [kind.value] : []));

/**
 * The most seqs one query names beside its chat's id: Durable Objects'
 * SQLite binds at most 100 values in a query.
 */
const SEQS_PER_QUERY = 99;

/** The lines by chat, in runs of seqs one query may name. */
const seqRuns = (
  lines: LinePlace[]
): { threadId: string; seqs: number[] }[] => {
  const byThread = new Map<string, Set<number>>();
  for (const { threadId, seq } of lines) {
    byThread.set(threadId, (byThread.get(threadId) ?? new Set()).add(seq));
  }
  return [...byThread].flatMap(([threadId, all]) => {
    const seqs = [...all];
    return Array.from(
      { length: Math.ceil(seqs.length / SEQS_PER_QUERY) },
      (_, at) => ({
        seqs: seqs.slice(at * SEQS_PER_QUERY, (at + 1) * SEQS_PER_QUERY),
        threadId,
      })
    );
  });
};

/** `rows` by their line, each line's in the order read. */
const byLine = <Row extends LinePlace>(rows: Row[]): Map<string, Row[]> => {
  const found = new Map<string, Row[]>();
  for (const row of rows) {
    const key = lineKey(row.threadId, row.seq);
    found.set(key, [...(found.get(key) ?? []), row]);
  }
  return found;
};

/** Who chose what, grouped by `pick` in the order first chosen. */
const grouped = <Row extends { userId: string }>(
  rows: Row[],
  pick: (row: Row) => string
): Map<string, string[]> => {
  const by = new Map<string, string[]>();
  for (const row of rows) {
    by.set(pick(row), [...(by.get(pick(row)) ?? []), row.userId]);
  }
  return by;
};

/**
 * Each of the lines' reactions, by line (lineKey): each emoji, in the
 * order first chosen, with who chose it in the order they did. Read a run
 * of lines at a time, not a query a line.
 */
export const reactionsOn = (
  db: DrizzleSqliteDODatabase,
  lines: LinePlace[]
): Map<string, { emoji: string; userIds: string[] }[]> => {
  const chosen = seqRuns(lines).flatMap(({ threadId, seqs }) =>
    db
      .select()
      .from(chatReactions)
      .where(
        and(
          eq(chatReactions.threadId, threadId),
          inArray(chatReactions.seq, seqs)
        )
      )
      .orderBy(asc(chatReactions.madeCursor))
      .all()
  );
  return new Map(
    [...byLine(chosen)].map(([key, rows]) => [
      key,
      [...grouped(rows, (row) => row.emoji)].map(([emoji, userIds]) => ({
        emoji,
        userIds,
      })),
    ])
  );
};

/**
 * Each of the polls' votes, by line (lineKey): who said they can come on
 * which of its days, in the order they did; read as reactionsOn reads.
 */
const votesOn = (
  db: DrizzleSqliteDODatabase,
  rows: LineRow[]
): Map<string, Map<string, string[]>> => {
  const polls = rows.filter((row) => row.content.kind === "poll");
  const said = seqRuns(polls).flatMap(({ threadId, seqs }) =>
    db
      .select()
      .from(chatVotes)
      .where(
        and(eq(chatVotes.threadId, threadId), inArray(chatVotes.seq, seqs))
      )
      .orderBy(asc(chatVotes.madeCursor))
      .all()
  );
  return new Map(
    [...byLine(said)].map(([key, votes]) => [
      key,
      grouped(votes, (vote) => vote.day),
    ])
  );
};

/** The lines' reactions and a poll's votes, read for all of them at once. */
const onLines = (db: DrizzleSqliteDODatabase, rows: LineRow[]) => {
  const reactions = reactionsOn(db, rows);
  const votes = votesOn(db, rows);
  return (row: LineRow) => {
    const key = lineKey(row.threadId, row.seq);
    const voters = votes.get(key);
    return {
      reactions: reactions.get(key) ?? [],
      votes: (row.content.kind === "poll" ? row.content.days : []).flatMap(
        (day) => {
          const userIds = voters?.get(day) ?? [];
          return userIds.length === 0 ? [] : [{ day, userIds }];
        }
      ),
    };
  };
};

/** A kept photo as the wire carries it. */
const sentPhoto = (photo: KeptPhoto) => ({
  ...photo,
  thumbHash: sentThumbHash(photo.thumbHash),
});

/** The wire's kind of each notice kept. */
const noticeKinds = {
  inviteRemade: ChatNotice_Kind.INVITE_REMADE,
  joined: ChatNotice_Kind.JOINED,
  left: ChatNotice_Kind.LEFT,
  profileChanged: ChatNotice_Kind.PROFILE_CHANGED,
  removed: ChatNotice_Kind.REMOVED,
} as const;

type OnLine = ReturnType<ReturnType<typeof onLines>>;

/** What a line is as the wire carries it, a poll with its votes. */
const contentWire = (
  content: LineContent,
  votes: OnLine["votes"]
): MessageInitShape<typeof ChatContentSchema> => {
  switch (content.kind) {
    case "words": {
      const { text, edited, preview } = content;
      return {
        kind: {
          case: "words",
          value: { edited, preview: preview ?? undefined, text },
        },
      };
    }
    case "photos": {
      return {
        kind: {
          case: "photos",
          value: { photos: content.photos.map(sentPhoto) },
        },
      };
    }
    case "days": {
      return { kind: { case: "days", value: { days: content.days } } };
    }
    case "poll": {
      const { days, decided } = content;
      return {
        kind: { case: "poll", value: { days, decided: decided ?? "", votes } },
      };
    }
    case "notice": {
      const { notice } = content;
      return {
        kind: {
          case: "notice",
          value: {
            kind: noticeKinds[notice.kind],
            markChanged: notice.markChanged ?? false,
            name: notice.name ?? "",
            subjectId: notice.subjectId ?? "",
          },
        },
      };
    }
    case "unsent": {
      return { kind: { case: "unsent", value: {} } };
    }
    default: {
      return content satisfies never;
    }
  }
};

const lineChange = (row: LineRow, { reactions, votes }: OnLine): Change =>
  create(ChangeSchema, {
    cursor: BigInt(row.cursor),
    kind: {
      case: "chatLine",
      value: create(ChatLineSchema, {
        authorId: row.authorId,
        content: contentWire(row.content, votes),
        opId: row.opId,
        pinnedOrder: BigInt(row.pinnedAt ?? 0),
        reactions,
        replyTo: BigInt(row.replyTo ?? 0),
        sentAtMs: BigInt(row.sentAt.getTime()),
        seq: BigInt(row.seq),
        threadId: row.threadId,
      }),
    },
  });

/** The lines as changes, what is on them read for all of them at once. */
export const chatLineChanges = (
  db: DrizzleSqliteDODatabase,
  rows: LineRow[]
): Change[] => {
  const on = onLines(db, rows);
  return rows.map((row) => lineChange(row, on(row)));
};

const chatLineChange = (db: DrizzleSqliteDODatabase, row: LineRow): Change =>
  lineChange(row, onLines(db, [row])(row));

/** A line's change without its content, marked hidden. */
const hiddenChange = (change: Change, line: ChatLine): Change =>
  create(ChangeSchema, {
    cursor: change.cursor,
    kind: {
      case: "chatLine",
      value: create(ChatLineSchema, {
        authorId: line.authorId,
        content: { kind: { case: "hidden", value: {} } },
        opId: line.opId,
        sentAtMs: line.sentAtMs,
        seq: line.seq,
        threadId: line.threadId,
      }),
    },
  });

/**
 * How each reader gets `changes`: a one-to-one chat's line from someone
 * they had blocked when it was sent comes without its content, marked
 * hidden, so their device keeps its place and shows nothing. Whom each
 * line is hidden from is read once for all the changes, not per reader.
 */
export const readerView = (
  db: DrizzleSqliteDODatabase,
  changes: Change[]
): ((change: Change, userId: string) => Change) => {
  const places = linesOf(changes).map(({ threadId, seq }) => ({
    seq: Number(seq),
    threadId,
  }));
  const hiddenFrom = new Map(
    seqRuns(places).flatMap(({ threadId, seqs }) =>
      db
        .select({
          hiddenFrom: chatLines.hiddenFrom,
          seq: chatLines.seq,
          threadId: chatLines.threadId,
        })
        .from(chatLines)
        .where(
          and(
            eq(chatLines.threadId, threadId),
            inArray(chatLines.seq, seqs),
            isNotNull(chatLines.hiddenFrom)
          )
        )
        .all()
        .map((row) => [lineKey(row.threadId, row.seq), row.hiddenFrom])
    )
  );
  return (change, userId) => {
    if (change.kind.case !== "chatLine") {
      return change;
    }
    const line = change.kind.value;
    return hiddenFrom.get(lineKey(line.threadId, line.seq)) === userId
      ? hiddenChange(change, line)
      : change;
  };
};

/** The changes as `userId` gets them (readerView). */
const asReadBy = (
  db: DrizzleSqliteDODatabase,
  changes: Change[],
  userId: string
): Change[] => {
  const view = readerView(db, changes);
  return changes.map((change) => view(change, userId));
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

const readMarkChange = (row: MarkRow): Change =>
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

/** A photo's size, as the sender read it while shrinking it to send. */
const fitsPhotoSize = (side: number): boolean =>
  side >= 1 && side <= chatRules.photoMaxEdge;

/**
 * Those of `photoIds` that `userId` uploaded and has not sent; none past
 * the most one send holds, as no send names more.
 */
const ownUnsentPhotos = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  photoIds: string[]
): string[] =>
  photoIds.length === 0 || photoIds.length > chatRules.photosPerSend
    ? []
    : db
        .select({ id: groupPhotos.id })
        .from(groupPhotos)
        .where(
          and(
            inArray(groupPhotos.id, photoIds),
            eq(groupPhotos.userId, userId),
            eq(groupPhotos.state, "unsent")
          )
        )
        .all()
        .map(({ id }) => id);

/**
 * What a member's send is as a line, or none when it does not fit: words
 * that fit; days that fit, a poll's two at least and in the group chat (a
 * one-to-one chat has no polls); or 1 to chatRules.photosPerSend photos,
 * each once, each the sender's own, uploaded and not sent before.
 */
const sentContent = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { content, threadId }: ChatSend
): SentContent | undefined => {
  const kind = content?.kind;
  switch (kind?.case) {
    case "words": {
      const { text, preview } = kind.value;
      return fitsLine(text)
        ? {
            edited: false,
            kind: "words",
            preview: sentPreview(preview, text),
            text,
          }
        : undefined;
    }
    case "photos": {
      const { photos } = kind.value;
      const ids = photos.map(({ id }) => id);
      const fits =
        ids.length > 0 &&
        ids.length <= chatRules.photosPerSend &&
        new Set(ids).size === ids.length &&
        photos.every(
          ({ width, height, thumbHash }) =>
            fitsPhotoSize(width) &&
            fitsPhotoSize(height) &&
            fitsThumbHash(thumbHash)
        ) &&
        ownUnsentPhotos(db, userId, ids).length === ids.length;
      return fits
        ? {
            kind: "photos",
            photos: photos.map(({ height, id, thumbHash, width }) => ({
              height,
              id,
              thumbHash: keptThumbHash(thumbHash),
              width,
            })),
          }
        : undefined;
    }
    case "days": {
      const { days } = kind.value;
      return fitsDays(days) ? { days, kind: "days" } : undefined;
    }
    case "poll": {
      const { days } = kind.value;
      return threadId === GROUP_THREAD &&
        days.length >= POLL_MIN_DAYS &&
        fitsDays(days)
        ? { days, decided: null, kind: "poll" }
        : undefined;
    }
    case undefined: {
      return undefined;
    }
    default: {
      return kind satisfies never;
    }
  }
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

/** The seq the chat's latest page comes after: its last chatRules.pageSize lines. */
export const latestPageAfter = (
  db: DrizzleSqliteDODatabase,
  threadId: string
): number => chatHead(db, threadId) - chatRules.pageSize;

/**
 * A member's line of the chat at `seq`, for an edit, a reply or a report:
 * the app's notices are none of these (they take no reactions, replies,
 * pins or reports, and their author cannot change or take them back).
 */
export const lineAt = (
  db: DrizzleSqliteDODatabase,
  threadId: string,
  seq: bigint
): LineRow | undefined =>
  db
    .select()
    .from(chatLines)
    .where(and(atLine(threadId, Number(seq)), not(kindIs("notice"))))
    .get();

/**
 * Whether a new line may answer `replyTo` (返信): a line of the same chat
 * the writer can see, not taken back.
 */
const answers = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string,
  replyTo: bigint
): boolean => {
  if (replyTo === 0n) {
    return false;
  }
  const line = lineAt(db, threadId, replyTo);
  return (
    line !== undefined &&
    line.content.kind !== "unsent" &&
    line.hiddenFrom !== userId
  );
};

/**
 * The lines at `places` there are, as lineAt reads one (no notices), in
 * each chat's order: a run of lines a query, not a query a line.
 */
export const linesAt = (
  db: DrizzleSqliteDODatabase,
  places: LinePlace[]
): LineRow[] =>
  seqRuns(places).flatMap(({ threadId, seqs }) =>
    db
      .select()
      .from(chatLines)
      .where(
        and(
          eq(chatLines.threadId, threadId),
          inArray(chatLines.seq, seqs),
          not(kindIs("notice"))
        )
      )
      .orderBy(asc(chatLines.seq))
      .all()
  );

/**
 * The lines the replies among `lines` answer that are not among them,
 * each at its own cursor: sent along with the replies, so each quote
 * reads as its line however far back it is (spec/sync-protocol.md, Chat).
 */
export const answeredChanges = (
  db: DrizzleSqliteDODatabase,
  lines: ChatLine[]
): Change[] => {
  const sent = new Set(
    lines.map(({ threadId, seq }) => lineKey(threadId, seq))
  );
  const answered = lines.flatMap(({ threadId, replyTo }) =>
    replyTo === 0n || sent.has(lineKey(threadId, replyTo))
      ? []
      : [{ seq: Number(replyTo), threadId }]
  );
  return chatLineChanges(db, linesAt(db, answered));
};

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

/** The lines not kept from `userId`, as one-to-one lines from someone they had blocked are. */
const notHiddenFrom = (userId: string): SQL | undefined =>
  or(isNull(chatLines.hiddenFrom), ne(chatLines.hiddenFrom, userId));

/** How far `userId` has read the chat: 0 for none. */
export const readMarkOf = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string
): number =>
  db
    .select({ lastReadSeq: readMarks.lastReadSeq })
    .from(readMarks)
    .where(and(eq(readMarks.userId, userId), eq(readMarks.threadId, threadId)))
    .get()?.lastReadSeq ?? 0;

/**
 * A chat's lines `userId` has not read, others' past their read mark, and
 * how many of them mention them (spec/chat.md, Unread lines): what the
 * user's badges count, all of them in a chat that is on, the mentions in
 * one turned off.
 */
export const unreadCount = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string
): { count: number; mentions: number } => {
  const unread = and(
    eq(chatLines.threadId, threadId),
    gt(chatLines.seq, readMarkOf(db, userId, threadId)),
    ne(chatLines.authorId, userId),
    // Lines from the app are told, not counted.
    not(kindIs("notice")),
    // Lines kept from them, from someone they blocked, never count.
    notHiddenFrom(userId)
  );
  const counted =
    db.select({ n: count() }).from(chatLines).where(unread).get()?.n ?? 0;
  const text = sql<string>`${chatLines.content} ->> '$.text'`;
  // The lines holding the mention's token, read as the apps read them.
  const mentioned = db
    .select({ text })
    .from(chatLines)
    .where(and(unread, sql`instr(${text}, ${mentionOf(userId)})`))
    .all()
    .filter((line) => mentions(line.text, userId)).length;
  return { count: counted, mentions: mentioned };
};

/**
 * Whether the chat's place takes the edit at all (design/src/chat.ts,
 * chatPlaces): a one-to-one chat, a line of days or a poll, 編集, a pin,
 * a vote or settling a poll only where the place has them. The apps
 * never send one it does not take, so it is dropped rather than answered.
 */
const placeTakes = (rules: ChatPlaceRules, kind: ChatEdit["kind"]): boolean => {
  if (
    kind.case !== undefined &&
    !rules.directChats &&
    kind.value.threadId !== GROUP_THREAD
  ) {
    return false;
  }
  switch (kind.case) {
    case "send": {
      const sent = kind.value.content?.kind.case;
      return (
        (rules.days || sent !== "days") && (rules.polls || sent !== "poll")
      );
    }
    case "change": {
      return rules.edit;
    }
    case "pin": {
      return rules.pins;
    }
    case "vote":
    case "decide": {
      return rules.polls;
    }
    case "react":
    case "unsend":
    case "recall":
    case "read":
    case undefined: {
      return true;
    }
    default: {
      return false;
    }
  }
};

/** The line moved to `cursor`, as what is on it (reactions, votes) changed. */
const moveLine = (
  db: DrizzleSqliteDODatabase,
  { threadId, seq }: LineRow,
  cursor: number
): Taken => {
  const row = db
    .update(chatLines)
    .set({ cursor })
    .where(atLine(threadId, seq))
    .returning()
    .get();
  return row === undefined ? {} : { change: chatLineChange(db, row) };
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
  if (line === undefined || line.content.kind === "unsent" || !isEmoji(emoji)) {
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
  return moveLine(db, line, cursor);
};

/**
 * One of the member's lines taken back (送信取消) at `cursor`, with its
 * words, days, photos, reactions, votes and pin.
 */
const unsendLine = (
  db: DrizzleSqliteDODatabase,
  line: LineRow,
  cursor: number
): Taken => {
  const { threadId, seq } = line;
  db.delete(chatReactions)
    .where(
      and(eq(chatReactions.threadId, threadId), eq(chatReactions.seq, seq))
    )
    .run();
  db.delete(chatVotes)
    .where(and(eq(chatVotes.threadId, threadId), eq(chatVotes.seq, seq)))
    .run();
  const row = db
    .update(chatLines)
    .set({
      content: { kind: "unsent" },
      cursor,
      pinnedAt: null,
      replyTo: null,
    })
    .where(atLine(threadId, seq))
    .returning()
    .get();
  if (row === undefined) {
    return {};
  }
  const photosGone = photosOf(line.content).map(({ id }) => id);
  // Its photos go from storage too, by the sweep.
  takeBack(db, photosGone);
  return { change: chatLineChange(db, row), photosGone };
};

/** New words for one of the member's own lines at `cursor` (編集). */
const changeWords = (
  db: DrizzleSqliteDODatabase,
  line: LinePlace,
  words: Extract<LineContent, { kind: "words" }>,
  { text, keepsPreview, preview }: ChatChange,
  cursor: number
): Taken => {
  const row = db
    .update(chatLines)
    .set({
      content: {
        edited: true,
        kind: "words",
        // The page stays while the first link does (spec/vectors/chat.json,
        // edited); else the new link's, or none.
        preview: keepsPreview ? words.preview : sentPreview(preview, text),
        text,
      },
      cursor,
    })
    .where(atLine(line.threadId, line.seq))
    .returning()
    .get();
  return row === undefined ? {} : { change: chatLineChange(db, row) };
};

/**
 * New words for one of the member's own lines, or the line taken back;
 * the line comes back to the member as the group holds it when it is not
 * theirs, taken back already, a line of days or a photo (which has no
 * words to change), or the words do not fit.
 */
const takeOwnLine = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  kind: Extract<ChatEdit["kind"], { case: "change" | "unsend" }>,
  cursor: number
): Taken => {
  const line = lineAt(db, kind.value.threadId, kind.value.seq);
  if (line === undefined) {
    return {};
  }
  const { content } = line;
  if (line.authorId !== userId || content.kind === "unsent") {
    return { refused: chatLineChange(db, line) };
  }
  if (kind.case === "unsend") {
    return unsendLine(db, line, cursor);
  }
  if (content.kind !== "words" || !fitsLine(kind.value.text)) {
    return { refused: chatLineChange(db, line) };
  }
  return changeWords(db, line, content, kind.value, cursor);
};

/**
 * A send kept from coming after all, as its recall is taken at `now`;
 * those kept chatRules.unsentAfterMs ago go, no send being on its way
 * that long. Its photos go at once, as no line will ever carry them.
 */
const keepRecall = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { sendOpId, photoIds }: ChatRecall,
  now: Date
): Taken => {
  db.delete(chatRecalls)
    .where(
      lt(chatRecalls.takenAt, new Date(now.getTime() - chatRules.unsentAfterMs))
    )
    .run();
  db.insert(chatRecalls)
    .values({ opId: sendOpId, takenAt: now, userId })
    .onConflictDoNothing()
    .run();
  const photosGone = ownUnsentPhotos(db, userId, photoIds);
  letGoUnsent(db, photosGone);
  return { photosGone };
};

/**
 * One of the member's lines taken back by its send's op_id, as they took
 * it back while it waited on their device: taken back as 送信取消 takes
 * one when the group has it, and else its send is kept from coming after
 * all (`keepRecall`). Nothing for someone else's line, or one taken back
 * already.
 */
const takeRecall = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  recall: ChatRecall,
  cursor: number
): Taken => {
  const { threadId, sendOpId } = recall;
  if (!isId(sendOpId)) {
    return {};
  }
  const line = db
    .select()
    .from(chatLines)
    .where(eq(chatLines.opId, sendOpId))
    .get();
  if (line === undefined) {
    return keepRecall(db, userId, recall, new Date());
  }
  if (
    line.authorId !== userId ||
    line.threadId !== threadId ||
    line.content.kind === "unsent"
  ) {
    return {};
  }
  return unsendLine(db, line, cursor);
};

/**
 * A line moved to `cursor` with `values` and its pin as `step` leaves it;
 * a pin the step took the place of comes off at a cursor of its own.
 */
const pinning = (
  db: DrizzleSqliteDODatabase,
  line: LineRow,
  step: PinStep,
  values: Partial<LineRow>,
  cursor: number,
  nextCursor: () => number
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
      .where(atLine(threadId, lineSeq))
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
      : set(nextCursor(), Number(dropped), { pinnedAt: null });
  return {
    alsoChanged: off === undefined ? undefined : chatLineChange(db, off),
    change: row === undefined ? undefined : chatLineChange(db, row),
  };
};

/**
 * A line pinned for everyone, or its pin taken off, at `cursor`; a pin
 * that a new one took the place of comes off at a cursor of its own
 * (spec/chat.md, Pins). Nothing for a line taken back or gone, nor when
 * it changes nothing.
 */
const takePin = (
  db: DrizzleSqliteDODatabase,
  { threadId, seq, on }: ChatPin,
  cursor: number,
  nextCursor: () => number
): Taken => {
  const line = lineAt(db, threadId, seq);
  // Taking off a pin that is not there changes nothing; pinning a pinned
  // line moves it up.
  if (
    line === undefined ||
    line.content.kind === "unsent" ||
    (!on && line.pinnedAt === null)
  ) {
    return {};
  }
  const id = String(line.seq);
  return pinning(
    db,
    line,
    on ? { pin: id } : { unpin: id },
    {},
    cursor,
    nextCursor
  );
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
  const poll = line?.content.kind === "poll" ? line.content : undefined;
  if (
    line === undefined ||
    poll === undefined ||
    poll.decided !== null ||
    !poll.days.includes(day)
  ) {
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
  return moveLine(db, line, cursor);
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
  nextCursor: () => number,
  isMember: (userId: string) => boolean
): Taken => {
  const line = lineAt(db, threadId, seq);
  const poll = line?.content.kind === "poll" ? line.content : undefined;
  if (
    line === undefined ||
    poll === undefined ||
    poll.decided === day ||
    !poll.days.includes(day) ||
    !(line.authorId === userId || !isMember(line.authorId))
  ) {
    return {};
  }
  return pinning(
    db,
    line,
    { settle: String(line.seq) },
    { content: { ...poll, decided: day } },
    cursor,
    nextCursor
  );
};

/** How much of the app's word on itself a line keeps. */
const DEVICE_MAX = 100;

/**
 * The app's version and device a line keeps, where its place's rules ask
 * for them: only what the app says of itself, kept short.
 */
const deviceOf = (
  { device }: ChatSend,
  rules: ChatPlaceRules
): string | null =>
  rules.sendsDevice && device !== "" ? device.slice(0, DEVICE_MAX) : null;

/** What taking an edit did: its change, and the line to send back when it was refused. */
type Taken = {
  change?: Change;
  // A second line it changed, at a cursor of its own: the pin a new pin
  // took the place of.
  alsoChanged?: Change;
  // The photos of a line taken back, to delete from the group's photos.
  photosGone?: string[];
  refused?: Change;
  // Why a send was not taken, for its ack to tell the sender.
  refusal?: RefusedSend_Reason;
};

/**
 * A new line at the chat's end, when it was neither taken before nor
 * taken back by its op_id (`takeRecall`), and fits; to a one-to-one chat,
 * only while the other is in the group.
 */
const takeSend = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  opId: string,
  send: ChatSend,
  cursor: number,
  isMember: (userId: string) => boolean,
  rules: ChatPlaceRules
): Taken => {
  const taken = db
    .select({ opId: chatLines.opId })
    .from(chatLines)
    .where(eq(chatLines.opId, opId))
    .get();
  const recalled = db
    .select({ opId: chatRecalls.opId })
    .from(chatRecalls)
    .where(and(eq(chatRecalls.userId, userId), eq(chatRecalls.opId, opId)))
    .get();
  if (taken !== undefined || recalled !== undefined) {
    return {};
  }
  const other = otherIn(send.threadId, userId);
  if (other !== undefined && !isMember(other)) {
    return { refusal: RefusedSend_Reason.NOT_IN_GROUP };
  }
  const content = sentContent(db, userId, send);
  if (content === undefined) {
    return { refusal: RefusedSend_Reason.DOES_NOT_FIT };
  }
  const photos = photosOf(content);
  if (photos.length > 0) {
    db.update(groupPhotos)
      .set({ state: "sent" })
      .where(
        inArray(
          groupPhotos.id,
          photos.map(({ id }) => id)
        )
      )
      .run();
  }
  const { replyTo } = send;
  const row = db
    .insert(chatLines)
    .values({
      authorId: userId,
      content,
      createdCursor: cursor,
      cursor,
      device: deviceOf(send, rules),
      // Not delivered to the other of a one-to-one chat who blocked
      // its writer.
      hiddenFrom: blockedBy(db, send.threadId, userId),
      opId,
      // A line it cannot answer, as one taken back meanwhile, goes without
      // its quote rather than not at all.
      replyTo: answers(db, userId, send.threadId, replyTo)
        ? Number(replyTo)
        : null,
      sentAt: new Date(),
      seq: chatHead(db, send.threadId) + 1,
      threadId: send.threadId,
    })
    .returning()
    .get();
  return { change: chatLineChange(db, row) };
};

/**
 * The link whose page the server reads for a line just sent: its words'
 * first, when the sender's app sent none and they did not take it off (×),
 * as when the line went before its preview came.
 */
export const pageToRead = ({ content }: ChatSend): string | undefined => {
  if (content?.kind.case !== "words") {
    return undefined;
  }
  const { preview, text, withoutPreview } = content.kind.value;
  if (preview !== undefined || withoutPreview) {
    return undefined;
  }
  const link = previewLinkOf(text);
  const url = link === undefined ? null : URL.parse(link);
  return url !== null && mayFetch(url) ? link : undefined;
};

/**
 * The page read for `link` added to a line at `cursor`, while the line
 * still has none and its words' first link is still the one read: not
 * taken back, nor changed to another link meanwhile.
 */
export const addPreview = (
  db: DrizzleSqliteDODatabase,
  { threadId, seq, link }: { threadId: string; seq: number; link: string },
  preview: LinkPreview,
  cursor: number
): Change | undefined => {
  const content = db
    .select({ content: chatLines.content })
    .from(chatLines)
    .where(atLine(threadId, seq))
    .get()?.content;
  const kept = keptPreview(preview);
  if (
    content?.kind !== "words" ||
    content.preview !== null ||
    kept === null ||
    previewLinkOf(content.text) !== link
  ) {
    return undefined;
  }
  const row = db
    .update(chatLines)
    .set({ content: { ...content, preview: kept }, cursor })
    .where(atLine(threadId, seq))
    .returning()
    .get();
  return row === undefined ? undefined : chatLineChange(db, row);
};

/**
 * A member's edit of a chat, taken at a cursor of its own when it is
 * theirs to make: a new line at the chat's end, new words or a taking
 * back of one of their own lines (by its seq, or by its send's op_id), or
 * their read mark moved forward. A send taken before (the same op_id), or
 * taken back before it came, changes nothing. A change or unsend that is
 * not theirs, or does not fit, gives back the line as the group holds it,
 * so the device puts it right. What the chat's place does not take
 * (`placeTakes`) is dropped, a send refused.
 */
export const takeChatEdit = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  { opId, kind }: ChatEdit,
  nextCursor: () => number,
  isMember: (userId: string) => boolean,
  rules: ChatPlaceRules
): Taken => {
  if (
    kind.case === undefined ||
    !(
      isId(opId) &&
      mayRead(kind.value.threadId, userId) &&
      placeTakes(rules, kind)
    )
  ) {
    return kind.case === "send"
      ? { refusal: RefusedSend_Reason.DOES_NOT_FIT }
      : {};
  }
  const cursor = nextCursor();
  switch (kind.case) {
    case "send": {
      return takeSend(db, userId, opId, kind.value, cursor, isMember, rules);
    }
    case "change":
    case "unsend": {
      return takeOwnLine(db, userId, kind, cursor);
    }
    case "recall": {
      return takeRecall(db, userId, kind.value, cursor);
    }
    case "react": {
      return takeReaction(db, userId, kind.value, cursor);
    }
    case "pin": {
      return takePin(db, kind.value, cursor, nextCursor);
    }
    case "vote": {
      return takeVote(db, userId, kind.value, cursor);
    }
    case "decide": {
      return takeDecide(db, userId, kind.value, cursor, nextCursor, isMember);
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
 * A deleted account's part in the group's chats taken out (spec/sync-
 * protocol.md, Deleting an account): each line they wrote taken back, as
 * 送信取消 takes one, their photos with them; their reactions and votes
 * taken off the lines they were on, which move to new cursors; and their
 * read marks, blocks and sends taken back dropped. The changes, and the
 * photos to delete.
 */
export const eraseMemberChat = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  nextCursor: () => number
): { changes: Change[]; photosGone: string[] } => {
  const changes: Change[] = [];
  const photosGone: string[] = [];
  const written = db
    .select()
    .from(chatLines)
    .where(
      and(
        eq(chatLines.authorId, userId),
        not(kindIs("unsent")),
        // The app's notices of their joining or leaving stay.
        not(kindIs("notice"))
      )
    )
    .all();
  for (const line of written) {
    const taken = unsendLine(db, line, nextCursor());
    if (taken.change !== undefined) {
      changes.push(taken.change);
    }
    photosGone.push(...(taken.photosGone ?? []));
  }
  // The lines others wrote that their reactions or votes were on.
  const touched = new Map<string, { seq: number; threadId: string }>();
  for (const table of [chatReactions, chatVotes]) {
    for (const { seq, threadId } of db
      .select({ seq: table.seq, threadId: table.threadId })
      .from(table)
      .where(eq(table.userId, userId))
      .all()) {
      touched.set(lineKey(threadId, seq), { seq, threadId });
    }
    db.delete(table).where(eq(table.userId, userId)).run();
  }
  const moved = [...touched.values()].flatMap(
    ({ seq, threadId }) =>
      db
        .update(chatLines)
        .set({ cursor: nextCursor() })
        .where(and(atLine(threadId, seq), not(kindIs("unsent"))))
        .returning()
        .get() ?? []
  );
  changes.push(...chatLineChanges(db, moved));
  db.delete(readMarks).where(eq(readMarks.userId, userId)).run();
  db.delete(chatRecalls).where(eq(chatRecalls.userId, userId)).run();
  db.delete(memberBlocks)
    .where(
      or(eq(memberBlocks.userId, userId), eq(memberBlocks.blockedId, userId))
    )
    .run();
  return { changes, photosGone };
};

/**
 * Up to chatRules.pageSize lines of the chat before `beforeSeq` (the
 * latest with 0), oldest first, and whether they reach its first line.
 */
export const pageRows = (
  db: DrizzleSqliteDODatabase,
  threadId: string,
  beforeSeq: number
): { rows: LineRow[]; atStart: boolean } => {
  const rows = db
    .select()
    .from(chatLines)
    .where(
      and(
        eq(chatLines.threadId, threadId),
        beforeSeq > 0 ? lt(chatLines.seq, beforeSeq) : undefined
      )
    )
    .orderBy(desc(chatLines.seq))
    .limit(chatRules.pageSize)
    .all()
    .toReversed();
  return { atStart: (rows[0]?.seq ?? 1) <= 1, rows };
};

/** A page of the chat as `userId` reads it (pageRows), with the lines its replies answer. */
export const chatPage = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string,
  beforeSeq: bigint
): { lines: ChatLine[]; atStart: boolean; quoted: ChatLine[] } => {
  if (!mayRead(threadId, userId)) {
    return { atStart: true, lines: [], quoted: [] };
  }
  const { atStart, rows } = pageRows(db, threadId, Number(beforeSeq));
  const asRead = (changes: Change[]): ChatLine[] =>
    linesOf(asReadBy(db, changes, userId));
  const lines = asRead(chatLineChanges(db, rows));
  return { atStart, lines, quoted: asRead(answeredChanges(db, lines)) };
};

/**
 * The chat's photos the reader sees among them (spec/vectors/chat-photos.json,
 * seen): not a line taken back or hidden from them, nor in the place's own
 * chat one of a member they blocked, whose lines fold away there.
 */
const seenPhotos = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string
): SQL | undefined =>
  and(
    eq(chatLines.threadId, threadId),
    kindIs("photos"),
    notHiddenFrom(userId),
    threadId === GROUP_THREAD
      ? notInArray(
          chatLines.authorId,
          db
            .select({ blockedId: memberBlocks.blockedId })
            .from(memberBlocks)
            .where(eq(memberBlocks.userId, userId))
        )
      : undefined
  );

/** The lines on the side of `seq` a ChatPhotosRequest asks for, all of them before 0. */
const askedSide = (seq: number, after: boolean): SQL | undefined => {
  if (after) {
    return gt(chatLines.seq, seq);
  }
  return seq === 0 ? undefined : lt(chatLines.seq, seq);
};

/** How many photos a line holds, in SQL. */
const photoCount = sql<number>`json_array_length(${chatLines.content}, '$.photos')`;

/**
 * A page of the chat's photos alone (ChatPhotosRequest): the lines the
 * reader sees nearest `seq`, before it or after it, as many as fit whole
 * in `size` photos and one at least, their photos oldest first; how many
 * photos come before them, and how many the chat holds for the reader
 * (spec/vectors/chat-photos.json, page).
 */
export const photosPage = (
  db: DrizzleSqliteDODatabase,
  userId: string,
  threadId: string,
  seq: bigint,
  after: boolean,
  size: number = chatRules.photoPageSize
): {
  photos: MessageInitShape<typeof ChatPhotoEntrySchema>[];
  offset: number;
  total: number;
} => {
  if (!mayRead(threadId, userId)) {
    return { offset: 0, photos: [], total: 0 };
  }
  const seen = seenPhotos(db, userId, threadId);
  const side = askedSide(Number(seq), after);
  const counted = db
    .select({
      onSide:
        side === undefined
          ? sql<number>`coalesce(sum(${photoCount}), 0)`
          : sql<number>`coalesce(sum((${side}) * ${photoCount}), 0)`,
      total: sql<number>`coalesce(sum(${photoCount}), 0)`,
    })
    .from(chatLines)
    .where(seen)
    .get() ?? { onSide: 0, total: 0 };
  // Each line holds one photo at least, so `size` lines are enough.
  const nearest = db
    .select({
      authorId: chatLines.authorId,
      content: chatLines.content,
      sentAt: chatLines.sentAt,
      seq: chatLines.seq,
    })
    .from(chatLines)
    .where(and(seen, side))
    .orderBy(after ? asc(chatLines.seq) : desc(chatLines.seq))
    .limit(size)
    .all()
    .map(({ content, ...line }) => ({ ...line, photos: photosOf(content) }));
  const lines: typeof nearest = [];
  let held = 0;
  for (const line of nearest) {
    const holds = line.photos.length;
    if (lines.length > 0 && held + holds > size) {
      break;
    }
    lines.push(line);
    held += holds;
  }
  const page = after ? lines : lines.toReversed();
  return {
    // After `seq`, those up to it come before; before it, those before it
    // the page leaves out.
    offset: after ? counted.total - counted.onSide : counted.onSide - held,
    photos: page.flatMap(({ authorId, photos, sentAt, seq: lineSeq }) =>
      photos.map((photo) => ({
        authorId,
        photo: sentPhoto(photo),
        sentAtMs: BigInt(sentAt.getTime()),
        seq: BigInt(lineSeq),
      }))
    ),
    total: counted.total,
  };
};

/**
 * The chats' lines and read marks changed after `cursor`, for a member's
 * device catching up, of the chats they may read: every read mark, every change to a line it may hold (one
 * written by then), and of the lines written since only each chat's
 * latest page, the rest coming as pages as it scrolls back; and the lines
 * the replies among them answer, at their own cursors.
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
  const rows = threads.flatMap(({ threadId }) =>
    db
      .select()
      .from(chatLines)
      .where(
        and(
          eq(chatLines.threadId, threadId),
          gt(chatLines.cursor, cursor),
          or(
            lte(chatLines.createdCursor, cursor),
            gt(chatLines.seq, latestPageAfter(db, threadId)),
            // Pinned lines however far back, for the pins over the chat.
            isNotNull(chatLines.pinnedAt)
          )
        )
      )
      .orderBy(asc(chatLines.cursor))
      .all()
  );
  const lines = asReadBy(db, chatLineChanges(db, rows), userId);
  const marks = db
    .select()
    .from(readMarks)
    .where(gt(readMarks.cursor, cursor))
    .all()
    .filter(({ threadId }) => mayRead(threadId, userId))
    .map(readMarkChange);
  const answered = asReadBy(db, answeredChanges(db, linesOf(lines)), userId);
  return [...lines, ...answered, ...marks];
};

/** A message's words with each mention as @ and the name (spec/vectors/chat-text.json, plainText). */
export const plainText = (
  text: string,
  nameOf: (id: string) => string
): string => text.replace(MENTION, (_, id: string) => `@${nameOf(id)}`);

/** How many lines either side of a reported line go with the report. */
const REPORT_AROUND = 3;

/**
 * What a report is kept with (spec/chat.md, Reporting and blocking): the
 * line with the few around it, as JSON, each with its writer's name, its
 * words with mentions as names, and the reported one marked; or a
 * member's name. Null when the reporter cannot read the line or reports
 * themselves.
 */
export const reportContext = (
  db: DrizzleSqliteDODatabase,
  reporterId: string,
  target: { threadId: string; seq: number } | { userId: string },
  memberOf: (userId: string) => { displayName: string } | undefined
): { targetId: string; targetName: string; context: string } | null => {
  const nameOf = (id: string) => memberOf(id)?.displayName ?? "メンバー";
  if ("userId" in target) {
    const member = memberOf(target.userId);
    return member === undefined || target.userId === reporterId
      ? null
      : {
          context: JSON.stringify({ name: member.displayName }),
          targetId: target.userId,
          targetName: member.displayName,
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
    // The app's notices are no one's words.
    .filter(
      (row) => row.hiddenFrom !== reporterId && row.content.kind !== "notice"
    )
    .map(({ authorId, content, seq }) => {
      const photos = photosOf(content);
      return {
        authorId,
        days:
          content.kind === "days" || content.kind === "poll"
            ? content.days
            : null,
        name: nameOf(authorId),
        photos: photos.length === 0 ? undefined : photos.map(({ id }) => id),
        reported: seq === target.seq,
        seq,
        text: content.kind === "words" ? plainText(content.text, nameOf) : "",
        unsent: content.kind === "unsent",
      };
    });
  return {
    context: JSON.stringify(around),
    targetId: line.authorId,
    targetName: nameOf(line.authorId),
  };
};

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** The most characters of a message's words a notification carries. */
const ALERT_TEXT_MAX = 200;

/** A new line's kind, as its notification's key names it. */
const alertKind = (content: ChatContent["kind"] | undefined): string => {
  switch (content?.case) {
    case "photos": {
      return "PHOTO";
    }
    case "poll": {
      return "POLL";
    }
    case "days": {
      return "DAYS";
    }
    case "words":
    case "notice":
    case "unsent":
    case "hidden":
    case undefined: {
      return "TEXT";
    }
    default: {
      return content satisfies never;
    }
  }
};

/** A line's words as the wire carries them; none for any other kind. */
export const wordsOf = (line: ChatLine): string => {
  const content = line.content?.kind;
  return content?.case === "words" ? content.value.text : "";
};

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
  nameOf: (id: string) => string,
  // A chat of two, worded as a one-to-one chat's: titled with the writer.
  direct = line.threadId !== GROUP_THREAD
): Alert => {
  const writer = nameOf(line.authorId);
  const kind = alertKind(line.content?.kind);
  // Cut between characters as people see them, emoji whole.
  const words = [...graphemes.segment(plainText(wordsOf(line), nameOf))]
    .slice(0, ALERT_TEXT_MAX)
    .map(({ segment }) => segment)
    .join("");
  const said = kind === "TEXT" ? [words] : [];
  return {
    body: direct
      ? { args: said, key: `CHAT_${kind}` }
      : { args: [writer, ...said], key: `CHAT_GROUP_${kind}` },
    groupId: group.id,
    line: { authorId: line.authorId, seq: Number(line.seq) },
    threadId: line.threadId,
    title: { args: [direct ? writer : group.name], key: "CHAT_TITLE" },
  };
};

/**
 * Who would not hear of a line by `authorId`, having blocked them: read
 * once for all of a line's readers.
 */
export const blockersOf = (
  db: DrizzleSqliteDODatabase,
  authorId: string
): Set<string> =>
  new Set(
    db
      .select({ userId: memberBlocks.userId })
      .from(memberBlocks)
      .where(eq(memberBlocks.blockedId, authorId))
      .all()
      .map((row) => row.userId)
  );

/**
 * A line from the app at 全体チャット's end (spec/chat.md, Notices), written
 * as `authorId` changes the group: who is in it, the way in, or what it
 * is. Never unread, and never notified.
 */
export const writeNotice = (
  db: DrizzleSqliteDODatabase,
  authorId: string,
  notice: Notice,
  cursor: number
): Change => {
  const row = db
    .insert(chatLines)
    .values({
      authorId,
      content: { kind: "notice", notice },
      createdCursor: cursor,
      cursor,
      opId: `notice-${cursor}`,
      sentAt: new Date(),
      seq: chatHead(db, GROUP_THREAD) + 1,
      threadId: GROUP_THREAD,
    })
    .returning()
    .get();
  return chatLineChange(db, row);
};
