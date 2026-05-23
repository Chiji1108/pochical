import { ConvexError, v } from "convex/values";
import { deleteGroupChatData } from "../convex-lib/chatCleanup";
import { createDirectPairKey } from "../convex-lib/chatThreads";
import { getGroupChatOverview } from "../convex-lib/groupChatOverview";
import {
  getGroup,
  getMembership,
  listMembers,
} from "../convex-lib/groupMembers";
import {
  buildInviteUrl,
  createUniqueInviteCode,
} from "../convex-lib/inviteCodes";
import { ensureOwnMessagesIgnored } from "../convex-lib/unreads";
import {
  normalizeDisplayName,
  normalizeGroupEmoji,
  normalizeGroupName,
} from "../convex-lib/validators";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { insertGroupEvent } from "./groupEvents";

type GroupSummary = Pick<Doc<"groups">, "_id" | "name"> & {
  emoji: string;
  inviteUrl: string;
  unreadCount: number;
};

export const listForCurrentUser = query({
  args: { instantUserId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_instantUserId", (q) =>
        q.eq("instantUserId", args.instantUserId)
      )
      .collect();
    const groups: GroupSummary[] = [];

    for (const membership of memberships) {
      const group = await getGroup(ctx, membership.groupId);

      if (!group) {
        continue;
      }

      const members = await listMembers(ctx, group._id);
      const chatOverview = await getGroupChatOverview(
        ctx,
        group._id,
        args.instantUserId,
        members
      );
      groups.push({
        _id: group._id,
        emoji: group.emoji,
        inviteUrl: buildInviteUrl(group.inviteCode),
        name: group.name,
        unreadCount: chatOverview.unreadCount,
      });
    }

    return groups.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  },
});

export const getDetail = query({
  args: { groupId: v.id("groups"), instantUserId: v.string() },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.instantUserId),
    ]);

    if (!(group && membership)) {
      return null;
    }

    const members = await listMembers(ctx, group._id);
    const chatOverview = await getGroupChatOverview(
      ctx,
      group._id,
      args.instantUserId,
      members
    );

    return {
      _id: group._id,
      emoji: group.emoji,
      groupLastMessageCreatedAt: chatOverview.groupLastMessageCreatedAt,
      groupLastMessagePreview: chatOverview.groupLastMessagePreview,
      groupUnreadCount: chatOverview.groupUnreadCount,
      inviteUrl: buildInviteUrl(group.inviteCode),
      lastMessagePreview: chatOverview.lastMessagePreview,
      members: members.map((member) => {
        const directThread =
          member.instantUserId === args.instantUserId
            ? null
            : (chatOverview.threadByPairKey.get(
                createDirectPairKey(args.instantUserId, member.instantUserId)
              ) ?? null);
        let unreadCount = 0;

        if (member.instantUserId !== args.instantUserId && directThread) {
          unreadCount =
            chatOverview.unreadCountsByThreadId.get(directThread._id) ?? 0;
        }

        return {
          _id: member._id,
          displayName: member.displayName,
          instantUserId: member.instantUserId,
          lastMessageCreatedAt: directThread?.lastMessageCreatedAt,
          lastMessagePreview: directThread?.lastMessagePreview,
          unreadCount,
        };
      }),
      ownDisplayName: membership.displayName,
      name: group.name,
      unreadCount: chatOverview.unreadCount,
    };
  },
});

export const create = mutation({
  args: {
    displayName: v.string(),
    emoji: v.string(),
    instantUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = normalizeGroupName(args.name);
    const displayName = normalizeDisplayName(args.displayName);
    const emoji = normalizeGroupEmoji(args.emoji);
    const groupId = await ctx.db.insert("groups", {
      createdAt: now,
      createdBy: args.instantUserId,
      emoji,
      inviteCode: `pending:${now}:${args.instantUserId}`,
      name,
      updatedAt: now,
    });
    await ctx.db.patch(groupId, {
      inviteCode: await createUniqueInviteCode(ctx, groupId),
    });

    await ctx.db.insert("groupMembers", {
      displayName,
      groupId,
      instantUserId: args.instantUserId,
      joinedAt: now,
    });
    await ensureOwnMessagesIgnored(ctx, args.instantUserId);
    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: displayName,
      actorInstantUserId: args.instantUserId,
      body: `${displayName}さんがグループに参加しました`,
      createdAt: now,
      groupId,
      kind: "member_joined",
    });

    return { groupId };
  },
});

export const updateName = mutation({
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.instantUserId),
    ]);

    if (!(group && membership)) {
      throw new ConvexError("Group not found");
    }

    const name = normalizeGroupName(args.name);
    if (name === group.name) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(group._id, {
      name,
      updatedAt: now,
    });
    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorInstantUserId: args.instantUserId,
      body: `${membership.displayName}さんがグループ名を「${group.name}」から「${name}」に変更しました`,
      createdAt: now,
      groupId: group._id,
      kind: "group_name_updated",
      nextValue: name,
      previousValue: group.name,
    });
  },
});

