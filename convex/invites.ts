import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
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

const insertGroupChatEvent = async (
  ctx: MutationCtx,
  event: {
    actorDisplayNameSnapshot: string;
    actorJazzUserId: string;
    body: string;
    createdAt: number;
    groupId: Id<"groups">;
    kind: Doc<"chatEvents">["kind"];
    nextValue?: string;
    previousValue?: string;
    targetDisplayNameSnapshot?: string;
    targetJazzUserId?: string;
  }
) => {
  await ctx.db.insert("chatEvents", event);
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
      groupEmoji: group.emoji,
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
    const now = Date.now();

    if (existingMembership) {
      if (displayName !== existingMembership.displayName) {
        await ctx.db.patch(existingMembership._id, { displayName });
        await insertGroupChatEvent(ctx, {
          actorDisplayNameSnapshot: displayName,
          actorJazzUserId: args.jazzUserId,
          body: `${existingMembership.displayName}さんが名前を「${existingMembership.displayName}」から「${displayName}」に変更しました`,
          createdAt: now,
          groupId: group._id,
          kind: "display_name_updated",
          nextValue: displayName,
          previousValue: existingMembership.displayName,
          targetDisplayNameSnapshot: displayName,
          targetJazzUserId: args.jazzUserId,
        });
      }
    } else {
      await ctx.db.insert("groupMembers", {
        displayName,
        groupId: group._id,
        jazzUserId: args.jazzUserId,
        joinedAt: now,
      });
      await insertGroupChatEvent(ctx, {
        actorDisplayNameSnapshot: displayName,
        actorJazzUserId: args.jazzUserId,
        body: `${displayName}さんがグループに参加しました`,
        createdAt: now,
        groupId: group._id,
        kind: "member_joined",
      });
    }

    return {
      groupEmoji: group.emoji,
      groupId: group._id,
      groupName: group.name,
    };
  },
});
