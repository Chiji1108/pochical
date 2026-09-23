import { ConvexError, v } from "convex/values";
import { getCurrentUserId, requireUserId } from "../convex-lib/auth";
import { listThreadsForGroup } from "../convex-lib/chatThreads";
import { getMembership } from "../convex-lib/groupMembers";
import { getGroupByInviteCode } from "../convex-lib/inviteCodes";
import {
  ensureOwnMessagesIgnored,
  markThreadsReadUpTo,
} from "../convex-lib/unreads";
import { normalizeDisplayName } from "../convex-lib/validators";
import { mutation, query } from "./_generated/server";
import { insertGroupEvent } from "./groupEvents";

export const preview = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    const group = await getGroupByInviteCode(ctx, args.inviteCode.trim());

    if (!group) {
      return null;
    }

    const membership = userId
      ? await getMembership(ctx, group._id, userId)
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const group = await getGroupByInviteCode(ctx, args.inviteCode.trim());

    if (!group) {
      throw new ConvexError("Invalid invite code");
    }

    const displayName = normalizeDisplayName(args.displayName);
    const existingMembership = await getMembership(ctx, group._id, userId);
    const now = Date.now();

    if (existingMembership) {
      await ensureOwnMessagesIgnored(ctx, userId);

      if (displayName !== existingMembership.displayName) {
        await ctx.db.patch(existingMembership._id, { displayName });
        await insertGroupEvent(ctx, {
          actorDisplayNameSnapshot: displayName,
          actorUserId: userId,
          body: `${existingMembership.displayName}さんが名前を「${existingMembership.displayName}」から「${displayName}」に変更しました`,
          createdAt: now,
          groupId: group._id,
          kind: "display_name_updated",
          nextValue: displayName,
          previousValue: existingMembership.displayName,
          targetDisplayNameSnapshot: displayName,
          targetUserId: userId,
        });
      }
    } else {
      await ctx.db.insert("groupMembers", {
        displayName,
        groupId: group._id,
        userId,
        joinedAt: now,
      });
      await markThreadsReadUpTo(ctx, {
        userId,
        threads: await listThreadsForGroup(ctx, group._id),
        timestamp: now,
      });
      await insertGroupEvent(ctx, {
        actorDisplayNameSnapshot: displayName,
        actorUserId: userId,
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
