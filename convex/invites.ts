import { ConvexError, v } from "convex/values";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

const MAX_DISPLAY_NAME_LENGTH = 40;

const normalizeDisplayName = (displayName: string) => {
  const trimmedDisplayName = displayName.trim();

  if (!trimmedDisplayName) {
    throw new ConvexError("Display name is required");
  }

  if (trimmedDisplayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ConvexError("Display name is too long");
  }

  return trimmedDisplayName;
};

const getGroupByInviteCode = async (
  ctx: QueryCtx | MutationCtx,
  inviteCode: string
) => {
  const group = await ctx.db
    .query("groups")
    .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
    .unique();

  if (!group) {
    return null;
  }

  return group;
};

export const preview = query({
  args: { inviteCode: v.string(), jazzUserId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const group = await getGroupByInviteCode(ctx, args.inviteCode.trim());

    if (!group) {
      return null;
    }

    const jazzUserId = args.jazzUserId;
    const membership = jazzUserId
      ? await ctx.db
          .query("groupMembers")
          .withIndex("by_groupId_jazzUserId", (q) =>
            q.eq("groupId", group._id).eq("jazzUserId", jazzUserId)
          )
          .unique()
      : null;

    return {
      groupId: group._id,
      groupName: group.name,
      isMember: Boolean(membership),
    };
  },
});

export const join = mutation({
  args: {
    displayName: v.string(),
    inviteCode: v.string(),
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const group = await getGroupByInviteCode(ctx, args.inviteCode.trim());

    if (!group) {
      throw new ConvexError("Invalid invite code");
    }

    const displayName = normalizeDisplayName(args.displayName);
    const existingMembership = await ctx.db
      .query("groupMembers")
      .withIndex("by_groupId_jazzUserId", (q) =>
        q.eq("groupId", group._id).eq("jazzUserId", args.jazzUserId)
      )
      .unique();

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, { displayName });
    } else {
      await ctx.db.insert("groupMembers", {
        displayName,
        groupId: group._id,
        jazzUserId: args.jazzUserId,
        joinedAt: Date.now(),
      });
    }

    return {
      groupId: group._id,
      groupName: group.name,
    };
  },
});
