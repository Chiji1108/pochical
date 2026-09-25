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

// Read positions are served separately from message pages so that marking a
// thread read re-runs only this small query instead of every loaded page.
export const listThreadReadStates = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null
) => {
  const readStates: { lastReadAt: number; userId: string }[] = [];

  if (!thread) {
    return readStates;
  }

  for (const userId of await getThreadReaderIds(ctx, thread)) {
    readStates.push({
      lastReadAt: await getLastReadByChannelId(ctx, {
        channelId: thread._id,
        userId,
      }),
      userId,
    });
  }

  return readStates;
};

export const addMessageMetadata = async (
  ctx: QueryCtx,
  page: Doc<"chatMessages">[]
) => {
  const displayNames = new Map<string, string>();
  const messages: (Doc<"chatMessages"> & {
    authorDisplayName: string;
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
    });
  }

  return messages;
};
