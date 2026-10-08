// The lines of a user's chat with Pochical's people as the app, the admin
// site and Slack all read and change them (spec/chat.md, The chat with
// Pochical's people): each with its reactions, and taken back in place.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportMessages, supportReactions } from "./db/schema";
import { supportPhotoKey } from "./photos";

export type SupportRow = typeof supportMessages.$inferSelect;

/** An emoji on a line, and who put it there. */
export type SupportReactionOf = {
  emoji: string;
  mine: boolean;
  support: boolean;
};

export type SupportLineOf = SupportRow & { reactions: SupportReactionOf[] };

type ReactionRow = typeof supportReactions.$inferSelect;

/** Each line with its emoji, in the order they were first put on. */
const withReactions = (
  rows: SupportRow[],
  reactions: ReactionRow[]
): SupportLineOf[] => {
  const byLine = new Map<string, Map<string, SupportReactionOf>>();
  for (const reaction of reactions) {
    const emoji =
      byLine.get(reaction.messageId) ?? new Map<string, SupportReactionOf>();
    const entry = emoji.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      mine: false,
      support: false,
    };
    if (reaction.fromSupport) {
      entry.support = true;
    } else {
      entry.mine = true;
    }
    emoji.set(reaction.emoji, entry);
    byLine.set(reaction.messageId, emoji);
  }
  return rows.map((row) => ({
    ...row,
    reactions: [...(byLine.get(row.id)?.values() ?? [])],
  }));
};

/** A user's chat, oldest first. */
export const linesOf = async (
  env: Env,
  userId: string
): Promise<SupportLineOf[]> => {
  const db = drizzle(env.DB);
  const [rows, reactions] = await Promise.all([
    db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.userId, userId))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id)),
    db
      .select()
      .from(supportReactions)
      .where(
        inArray(
          supportReactions.messageId,
          db
            .select({ id: supportMessages.id })
            .from(supportMessages)
            .where(eq(supportMessages.userId, userId))
        )
      )
      .orderBy(sql`rowid`),
  ]);
  return withReactions(rows, reactions);
};

/** One line by id, or by its message in Slack. */
export const lineWhere = async (
  env: Env,
  where: { id: string } | { slackTs: string }
): Promise<SupportLineOf | undefined> => {
  const db = drizzle(env.DB);
  const [row] = await db
    .select()
    .from(supportMessages)
    .where(
      "id" in where
        ? eq(supportMessages.id, where.id)
        : eq(supportMessages.slackTs, where.slackTs)
    );
  if (row === undefined) {
    return undefined;
  }
  const reactions = await db
    .select()
    .from(supportReactions)
    .where(eq(supportReactions.messageId, row.id))
    .orderBy(sql`rowid`);
  return withReactions([row], reactions)[0];
};

/** The lines that are one message in Slack: an answer's photos and words. */
export const linesWithSlackTs = async (
  env: Env,
  slackTs: string
): Promise<SupportRow[]> =>
  await drizzle(env.DB)
    .select()
    .from(supportMessages)
    .where(eq(supportMessages.slackTs, slackTs));

/** An emoji put on a line or taken off, by the user or Pochical's people. */
export const reactTo = async (
  env: Env,
  messageId: string,
  fromSupport: boolean,
  emoji: string,
  on: boolean
): Promise<void> => {
  const db = drizzle(env.DB);
  await (on
    ? db
        .insert(supportReactions)
        .values({ emoji, fromSupport, messageId })
        .onConflictDoNothing()
        .run()
    : db
        .delete(supportReactions)
        .where(
          and(
            eq(supportReactions.messageId, messageId),
            eq(supportReactions.fromSupport, fromSupport),
            eq(supportReactions.emoji, emoji)
          )
        )
        .run());
};

/**
 * A line taken back by its writer: its words, photo, reply and reactions
 * go, the photo from the bucket too.
 */
export const unsendLine = async (env: Env, line: SupportRow): Promise<void> => {
  const db = drizzle(env.DB);
  await db.batch([
    db
      .update(supportMessages)
      .set({
        photoHeight: null,
        photoId: null,
        photoWidth: null,
        replyTo: null,
        text: "",
        unsent: true,
      })
      .where(eq(supportMessages.id, line.id)),
    db.delete(supportReactions).where(eq(supportReactions.messageId, line.id)),
  ]);
  if (line.photoId !== null) {
    await env.PHOTOS.delete(supportPhotoKey(line.userId, line.photoId));
  }
};

/** A line's message in Slack, as it is posted. */
export const keepSlackTs = async (
  env: Env,
  messageId: string,
  slackTs: string
): Promise<void> => {
  await drizzle(env.DB)
    .update(supportMessages)
    .set({ slackTs })
    .where(eq(supportMessages.id, messageId))
    .run();
};
