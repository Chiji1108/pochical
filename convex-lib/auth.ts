import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../convex/_generated/server";

export const getCurrentUserId = async (ctx: Pick<QueryCtx, "auth" | "db">) => {
  const id = await getAuthUserId(ctx);
  if (!id) {
    return null;
  }
  const user = await ctx.db.get(id);
  return user ? (user.workspaceId ?? id) : null;
};

export const requireUserId = async (ctx: Pick<QueryCtx, "auth" | "db">) => {
  const id = await getCurrentUserId(ctx);
  if (!id) {
    throw new ConvexError("Authentication required");
  }
  return id;
};
