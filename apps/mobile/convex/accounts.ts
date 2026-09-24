import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { requireUserId } from "../convex-lib/auth";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";

const TOKEN_HASH = /^[a-f0-9]{64}$/;

export const current = query({
  args: {},
  handler: async (ctx) => {
    const id = await getAuthUserId(ctx);
    if (!id) {
      return null;
    }
    const user = await ctx.db.get(id);
    if (!user) {
      return null;
    }
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", id))
      .collect();
    return {
      name: user.name ?? null,
      email: user.email ?? null,
      deletionPending: user.deletingAt !== undefined,
      canRevokeApple: !!(user.appleRefreshToken && user.appleClientId),
      authUserId: id,
      userId: user.workspaceId ?? id,
      isAnonymous: user.isAnonymous === true,
      providers: accounts
        .map((account) => account.provider)
        .filter((provider) => provider !== "anonymous"),
    };
  },
});

// Only a hash is stored. The random secret stays on the device through OAuth.
export const prepareLink = mutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    if (!TOKEN_HASH.test(tokenHash)) {
      throw new ConvexError("Invalid link token");
    }
    const sourceUserId = await requireUserId(ctx);
    await ctx.db.insert("accountLinks", {
      sourceUserId,
      tokenHash,
      expiresAt: Date.now() + 10 * 60_000,
    });
  },
});

export const completeLink = mutation({
  args: { secret: v.string() },
  returns: v.null(),
  handler: async (ctx, { secret }) => {
    const targetId = await getAuthUserId(ctx);
    if (!targetId) {
      throw new ConvexError("Authentication required");
    }
    const target = await ctx.db.get(targetId);
    if (!target || target.isAnonymous) {
      throw new ConvexError("Sign in with Apple or Google first");
    }
    await requireUserId(ctx);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(secret)
    );
    const tokenHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const link = await ctx.db
      .query("accountLinks")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!link) {
      throw new ConvexError("Account link expired");
    }
    await assertLinkSourceActive(ctx, link.sourceUserId);
    if (link.completedTargetId) {
      if (link.completedTargetId !== targetId) {
        throw new ConvexError("Account link already used");
      }
      return null;
    }
    if (
      target.workspaceId === link.sourceUserId ||
      targetId === link.sourceUserId
    ) {
      if (!link.usedAt) {
        await ctx.db.patch(link._id, {
          usedAt: Date.now(),
          completedTargetId: targetId,
        });
      }
      return null;
    }
    if (link.usedAt || link.expiresAt < Date.now()) {
      throw new ConvexError("Account link expired");
    }
    // Existing accounts retain their data; linking must never silently replace it.
    const hasData =
      (await ctx.db
        .query("shiftPatterns")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", targetId))
        .first()) ??
      (await ctx.db
        .query("shifts")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", targetId))
        .first()) ??
      (await ctx.db
        .query("shiftMembers")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", targetId))
        .first()) ??
      (await ctx.db
        .query("groupMembers")
        .withIndex("by_userId", (q) => q.eq("userId", targetId))
        .first());
    if (
      target.workspaceId ||
      hasData ||
      target._creationTime <= link._creationTime
    ) {
      // Existing accounts, including empty ones, keep their own workspace.
      await ctx.db.patch(link._id, {
        usedAt: Date.now(),
        completedTargetId: targetId,
      });
      return null;
    }
    await ctx.db.patch(targetId, { workspaceId: link.sourceUserId });
    await ctx.db.patch(link._id, {
      usedAt: Date.now(),
      completedTargetId: targetId,
    });
    // Revoke anonymous credentials after the authenticated handover.
    const source = await ctx.db.get(link.sourceUserId);
    if (source?.isAnonymous) {
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", link.sourceUserId))
        .collect();
      for (const session of sessions) {
        await ctx.db.delete(session._id);
      }
    }
    return null;
  },
});

const assertLinkSourceActive = async (ctx: QueryCtx, id: Id<"users">) => {
  const user = await ctx.db.get(id);
  if (!user || user.deletingAt !== undefined) {
    throw new ConvexError("Account is being deleted");
  }
};
