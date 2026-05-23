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
  instantUserId: string
) =>
  ctx.db
    .query("groupMembers")
    .withIndex("by_groupId_instantUserId", (q) =>
      q.eq("groupId", groupId).eq("instantUserId", instantUserId)
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
  instantUserId: string
) => {
  const [group, membership] = await Promise.all([
    getGroup(ctx, groupId),
    getMembership(ctx, groupId, instantUserId),
  ]);

  if (!(group && membership)) {
    throw new ConvexError("Group not found");
  }

  return { group, membership };
};

export const requireDirectMembership = async (
  ctx: DatabaseCtx,
  groupId: Id<"groups">,
  instantUserId: string,
  targetInstantUserId: string
) => {
  const { group, membership } = await requireMembership(
    ctx,
    groupId,
    instantUserId
  );
  const targetMembership = await getMembership(
    ctx,
    groupId,
    targetInstantUserId
  );

  if (!targetMembership) {
    throw new ConvexError("Member not found");
  }

  return { group, membership, targetMembership };
};
