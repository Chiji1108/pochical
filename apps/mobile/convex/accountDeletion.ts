import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { purgeAccountData } from "../convex-lib/accountDeletion";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const credentials = internalQuery({
  args: {},
  returns: v.object({
    userId: v.id("users"),
    appleSubject: v.union(v.string(), v.null()),
    refreshToken: v.union(v.string(), v.null()),
    clientId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get(userId) : null;
    if (!(user && userId)) {
      throw new ConvexError("ログインが必要です");
    }
    const apple = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", "apple")
      )
      .first();
    return {
      userId,
      appleSubject: apple?.providerAccountId ?? null,
      refreshToken: user.appleRefreshToken ?? null,
      clientId: user.appleClientId ?? null,
    };
  },
});

export const begin = internalMutation({
  args: { expectedUserId: v.id("users"), receipt: v.string() },
  returns: v.string(),
  handler: async (ctx, { expectedUserId, receipt }) => {
    const userId = await getAuthUserId(ctx);
    if (userId !== expectedUserId) {
      throw new ConvexError("アカウントが変更されました。やり直してください");
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new ConvexError("アカウントが見つかりません");
    }
    if (user.deletingAt !== undefined) {
      const existing = await ctx.db
        .query("accountDeletions")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (!existing) {
        throw new ConvexError("削除を処理中です");
      }
      return existing.receipt;
    }
    const ownerId = user.workspaceId ?? userId;
    const linked = await ctx.db
      .query("users")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", ownerId))
      .take(101);
    if (linked.length > 100) {
      throw new ConvexError(
        "削除対象が多すぎます。サポートにお問い合わせください"
      );
    }
    const userIds = [
      ...new Set([ownerId, userId, ...linked.map((row) => row._id)]),
    ];
    for (const id of userIds) {
      await ctx.db.patch(id, { deletingAt: Date.now() });
    }
    const jobId = await ctx.db.insert("accountDeletions", {
      receipt,
      userId,
      ownerId,
      userIds,
      phase: 0,
      cursor: null,
      subphase: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.step, { jobId });
    return receipt;
  },
});

export const step = internalMutation({
  args: { jobId: v.id("accountDeletions") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) {
      return null;
    }
    if (job.phase >= 19) {
      await ctx.db.delete(jobId);
      return null;
    }
    const { phase, cursor, subphase } = await purgeAccountData(ctx, job);
    await ctx.db.patch(jobId, {
      phase,
      cursor,
      subphase,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.step, { jobId });
    return null;
  },
});

export const resumeStalled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query("accountDeletions")
      .withIndex("by_updatedAt", (q) =>
        q.lt("updatedAt", Date.now() - 5 * 60_000)
      )
      .take(50);
    for (const job of jobs) {
      await ctx.db.patch(job._id, { updatedAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.accountDeletion.step, {
        jobId: job._id,
      });
    }
    return null;
  },
});

// The unguessable receipt reveals only progress, so it works after signing out.
export const pending = query({
  args: { receipt: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { receipt }) =>
    !!(await ctx.db
      .query("accountDeletions")
      .withIndex("by_receipt", (q) => q.eq("receipt", receipt))
      .first()),
});