export const updateEmoji = mutation({
  args: {
    emoji: v.string(),
    groupId: v.id("groups"),
    instantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.instantUserId),
    ]);

    if (!(group && membership)) {
      throw new ConvexError("Group not found");
    }

    const emoji = normalizeGroupEmoji(args.emoji);
    if (emoji === group.emoji) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(group._id, {
      emoji,
      updatedAt: now,
    });
    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorInstantUserId: args.instantUserId,
      body: `${membership.displayName}さんがグループアイコンを「${group.emoji}」から「${emoji}」に変更しました`,
      createdAt: now,
      groupId: group._id,
      kind: "group_emoji_updated",
      nextValue: emoji,
      previousValue: group.emoji,
    });
  },
});

export const regenerateInviteCode = mutation({
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.instantUserId),
    ]);

    if (!(group && membership)) {
      throw new ConvexError("Group not found");
    }

    const now = Date.now();
    const inviteCode = await createUniqueInviteCode(
      ctx,
      group._id,
      `${now}:${args.instantUserId}:${group.inviteCode}`
    );

    await ctx.db.patch(group._id, {
      inviteCode,
      updatedAt: now,
    });
    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorInstantUserId: args.instantUserId,
      body: `${membership.displayName}さんが招待リンクを再発行しました`,
      createdAt: now,
      groupId: group._id,
      kind: "invite_code_regenerated",
    });

    return { inviteUrl: buildInviteUrl(inviteCode) };
  },
});

export const updateDisplayName = mutation({
  args: {
    displayName: v.string(),
    groupId: v.id("groups"),
    instantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(
      ctx,
      args.groupId,
      args.instantUserId
    );

    if (!membership) {
      throw new ConvexError("Group not found");
    }

    const displayName = normalizeDisplayName(args.displayName);
    if (displayName === membership.displayName) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(membership._id, {
      displayName,
    });
    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: displayName,
      actorInstantUserId: args.instantUserId,
      body: `${membership.displayName}さんが名前を「${membership.displayName}」から「${displayName}」に変更しました`,
      createdAt: now,
      groupId: args.groupId,
      kind: "display_name_updated",
      nextValue: displayName,
      previousValue: membership.displayName,
      targetDisplayNameSnapshot: displayName,
      targetInstantUserId: args.instantUserId,
    });
  },
});

export const leave = mutation({
  args: { groupId: v.id("groups"), instantUserId: v.string() },
  handler: async (ctx, args) => {
    const membership = await getMembership(
      ctx,
      args.groupId,
      args.instantUserId
    );

    if (!membership) {
      return;
    }

    const now = Date.now();
    await ctx.db.delete(membership._id);

    const remainingMembers = await listMembers(ctx, args.groupId);
    if (remainingMembers.length === 0) {
      await deleteGroupChatData(ctx, args.groupId);
      await ctx.db.delete(args.groupId);
      return;
    }

    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorInstantUserId: args.instantUserId,
      body: `${membership.displayName}さんがグループから脱退しました`,
      createdAt: now,
      groupId: args.groupId,
      kind: "member_left",
    });
  },
});

export const leaveAllForCurrentUser = mutation({
  args: { instantUserId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_instantUserId", (q) =>
        q.eq("instantUserId", args.instantUserId)
      )
      .collect();
    const now = Date.now();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);

      const remainingMembers = await listMembers(ctx, membership.groupId);
      if (remainingMembers.length === 0) {
        await deleteGroupChatData(ctx, membership.groupId);
        await ctx.db.delete(membership.groupId);
        continue;
      }

      await insertGroupEvent(ctx, {
        actorDisplayNameSnapshot: membership.displayName,
        actorInstantUserId: args.instantUserId,
        body: `${membership.displayName}さんがグループから脱退しました`,
        createdAt: now,
        groupId: membership.groupId,
        kind: "member_left",
      });
    }
  },
});

export const removeMember = mutation({
  args: {
    groupId: v.id("groups"),
    instantUserId: v.string(),
    targetInstantUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const actorMembership = await getMembership(
      ctx,
      args.groupId,
      args.instantUserId
    );

    if (!actorMembership) {
      throw new ConvexError("Group not found");
    }

    const targetMembership = await getMembership(
      ctx,
      args.groupId,
      args.targetInstantUserId
    );

    if (!targetMembership) {
      return;
    }

    const now = Date.now();
    await insertGroupEvent(ctx, {
      actorDisplayNameSnapshot: actorMembership.displayName,
      actorInstantUserId: args.instantUserId,
      body: `${actorMembership.displayName}さんが${targetMembership.displayName}さんをグループから削除しました`,
      createdAt: now,
      groupId: args.groupId,
      kind: "member_removed",
      targetDisplayNameSnapshot: targetMembership.displayName,
      targetInstantUserId: args.targetInstantUserId,
    });
    await ctx.db.delete(targetMembership._id);

    const remainingMembers = await listMembers(ctx, args.groupId);
    if (remainingMembers.length === 0) {
      await deleteGroupChatData(ctx, args.groupId);
      await ctx.db.delete(args.groupId);
    }
  },
});
