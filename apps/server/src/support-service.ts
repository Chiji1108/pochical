import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { textLimits } from "@pochical/design/limits";
import { env } from "cloudflare:workers";
import { and, asc, count, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { supportChats, supportMessages } from "./db/schema";
import {
  GetSupportChatResponseSchema,
  MarkSupportReadResponseSchema,
  SendSupportMessageResponseSchema,
  SupportMessageSchema,
  SupportService,
} from "./gen/pochical/v1/support_pb";
import { overLimit } from "./rate-limits";
import { requireUser } from "./session";
import { requireText } from "./text-limits";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

type Row = typeof supportMessages.$inferSelect;

/** How much of the app's word on itself is kept. */
const DEVICE_MAX = 100;

const messageOf = (row: Row) =>
  create(SupportMessageSchema, {
    fromSupport: row.fromSupport,
    id: row.id,
    sentAtMs: BigInt(row.createdAt.getTime()),
    text: row.text,
  });

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
        gt(supportMessages.createdAt, chat?.readAt ?? new Date(0))
      )
    );
  return row?.unread ?? 0;
};

export const registerSupportService = (router: ConnectRouter): void => {
  router.service(SupportService, {
    getSupportChat: async (_request, context) => {
      const user = await requireUser(context);
      const db = drizzle(env.DB);
      const rows = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.userId, user.id))
        .orderBy(asc(supportMessages.createdAt));
      return create(GetSupportChatResponseSchema, {
        messages: rows.map(messageOf),
        unread: await unreadOf(db, user.id),
      });
    },
    markSupportRead: async (_request, context) => {
      const user = await requireUser(context);
      const now = new Date();
      await drizzle(env.DB)
        .insert(supportChats)
        .values({ lastAt: now, userId: user.id, userReadAt: now })
        .onConflictDoUpdate({
          set: { userReadAt: now },
          target: supportChats.userId,
        })
        .run();
      return create(MarkSupportReadResponseSchema, {});
    },
    sendSupportMessage: async ({ device, id, text }, context) => {
      const user = await requireUser(context);
      if (!UUID.test(id)) {
        throw new ConnectError("id is not a UUID", Code.InvalidArgument);
      }
      const words = requireText(text, textLimits.chatMessage, "text");
      const db = drizzle(env.DB);
      // A send tried again finds its line kept, and is not counted again.
      const [kept] = await db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.id, id));
      if (kept !== undefined) {
        if (kept.userId !== user.id) {
          throw new ConnectError("id is taken", Code.AlreadyExists);
        }
        return create(SendSupportMessageResponseSchema, {
          message: messageOf(kept),
        });
      }
      if (await overLimit(env.SUPPORT_LIMIT, user.id)) {
        throw new ConnectError("Try again in a minute", Code.ResourceExhausted);
      }
      const row: Row = {
        createdAt: new Date(),
        // Only what an app says of itself, kept short.
        device: device === "" ? null : device.slice(0, DEVICE_MAX),
        fromSupport: false,
        id,
        text: words,
        userId: user.id,
      };
      await db.batch([
        db.insert(supportMessages).values(row),
        db
          .insert(supportChats)
          .values({ lastAt: row.createdAt, userId: user.id })
          .onConflictDoUpdate({
            set: { lastAt: row.createdAt },
            target: supportChats.userId,
          }),
      ]);
      return create(SendSupportMessageResponseSchema, {
        message: messageOf(row),
      });
    },
  });
};
