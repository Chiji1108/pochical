import { ConvexError } from "convex/values";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";

export const GROUP_THREAD_PAIR_KEY = "group";

type ChatKind = Doc<"chatThreads">["kind"];
type DatabaseCtx = QueryCtx | MutationCtx;

export const createDirectPairKey = (
  instantUserId: string,
  targetInstantUserId: string
) => JSON.stringify([instantUserId, targetInstantUserId].sort());

export const createDirectPair = (
  instantUserId: string,
  targetInstantUserId: string
) => {
  if (instantUserId === targetInstantUserId) {
    throw new ConvexError("Direct chat target is invalid");
  }

  const [directParticipantA, directParticipantB] = [
    instantUserId,
    targetInstantUserId,
  ].sort();

  return {
    directParticipantA,
    directParticipantB,
    pairKey: createDirectPairKey(instantUserId, targetInstantUserId),
  };
};

export const getThread = async (
  ctx: DatabaseCtx,
  groupId: Id<"groups">,
  kind: ChatKind,
  pairKey: string
) =>
  ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_kind_pairKey", (q) =>
      q.eq("groupId", groupId).eq("kind", kind).eq("pairKey", pairKey)
    )
    .unique();

export const getOrCreateThread = async (
  ctx: MutationCtx,
  groupId: Id<"groups">,
  kind: ChatKind,
  pairKey: string,
  directParticipants?: {
    directParticipantA: string;
    directParticipantB: string;
  }
) => {
  const existingThread = await getThread(ctx, groupId, kind, pairKey);

  if (existingThread) {
    return existingThread;
  }

  const now = Date.now();
  const threadId = await ctx.db.insert("chatThreads", {
    ...directParticipants,
    createdAt: now,
    groupId,
    kind,
    pairKey,
    updatedAt: now,
  });
  const thread = await ctx.db.get(threadId);

  if (!thread) {
    throw new ConvexError("Failed to create chat");
  }

  return thread;
};

export const listThreadsForGroup = (ctx: QueryCtx, groupId: Id<"groups">) =>
  ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_updatedAt", (q) => q.eq("groupId", groupId))
    .collect();
