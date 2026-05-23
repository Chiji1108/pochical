import { ConvexError, v } from "convex/values";
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
  args: { inviteCode: v.string(), instantUserId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const group = await getGroupByInviteCode(ctx, args.inviteCode.trim());

    if (!group) {
      return null;
    }

    const instantUserId = args.instantUserId;
    const membership = instantUserId
      ? await getMembership(ctx, group._id, instantUserId)
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
    instantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const group = await getGroupByInviteCode(ctx, args.inviteCode.trim());

    if (!group) {
      throw new ConvexError("Invalid invite code");
    }

    const displayName = normalizeDisplayName(args.displayName);
    const existingMembership = await getMembership(
      ctx,
      group._id,
      args.instantUserId
    );
    const now = Date.now();

    if (existingMembership) {
      await ensureOwnMessagesIgnored(ctx, args.instantUserId);

      if (displayName !== existingMembership.displayName) {
        await ctx.db.patch(existingMembership._id, { displayName });
        await insertGroupEvent(ctx, {
          actorDisplayNameSnapshot: displayName,
          actorInstantUserId: args.instantUserId,
          body: `${existingMembership.displayName}さんが名前を「${existingMembership.displayName}」から「${displayName}」に変更しました`,
          createdAt: now,
          groupId: group._id,
          kind: "display_name_updated",
          nextValue: displayName,
          previousValue: existingMembership.displayName,
          targetDisplayNameSnapshot: displayName,
          targetInstantUserId: args.instantUserId,
        });
      }
    } else {
      await ctx.db.insert("groupMembers", {
        displayName,
        groupId: group._id,
        instantUserId: args.instantUserId,
        joinedAt: now,
      });
      await markThreadsReadUpTo(ctx, {
        instantUserId: args.instantUserId,
        threads: await listThreadsForGroup(ctx, group._id),
        timestamp: now,
      });
      await insertGroupEvent(ctx, {
        actorDisplayNameSnapshot: displayName,
        actorInstantUserId: args.instantUserId,
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
