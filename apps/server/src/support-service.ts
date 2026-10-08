import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { chatRules } from "@pochical/design/chat";
import { textLimits } from "@pochical/design/limits";
import { env, waitUntil } from "cloudflare:workers";
import { and, count, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats, supportMessages } from "./db/schema";
import {
  GetSupportChatResponseSchema,
  MarkSupportReadResponseSchema,
  ReactSupportResponseSchema,
  SendSupportMessageResponseSchema,
  SupportMessageSchema,
  SupportService,
  UnsendSupportMessageResponseSchema,
} from "./gen/pochical/v1/support_pb";
import type { ChatPhoto } from "./gen/pochical/v1/sync_pb";
import { supportPhotoKey } from "./photos";
import { overLimit } from "./rate-limits";
import { requireUser } from "./session";
import {
  tellStaffOfLine,
  tellStaffOfReaction,
  tellStaffOfUnsend,
} from "./slack";
import { lineWhere, linesOf, reactTo, unsendLine } from "./support-chat";
import type { SupportLineOf, SupportRow } from "./support-chat";
import { isEmoji, requireText } from "./text-limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** How much of the app's word on itself is kept. */
const DEVICE_MAX = 100;

const messageOf = (line: SupportLineOf) =>
  create(SupportMessageSchema, {
    fromSupport: line.fromSupport,
    id: line.id,
    photo:
      line.photoId === null
        ? undefined
        : {
            height: line.photoHeight ?? 0,
            id: line.photoId,
            width: line.photoWidth ?? 0,
          },
    reactions: line.reactions,
    replyTo: line.replyTo ?? "",
    sentAtMs: BigInt(line.createdAt.getTime()),
    text: line.text,
    unsent: line.unsent,
  });

/** One of the user's own chat's lines, or NOT_FOUND. */
const lineInChat = async (
  userId: string,
  id: string
): Promise<SupportLineOf> => {
  const line = await lineWhere(env, { id });
  if (line?.userId !== userId) {
    throw new ConnectError("No such line", Code.NotFound);
  }
  return line;
};

const holdBack = async (userId: string): Promise<void> => {
  if (await overLimit(env.SUPPORT_LIMIT, userId)) {
    throw new ConnectError("Try again in a minute", Code.ResourceExhausted);
  }
};

/** A photo's side as the app sends it: within chatRules.photoMaxEdge. */
const isPhotoSide = (side: number): boolean =>
  side > 0 && side <= chatRules.photoMaxEdge;

/**
 * What a new line holds: its words, or a photo the user has uploaded and
 * no words.
 */
const contentOf = async (
  userId: string,
  text: string,
  photo: ChatPhoto | undefined
): Promise<
  Pick<SupportRow, "photoHeight" | "photoId" | "photoWidth" | "text">
> => {
  if (photo === undefined) {
    return {
      photoHeight: null,
      photoId: null,
      photoWidth: null,
      text: requireText(text, textLimits.chatMessage, "text"),
    };
  }
  if (text !== "" || !isPhotoSide(photo.width) || !isPhotoSide(photo.height)) {
    throw new ConnectError(
      "A photo goes alone, at its size",
      Code.InvalidArgument
    );
  }
  if ((await env.PHOTOS.head(supportPhotoKey(userId, photo.id))) === null) {
    throw new ConnectError("Upload the photo first", Code.FailedPrecondition);
  }
  return {
    photoHeight: photo.height,
    photoId: photo.id,
    photoWidth: photo.width,
    text: "",
  };
};

/** The line a reply is to, when it is one still in the user's chat. */
const replyToIn = async (
  userId: string,
  replyTo: string
): Promise<SupportLineOf | null> => {
  if (replyTo === "") {
    return null;
  }
  const line = await lineWhere(env, { id: replyTo });
  return line?.userId === userId && !line.unsent ? line : null;
};

/** Answers from Pochical's people after the user last read the chat. */
const unreadOf = async (
  db: ReturnType<typeof drizzle>,
  userId: string
): Promise<number> => {
  const [chat] = await db
    .select({ readAt: supportChats.userReadAt })
    .from(supportChats)
    .where(eq(supportChats.userId, userId));
  const [row] = await db
    .select({ unread: count() })
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.userId, userId),
        eq(supportMessages.fromSupport, true),
        eq(supportMessages.unsent, false),
        gt(supportMessages.createdAt, chat?.readAt ?? new Date(0))
      )
    );
  return row?.unread ?? 0;
};

