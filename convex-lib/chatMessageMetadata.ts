import type { Doc, Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import { getMembership, listMembers } from "./groupMembers";
import { getLastReadByChannelId } from "./unreads";

const getDisplayNameByUserId = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  userId: string
) => {
  const membership = await getMembership(ctx, groupId, userId);

  return membership?.displayName ?? "脱退済みメンバー";
};

const getThreadReaderIds = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads">
) => {
  if (thread.kind === "direct") {
    return [thread.directParticipantA, thread.directParticipantB].filter(
      (userId): userId is string => Boolean(userId)
    );
  }

  return (await listMembers(ctx, thread.groupId)).map(
    (member) => member.userId
  );
};

const getLastReadByUserId = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null
) => {
  const lastReadByUserId = new Map<string, number>();

  if (!thread) {
    return lastReadByUserId;
  }

  for (const userId of await getThreadReaderIds(ctx, thread)) {
    lastReadByUserId.set(
      userId,
      await getLastReadByChannelId(ctx, {
        channelId: thread._id,
        userId,
      })
    );
  }

  return lastReadByUserId;
};

const countReadReceipts = (
  lastReadByUserId: Map<string, number>,
  message: Doc<"chatMessages">
) => {
  let readCount = 0;

  for (const [userId, lastReadAt] of lastReadByUserId) {
    if (userId !== message.authorUserId && lastReadAt >= message.createdAt) {
      readCount += 1;
    }
  }

  return readCount;
};

export const addMessageMetadata = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null,
  page: Doc<"chatMessages">[]
) => {
  const displayNames = new Map<string, string>();
  const lastReadByUserId = await getLastReadByUserId(ctx, thread);
  const messages: (Doc<"chatMessages"> & {
    authorDisplayName: string;
    readCount: number;
  })[] = [];

  for (const message of page) {
    let displayName =
      message.authorDisplayNameSnapshot ||
      displayNames.get(message.authorUserId);

    if (!displayName) {
      displayName = await getDisplayNameByUserId(
        ctx,
        message.groupId,
        message.authorUserId
      );
      displayNames.set(message.authorUserId, displayName);
    }

    messages.push({
      ...message,
      authorDisplayName: displayName,
      readCount: countReadReceipts(lastReadByUserId, message),
    });
  }

  return messages;
};
