import { ConvexError } from "convex/values";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";

export type DatabaseCtx = QueryCtx | MutationCtx;

export const getGroup = async (ctx: DatabaseCtx, groupId: Id<"groups">) => {
  const group = await ctx.db.get(groupId);

  if (!group) {
    return null;
  }

  return group;
};

export const getMembership = async (
  ctx: DatabaseCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) =>
  ctx.db
    .query("groupMembers")
    .withIndex("by_groupId_jazzUserId", (q) =>
      q.eq("groupId", groupId).eq("jazzUserId", jazzUserId)
    )
    .unique();

export const listMembers = async (ctx: DatabaseCtx, groupId: Id<"groups">) => {
  const members = await ctx.db
    .query("groupMembers")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();

  return members.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ja")
  );
};

export const requireMembership = async (
  ctx: DatabaseCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) => {
  const [group, membership] = await Promise.all([
    getGroup(ctx, groupId),
    getMembership(ctx, groupId, jazzUserId),
  ]);

  if (!(group && membership)) {
    throw new ConvexError("Group not found");
  }

  return { group, membership };
};

export const requireDirectMembership = async (
  ctx: DatabaseCtx,
  groupId: Id<"groups">,
  jazzUserId: string,
  targetJazzUserId: string
) => {
  const { group, membership } = await requireMembership(
    ctx,
    groupId,
    jazzUserId
  );
  const targetMembership = await getMembership(ctx, groupId, targetJazzUserId);

  if (!targetMembership) {
    throw new ConvexError("Member not found");
  }

  return { group, membership, targetMembership };
};
