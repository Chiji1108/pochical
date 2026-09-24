import type { FunctionReference } from "convex/server";
import { components } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";

export const DELETED_USER = "deleted-account";
export const DELETED_NAME = "削除済みのユーザー";
export const DELETED_MESSAGE = "メッセージは削除されました";
const BATCH_SIZE = 50;
type Job = Doc<"accountDeletions">;
type Progress = { phase: number; cursor: string | null; subphase: number };
const next = (job: Job): Progress => ({
  phase: job.phase + 1,
  cursor: null,
  subphase: 0,
});
const replicatePrivacy = components.replicate as unknown as {
  privacy: {
    purge: FunctionReference<
      "mutation",
      "internal",
      { collection: string; phase: number },
      { phase: number; done: boolean }
    >;
  };
};
const unreadPrivacy = components.unreadTracking as unknown as {
  privacy: {
    purge: FunctionReference<
      "mutation",
      "internal",
      { userId: string; phase: number; cursor: string | null },
      { phase: number; cursor: string | null; done: boolean }
    >;
  };
};

// Bounded sweeps also find quotes and reactions stored in other users’ rows.
const purgeMessages = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const ids = new Set<string>(job.userIds);
  const pagination = { cursor: job.cursor, numItems: BATCH_SIZE };
  const page = await ctx.db.query("chatMessages").paginate(pagination);
  for (const row of page.page) {
    if (ids.has(row.authorUserId)) {
      await ctx.db.patch(row._id, {
        body: "",
        authorUserId: DELETED_USER,
        authorDisplayNameSnapshot: DELETED_NAME,
        reply: undefined,
        reactions: undefined,
        deletedAt: Date.now(),
      });
    } else {
      const quoted = row.reply && ids.has(row.reply.authorUserId);
      const reacted = row.reactions?.some((reaction) =>
        reaction.userIds.some((id) => ids.has(id))
      );
      if (quoted || reacted) {
        await ctx.db.patch(row._id, {
          reply:
            quoted && row.reply
              ? {
                  ...row.reply,
                  authorUserId: DELETED_USER,
                  authorDisplayName: DELETED_NAME,
                  body: DELETED_MESSAGE,
                }
              : row.reply,
          reactions: row.reactions
            ?.map((reaction) => ({
              ...reaction,
              userIds: reaction.userIds.filter((id) => !ids.has(id)),
            }))
            .filter((reaction) => reaction.userIds.length > 0),
        });
      }
    }
  }
  return page.isDone ? next(job) : { ...job, cursor: page.continueCursor };
};

const purgeEvents = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const ids = new Set<string>(job.userIds);
  const pagination = { cursor: job.cursor, numItems: BATCH_SIZE };
  const page = await ctx.db.query("groupEvents").paginate(pagination);
  for (const row of page.page) {
    if (
      ids.has(row.actorUserId) ||
      (row.targetUserId && ids.has(row.targetUserId))
    ) {
      await ctx.db.patch(row._id, {
        actorUserId: DELETED_USER,
        actorDisplayNameSnapshot: DELETED_NAME,
        targetUserId: undefined,
        targetDisplayNameSnapshot: undefined,
        body: "削除済みのユーザーによる操作",
        previousValue: undefined,
        nextValue: undefined,
      });
    }
  }
  return page.isDone ? next(job) : { ...job, cursor: page.continueCursor };
};

const purgeThreads = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const ids = new Set<string>(job.userIds);
  const pagination = { cursor: job.cursor, numItems: BATCH_SIZE };
  const page = await ctx.db.query("chatThreads").paginate(pagination);
  for (const row of page.page) {
    const last = await ctx.db
      .query("chatMessages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", row._id))
      .order("desc")
      .first();
    const direct =
      ids.has(row.directParticipantA ?? "") ||
      ids.has(row.directParticipantB ?? "");
    await ctx.db.patch(row._id, {
      lastMessagePreview:
        last?.deletedAt === undefined
          ? last?.body.slice(0, 80)
          : DELETED_MESSAGE,
      ...(direct
        ? {
            directParticipantA: ids.has(row.directParticipantA ?? "")
              ? DELETED_USER
              : row.directParticipantA,
            directParticipantB: ids.has(row.directParticipantB ?? "")
              ? DELETED_USER
              : row.directParticipantB,
            pairKey: `deleted:${row._id}`,
          }
        : {}),
    });
  }
  return page.isDone ? next(job) : { ...job, cursor: page.continueCursor };
};

const purgeCalendar = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const table = (["shiftPatterns", "shiftMembers", "shifts"] as const)[
    job.phase - 4
  ];
  const rows = await ctx.db
    .query(table)
    .withIndex("by_ownerId", (q) => q.eq("ownerId", job.ownerId))
    .take(BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length ? job : next(job);
};

const purgeReplicas = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const collection = ["shiftPatterns", "shiftMembers", "shifts"][job.phase - 7];
  const result = await ctx.runMutation(replicatePrivacy.privacy.purge, {
    collection: `${collection}:${job.ownerId}`,
    phase: job.subphase,
  });
  return result.done ? next(job) : { ...job, subphase: result.phase };
};

