import type { Doc, Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import { getMembership, listMembers } from "./groupMembers";
import { getLastReadByChannelId } from "./unreads";

const getDisplayNameByInstantUserId = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  instantUserId: string
) => {
  const membership = await getMembership(ctx, groupId, instantUserId);

  return membership?.displayName ?? "脱退済みメンバー";
};

const getThreadReaderIds = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads">
) => {
  if (thread.kind === "direct") {
    return [thread.directParticipantA, thread.directParticipantB].filter(
      (instantUserId): instantUserId is string => Boolean(instantUserId)
    );
  }

  return (await listMembers(ctx, thread.groupId)).map(
    (member) => member.instantUserId
  );
};

const getLastReadByInstantUserId = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null
) => {
  const lastReadByInstantUserId = new Map<string, number>();

  if (!thread) {
    return lastReadByInstantUserId;
  }

  for (const instantUserId of await getThreadReaderIds(ctx, thread)) {
    lastReadByInstantUserId.set(
      instantUserId,
      await getLastReadByChannelId(ctx, {
        channelId: thread._id,
        instantUserId,
      })
    );
  }

  return lastReadByInstantUserId;
};

const countReadReceipts = (
  lastReadByInstantUserId: Map<string, number>,
  message: Doc<"chatMessages">
) => {
  let readCount = 0;

  for (const [instantUserId, lastReadAt] of lastReadByInstantUserId) {
    if (
      instantUserId !== message.authorInstantUserId &&
      lastReadAt >= message.createdAt
    ) {
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
  const lastReadByInstantUserId = await getLastReadByInstantUserId(ctx, thread);
  const messages: (Doc<"chatMessages"> & {
    authorDisplayName: string;
    readCount: number;
  })[] = [];

  for (const message of page) {
    let displayName =
      message.authorDisplayNameSnapshot ||
      displayNames.get(message.authorInstantUserId);

    if (!displayName) {
      displayName = await getDisplayNameByInstantUserId(
        ctx,
        message.groupId,
        message.authorInstantUserId
      );
      displayNames.set(message.authorInstantUserId, displayName);
    }

    messages.push({
      ...message,
      authorDisplayName: displayName,
      readCount: countReadReceipts(lastReadByInstantUserId, message),
    });
  }

  return messages;
};
