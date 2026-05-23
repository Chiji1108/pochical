import type { Doc, Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import {
  createDirectPairKey,
  GROUP_THREAD_PAIR_KEY,
  listThreadsForGroup,
} from "./chatThreads";
import { getUnreadCountsByThreadId } from "./unreads";

export type GroupChatOverview = {
  groupLastMessageCreatedAt?: number;
  groupLastMessagePreview?: string;
  groupUnreadCount: number;
  lastMessagePreview?: string;
  threadByPairKey: Map<string, Doc<"chatThreads">>;
  unreadCount: number;
  unreadCountsByThreadId: Map<Id<"chatThreads">, number>;
};

export const getGroupChatOverview = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  instantUserId: string,
  members: Doc<"groupMembers">[]
): Promise<GroupChatOverview> => {
  const threads = await listThreadsForGroup(ctx, groupId);
  const groupThread =
    threads.find(
      (thread) =>
        thread.kind === "group" && thread.pairKey === GROUP_THREAD_PAIR_KEY
    ) ?? null;
  const unreadCountsByThreadId = await getUnreadCountsByThreadId(
    ctx,
    threads,
    instantUserId
  );
  const groupUnreadCount = groupThread
    ? (unreadCountsByThreadId.get(groupThread._id) ?? 0)
    : 0;
  let directUnreadCount = 0;
  const directPairKeys = new Set(
    members
      .filter((member) => member.instantUserId !== instantUserId)
      .map((member) => createDirectPairKey(instantUserId, member.instantUserId))
  );
  const threadByPairKey = new Map<string, Doc<"chatThreads">>();

  for (const thread of threads) {
    if (!(thread.kind === "direct" && directPairKeys.has(thread.pairKey))) {
      continue;
    }

    threadByPairKey.set(thread.pairKey, thread);
    directUnreadCount += unreadCountsByThreadId.get(thread._id) ?? 0;
  }

  const latestThread = threads
    .filter((thread) => thread.lastMessageCreatedAt)
    .sort(
      (a, b) => (b.lastMessageCreatedAt ?? 0) - (a.lastMessageCreatedAt ?? 0)
    )[0];

  return {
    groupLastMessageCreatedAt: groupThread?.lastMessageCreatedAt,
    groupUnreadCount,
    groupLastMessagePreview: groupThread?.lastMessagePreview,
    lastMessagePreview: latestThread?.lastMessagePreview,
    threadByPairKey,
    unreadCount: groupUnreadCount + directUnreadCount,
    unreadCountsByThreadId,
  };
};
