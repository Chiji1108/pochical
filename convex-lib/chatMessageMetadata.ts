import type { Doc, Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import { getMembership, listMembers } from "./groupMembers";
import { getLastReadByChannelId } from "./unreads";

const getDisplayNameByJazzUserId = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) => {
  const membership = await getMembership(ctx, groupId, jazzUserId);

  return membership?.displayName ?? "脱退済みメンバー";
};

const getThreadReaderIds = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads">
) => {
  if (thread.kind === "direct") {
    return [thread.directParticipantA, thread.directParticipantB].filter(
      (jazzUserId): jazzUserId is string => Boolean(jazzUserId)
    );
  }

  return (await listMembers(ctx, thread.groupId)).map(
    (member) => member.jazzUserId
  );
};

const getLastReadByJazzUserId = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null
) => {
  const lastReadByJazzUserId = new Map<string, number>();

  if (!thread) {
    return lastReadByJazzUserId;
  }

  for (const jazzUserId of await getThreadReaderIds(ctx, thread)) {
    lastReadByJazzUserId.set(
      jazzUserId,
      await getLastReadByChannelId(ctx, {
        channelId: thread._id,
        jazzUserId,
      })
    );
  }

  return lastReadByJazzUserId;
};

const countReadReceipts = (
  lastReadByJazzUserId: Map<string, number>,
  message: Doc<"chatMessages">
) => {
  let readCount = 0;

  for (const [jazzUserId, lastReadAt] of lastReadByJazzUserId) {
    if (
      jazzUserId !== message.authorJazzUserId &&
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
  const lastReadByJazzUserId = await getLastReadByJazzUserId(ctx, thread);
  const messages: (Doc<"chatMessages"> & {
    authorDisplayName: string;
    readCount: number;
  })[] = [];

  for (const message of page) {
    let displayName =
      message.authorDisplayNameSnapshot ||
      displayNames.get(message.authorJazzUserId);

    if (!displayName) {
      displayName = await getDisplayNameByJazzUserId(
        ctx,
        message.groupId,
        message.authorJazzUserId
      );
      displayNames.set(message.authorJazzUserId, displayName);
    }

    messages.push({
      ...message,
      authorDisplayName: displayName,
      readCount: countReadReceipts(lastReadByJazzUserId, message),
    });
  }

  return messages;
};
