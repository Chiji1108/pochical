import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

const providerValidator = v.union(v.literal("apple"), v.literal("google"));
const NONCE = /^[a-f0-9]{64}$/;

export const prepare = mutation({
  args: { provider: providerValidator, nonce: v.string() },
  returns: v.id("nativeAuthChallenges"),
  handler: async (ctx, { provider, nonce }) => {
    if (!((await getAuthUserId(ctx)) && NONCE.test(nonce))) {
      throw new ConvexError("Invalid authentication request");
    }
    const expiresAt = Date.now() + 5 * 60_000;
    const id = await ctx.db.insert("nativeAuthChallenges", {
      provider,
      nonce,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.nativeAuth.remove, { id });
    return id;
  },
});

export const consume = internalMutation({
  args: {
    id: v.id("nativeAuthChallenges"),
    provider: providerValidator,
    nonce: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { id, provider, nonce }) => {
    const challenge = await ctx.db.get(id);
    if (
      !challenge ||
      challenge.expiresAt <= Date.now() ||
      challenge.provider !== provider ||
      challenge.nonce !== nonce
    ) {
      throw new ConvexError(
        "ログインの有効期限が切れました。もう一度お試しください。"
      );
    }
    await ctx.db.delete(id);
    return null;
  },
});

export const remove = internalMutation({
  args: { id: v.id("nativeAuthChallenges") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) {
      await ctx.db.delete(id);
    }
    return null;
  },
});