export const registerSupportService = (router: ConnectRouter): void => {
  router.service(SupportService, {
    getSupportChat: async (_request, context) => {
      const user = await requireUser(context);
      const [lines, unread] = await Promise.all([
        linesOf(env, user.id),
        unreadOf(drizzle(env.DB), user.id),
      ]);
      return create(GetSupportChatResponseSchema, {
        messages: lines.map(messageOf),
        unread,
      });
    },
    markSupportRead: async (_request, context) => {
      const user = await requireUser(context);
      // A chat with no lines has no answers to read, and gets no row.
      await drizzle(env.DB)
        .update(supportChats)
        .set({ userReadAt: new Date() })
        .where(eq(supportChats.userId, user.id))
        .run();
      return create(MarkSupportReadResponseSchema, {});
    },
    reactSupport: async ({ emoji, id, on }, context) => {
      const user = await requireUser(context);
      const line = await lineInChat(user.id, id);
      if (line.unsent) {
        throw new ConnectError("The line is taken back", Code.NotFound);
      }
      if (!isEmoji(emoji)) {
        throw new ConnectError("Not one emoji", Code.InvalidArgument);
      }
      const had = line.reactions.some(
        (each) => each.emoji === emoji && each.mine
      );
      if (had !== on) {
        await holdBack(user.id);
        await reactTo(env, id, false, emoji, on);
        waitUntil(tellStaffOfReaction(env, line, emoji, on));
      }
      return create(ReactSupportResponseSchema, {
        message: messageOf(await lineInChat(user.id, id)),
      });
    },
    sendSupportMessage: async (
      { device, id, photo, replyTo, text },
      context
    ) => {
      const user = await requireUser(context);
      if (!UUID.test(id)) {
        throw new ConnectError("id is not a UUID", Code.InvalidArgument);
      }
      const content = await contentOf(user.id, text, photo);
      const db = drizzle(env.DB);
      // A send tried again finds its line kept, and is not counted again.
      const [before] = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.id, id));
      if (before !== undefined) {
        if (before.userId !== user.id) {
          throw new ConnectError("id is taken", Code.AlreadyExists);
        }
        return create(SendSupportMessageResponseSchema, {
          message: messageOf(await lineInChat(user.id, id)),
        });
      }
      await holdBack(user.id);
      const repliedTo = await replyToIn(user.id, replyTo);
      const row: SupportRow = {
        ...content,
        createdAt: new Date(),
        // Only what an app says of itself, kept short.
        device: device === "" ? null : device.slice(0, DEVICE_MAX),
        fromSupport: false,
        id,
        replyTo: repliedTo?.id ?? null,
        slackTs: null,
        unsent: false,
        userId: user.id,
      };
      // The same send coming in twice at once keeps one line: the other
      // finds it below, as a send tried again does.
      await db.batch([
        db.insert(supportMessages).values(row).onConflictDoNothing(),
        db
          .insert(supportChats)
          .values({ lastAt: row.createdAt, userId: user.id })
          .onConflictDoUpdate({
            set: { lastAt: row.createdAt },
            target: supportChats.userId,
          }),
      ]);
      const kept = await lineWhere(env, { id });
      if (kept?.userId !== user.id) {
        throw new ConnectError("id is taken", Code.AlreadyExists);
      }
      waitUntil(tellStaffOfLine(env, kept, repliedTo));
      return create(SendSupportMessageResponseSchema, {
        message: messageOf(kept),
      });
    },
    unsendSupportMessage: async ({ id }, context) => {
      const user = await requireUser(context);
      const line = await lineInChat(user.id, id);
      if (line.fromSupport) {
        throw new ConnectError("Not the user's line", Code.NotFound);
      }
      if (!line.unsent) {
        await unsendLine(env, line);
        waitUntil(tellStaffOfUnsend(env, line));
      }
      return create(UnsendSupportMessageResponseSchema, {
        message: messageOf(await lineInChat(user.id, id)),
      });
    },
  });
};