const purgeUnreads = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const result = await ctx.runMutation(unreadPrivacy.privacy.purge, {
    userId: job.ownerId,
    phase: job.subphase,
    cursor: job.cursor,
  });
  return result.done
    ? next(job)
    : { ...job, subphase: result.phase, cursor: result.cursor };
};

const purgePresence = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const rooms = await ctx.runQuery(components.presence.public.listUser, {
    userId: job.ownerId,
    limit: 10,
    onlineOnly: false,
  });
  for (const room of rooms) {
    await ctx.runMutation(components.presence.public.removeRoomUser, {
      userId: job.ownerId,
      roomId: room.roomId,
    });
  }
  return rooms.length ? job : next(job);
};

const purgeMemberships = async (
  ctx: MutationCtx,
  job: Job
): Promise<Progress> => {
  const rows = await ctx.db
    .query("groupMembers")
    .withIndex("by_userId", (q) => q.eq("userId", job.ownerId))
    .take(BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
    const member = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId", (q) => q.eq("groupId", row.groupId))
      .first();
    if (!member && (await ctx.db.get(row.groupId))) {
      await ctx.db.delete(row.groupId);
    }
  }
  return rows.length ? job : next(job);
};

const purgeGroups = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const page = await ctx.db
    .query("groups")
    .paginate({ cursor: job.cursor, numItems: BATCH_SIZE });
  for (const row of page.page) {
    if (job.userIds.includes(row.createdBy as Job["ownerId"])) {
      await ctx.db.patch(row._id, { createdBy: DELETED_USER });
    }
    // Shared groups survive. Empty groups are collected separately in bounded batches.
    const member = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId", (q) => q.eq("groupId", row._id))
      .first();
    if (!member && job.userIds.includes(row.createdBy as Job["ownerId"])) {
      await ctx.db.delete(row._id);
    }
  }
  return page.isDone ? next(job) : { ...job, cursor: page.continueCursor };
};

const purgeOrphanedChat = async (
  ctx: MutationCtx,
  job: Job
): Promise<Progress> => {
  const table = (["chatMessages", "groupEvents", "chatThreads"] as const)[
    job.phase - 13
  ];
  const page = await ctx.db
    .query(table)
    .paginate({ cursor: job.cursor, numItems: BATCH_SIZE });
  for (const row of page.page) {
    if (!(await ctx.db.get(row.groupId))) {
      await ctx.db.delete(row._id);
    }
  }
  return page.isDone ? next(job) : { ...job, cursor: page.continueCursor };
};

const purgeLinks = async (ctx: MutationCtx, job: Job): Promise<Progress> => {
  const page = await ctx.db
    .query("accountLinks")
    .paginate({ cursor: job.cursor, numItems: BATCH_SIZE });
  for (const row of page.page) {
    if (
      job.userIds.includes(row.sourceUserId) ||
      (row.completedTargetId && job.userIds.includes(row.completedTargetId))
    ) {
      await ctx.db.delete(row._id);
    }
  }
  return page.isDone ? next(job) : { ...job, cursor: page.continueCursor };
};

const purgeAuthentication = async (
  ctx: MutationCtx,
  job: Job
): Promise<Progress> => {
  const userId = job.userIds[job.subphase];
  if (!userId) {
    return next(job);
  }
  if (job.phase === 17) {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .first();
    if (!session) {
      return { ...job, subphase: job.subphase + 1 };
    }
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .take(BATCH_SIZE);
    for (const row of tokens) {
      await ctx.db.delete(row._id);
    }
    const verifiers = await ctx.db
      .query("authVerifiers")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .take(BATCH_SIZE);
    for (const row of verifiers) {
      await ctx.db.delete(row._id);
    }
    if (!(tokens.length || verifiers.length)) {
      await ctx.db.delete(session._id);
    }
    return job;
  }
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .first();
  if (account) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .take(BATCH_SIZE);
    for (const code of codes) {
      await ctx.db.delete(code._id);
    }
    if (!codes.length) {
      await ctx.db.delete(account._id);
    }
    return job;
  }
  await ctx.db.delete(userId);
  return { ...job, subphase: job.subphase + 1 };
};

const phases = [
  purgeMemberships,
  purgeMessages,
  purgeEvents,
  purgeThreads,
  purgeCalendar,
  purgeCalendar,
  purgeCalendar,
  purgeReplicas,
  purgeReplicas,
  purgeReplicas,
  purgeUnreads,
  purgePresence,
  purgeGroups,
  purgeOrphanedChat,
  purgeOrphanedChat,
  purgeOrphanedChat,
  purgeLinks,
  purgeAuthentication,
  purgeAuthentication,
];
export const purgeAccountData = async (
  ctx: MutationCtx,
  job: Job
): Promise<Progress> => await phases[job.phase](ctx, job);
