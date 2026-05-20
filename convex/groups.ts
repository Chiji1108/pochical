import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";

const INVITE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const INVITE_CODE_LENGTH = 8;
const MAX_CREATE_INVITE_CODE_ATTEMPTS = 8;
const MAX_GROUP_NAME_LENGTH = 80;
const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_GROUP_EMOJI_LENGTH = 16;
const TRAILING_SLASH_REGEX = /\/$/;
const GROUP_THREAD_PAIR_KEY = "group";

const normalizeRequiredText = (
  value: string,
  label: string,
  maxLength: number
) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new ConvexError(`${label} is required`);
  }

  if (trimmedValue.length > maxLength) {
    throw new ConvexError(`${label} is too long`);
  }

  return trimmedValue;
};

const normalizeGroupEmoji = (emoji: string) =>
  normalizeRequiredText(emoji, "Group emoji", MAX_GROUP_EMOJI_LENGTH);

const getInviteBaseUrl = () => {
  const inviteBaseUrl = process.env.EXPO_PUBLIC_INVITE_BASE_URL?.trim();

  if (!inviteBaseUrl) {
    throw new ConvexError("EXPO_PUBLIC_INVITE_BASE_URL is required");
  }

  return inviteBaseUrl.replace(TRAILING_SLASH_REGEX, "");
};

const buildInviteUrl = (inviteCode: string) =>
  `${getInviteBaseUrl()}/invite/${encodeURIComponent(inviteCode)}`;

const createInviteCode = (seed: string) => {
  let inviteCode = "";
  let hash = 1;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 48_271 + seed.charCodeAt(index)) % 2_147_483_647;
  }

  for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
    hash = (hash * 48_271 + seed.length + index + 1) % 2_147_483_647;
    inviteCode += INVITE_ALPHABET.charAt(hash % INVITE_ALPHABET.length);
  }

  return inviteCode;
};

const createUniqueInviteCode = async (
  ctx: MutationCtx,
  groupId: Id<"groups">,
  seedNonce = ""
) => {
  for (
    let attempt = 0;
    attempt < MAX_CREATE_INVITE_CODE_ATTEMPTS;
    attempt += 1
  ) {
    const inviteCode = createInviteCode(`${groupId}:${seedNonce}:${attempt}`);
    const existingGroup = await ctx.db
      .query("groups")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique();

    if (!existingGroup) {
      return inviteCode;
    }
  }

  throw new ConvexError("Failed to create unique invite code");
};

const getGroup = async (ctx: QueryCtx | MutationCtx, groupId: Id<"groups">) => {
  const group = await ctx.db.get(groupId);

  if (!group) {
    return null;
  }

  return group;
};

const getMembership = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">,
  jazzUserId: string
) =>
  ctx.db
    .query("groupMembers")
    .withIndex("by_groupId_jazzUserId", (q) =>
      q.eq("groupId", groupId).eq("jazzUserId", jazzUserId)
    )
    .unique();

const listMembers = async (
  ctx: QueryCtx | MutationCtx,
  groupId: Id<"groups">
) => {
  const members = await ctx.db
    .query("groupMembers")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .collect();

  return members.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ja")
  );
};

const createDirectPairKey = (jazzUserId: string, targetJazzUserId: string) =>
  JSON.stringify([jazzUserId, targetJazzUserId].sort());

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

const getChatThread = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  kind: "group" | "direct",
  pairKey: string
) =>
  ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_kind_pairKey", (q) =>
      q.eq("groupId", groupId).eq("kind", kind).eq("pairKey", pairKey)
    )
    .unique();

const getThreadUnreadCount = async (
  ctx: QueryCtx,
  thread: Doc<"chatThreads"> | null,
  jazzUserId: string
) => {
  if (!thread?.lastMessageCreatedAt) {
    return 0;
  }

  const read = await ctx.db
    .query("chatReads")
    .withIndex("by_threadId_jazzUserId", (q) =>
      q.eq("threadId", thread._id).eq("jazzUserId", jazzUserId)
    )
    .unique();
  const lastReadMessageCreatedAt = read?.lastReadMessageCreatedAt ?? 0;
  const unreadMessages = await ctx.db
    .query("chatMessages")
    .withIndex("by_threadId_createdAt", (q) =>
      q.eq("threadId", thread._id).gt("createdAt", lastReadMessageCreatedAt)
    )
    .collect();

  return unreadMessages.filter(
    (message) => message.authorJazzUserId !== jazzUserId
  ).length;
};

const getGroupChatOverview = async (
  ctx: QueryCtx,
  groupId: Id<"groups">,
  jazzUserId: string,
  members: Doc<"groupMembers">[]
) => {
  const groupThread = await getChatThread(
    ctx,
    groupId,
    "group",
    GROUP_THREAD_PAIR_KEY
  );
  const groupUnreadCount = await getThreadUnreadCount(
    ctx,
    groupThread,
    jazzUserId
  );
  let directUnreadCount = 0;

  for (const member of members) {
    if (member.jazzUserId === jazzUserId) {
      continue;
    }

    const directThread = await getChatThread(
      ctx,
      groupId,
      "direct",
      createDirectPairKey(jazzUserId, member.jazzUserId)
    );
    directUnreadCount += await getThreadUnreadCount(
      ctx,
      directThread,
      jazzUserId
    );
  }

  const threads = await ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_updatedAt", (q) => q.eq("groupId", groupId))
    .collect();
  const latestThread = threads
    .filter((thread) => thread.lastMessageCreatedAt)
    .sort(
      (a, b) => (b.lastMessageCreatedAt ?? 0) - (a.lastMessageCreatedAt ?? 0)
    )[0];

  return {
    groupUnreadCount,
    lastMessagePreview: latestThread?.lastMessagePreview,
    unreadCount: groupUnreadCount + directUnreadCount,
  };
};

const deleteGroupChatEvents = async (
  ctx: MutationCtx,
  groupId: Id<"groups">
) => {
  const events = await ctx.db
    .query("chatEvents")
    .withIndex("by_groupId_createdAt", (q) => q.eq("groupId", groupId))
    .collect();

  for (const event of events) {
    await ctx.db.delete(event._id);
  }
};

const deleteGroupChatData = async (ctx: MutationCtx, groupId: Id<"groups">) => {
  await deleteGroupChatEvents(ctx, groupId);

  const threads = await ctx.db
    .query("chatThreads")
    .withIndex("by_groupId_updatedAt", (q) => q.eq("groupId", groupId))
    .collect();

  for (const thread of threads) {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_threadId_createdAt", (q) => q.eq("threadId", thread._id))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const reads = await ctx.db
      .query("chatReads")
      .filter((q) => q.eq(q.field("threadId"), thread._id))
      .collect();

    for (const read of reads) {
      await ctx.db.delete(read._id);
    }

    await ctx.db.delete(thread._id);
  }
};

type GroupMemberSummary = Pick<
  Doc<"groupMembers">,
  "_id" | "displayName" | "jazzUserId"
> & {
  lastMessageCreatedAt?: number;
  lastMessagePreview?: string;
  unreadCount: number;
};

type GroupSummary = Pick<Doc<"groups">, "_id" | "name"> & {
  emoji: string;
  groupLastMessageCreatedAt?: number;
  groupLastMessagePreview?: string;
  groupUnreadCount: number;
  inviteUrl: string;
  lastMessagePreview?: string;
  memberCount: number;
  members: GroupMemberSummary[];
  ownDisplayName: string;
  unreadCount: number;
};

export const listForCurrentUser = query({
  args: { jazzUserId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_jazzUserId", (q) => q.eq("jazzUserId", args.jazzUserId))
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
        args.jazzUserId,
        members
      );
      const groupThread = await getChatThread(
        ctx,
        group._id,
        "group",
        GROUP_THREAD_PAIR_KEY
      );
      groups.push({
        _id: group._id,
        emoji: group.emoji,
        groupLastMessageCreatedAt: groupThread?.lastMessageCreatedAt,
        groupLastMessagePreview: groupThread?.lastMessagePreview,
        groupUnreadCount: chatOverview.groupUnreadCount,
        inviteUrl: buildInviteUrl(group.inviteCode),
        lastMessagePreview: chatOverview.lastMessagePreview,
        memberCount: members.length,
        members: await Promise.all(
          members.map(async (member) => {
            const directThread =
              member.jazzUserId === args.jazzUserId
                ? null
                : await getChatThread(
                    ctx,
                    group._id,
                    "direct",
                    createDirectPairKey(args.jazzUserId, member.jazzUserId)
                  );
            const unreadCount =
              member.jazzUserId === args.jazzUserId
                ? 0
                : await getThreadUnreadCount(
                    ctx,
                    directThread,
                    args.jazzUserId
                  );

            return {
              _id: member._id,
              displayName: member.displayName,
              jazzUserId: member.jazzUserId,
              lastMessageCreatedAt: directThread?.lastMessageCreatedAt,
              lastMessagePreview: directThread?.lastMessagePreview,
              unreadCount,
            };
          })
        ),
        name: group.name,
        ownDisplayName: membership.displayName,
        unreadCount: chatOverview.unreadCount,
      });
    }

    return groups.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  },
});

export const getDetail = query({
  args: { groupId: v.id("groups"), jazzUserId: v.string() },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.jazzUserId),
    ]);

    if (!(group && membership)) {
      return null;
    }

    const members = await listMembers(ctx, group._id);
    const chatOverview = await getGroupChatOverview(
      ctx,
      group._id,
      args.jazzUserId,
      members
    );
    const groupThread = await getChatThread(
      ctx,
      group._id,
      "group",
      GROUP_THREAD_PAIR_KEY
    );

    return {
      _id: group._id,
      emoji: group.emoji,
      groupLastMessageCreatedAt: groupThread?.lastMessageCreatedAt,
      groupLastMessagePreview: groupThread?.lastMessagePreview,
      groupUnreadCount: chatOverview.groupUnreadCount,
      inviteUrl: buildInviteUrl(group.inviteCode),
      lastMessagePreview: chatOverview.lastMessagePreview,
      members: await Promise.all(
        members.map(async (member) => {
          const directThread =
            member.jazzUserId === args.jazzUserId
              ? null
              : await getChatThread(
                  ctx,
                  group._id,
                  "direct",
                  createDirectPairKey(args.jazzUserId, member.jazzUserId)
                );
          const unreadCount =
            member.jazzUserId === args.jazzUserId
              ? 0
              : await getThreadUnreadCount(ctx, directThread, args.jazzUserId);

          return {
            _id: member._id,
            displayName: member.displayName,
            jazzUserId: member.jazzUserId,
            lastMessageCreatedAt: directThread?.lastMessageCreatedAt,
            lastMessagePreview: directThread?.lastMessagePreview,
            unreadCount,
          };
        })
      ),
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
    jazzUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = normalizeRequiredText(
      args.name,
      "Group name",
      MAX_GROUP_NAME_LENGTH
    );
    const displayName = normalizeRequiredText(
      args.displayName,
      "Display name",
      MAX_DISPLAY_NAME_LENGTH
    );
    const emoji = normalizeGroupEmoji(args.emoji);
    const groupId = await ctx.db.insert("groups", {
      createdAt: now,
      createdBy: args.jazzUserId,
      emoji,
      inviteCode: `pending:${now}:${args.jazzUserId}`,
      name,
      updatedAt: now,
    });
    await ctx.db.patch(groupId, {
      inviteCode: await createUniqueInviteCode(ctx, groupId),
    });

    await ctx.db.insert("groupMembers", {
      displayName,
      groupId,
      jazzUserId: args.jazzUserId,
      joinedAt: now,
    });
    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: displayName,
      actorJazzUserId: args.jazzUserId,
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
    jazzUserId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.jazzUserId),
    ]);

    if (!(group && membership)) {
      throw new ConvexError("Group not found");
    }

    const name = normalizeRequiredText(
      args.name,
      "Group name",
      MAX_GROUP_NAME_LENGTH
    );
    if (name === group.name) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(group._id, {
      name,
      updatedAt: now,
    });
    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorJazzUserId: args.jazzUserId,
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
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.jazzUserId),
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
    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorJazzUserId: args.jazzUserId,
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
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const [group, membership] = await Promise.all([
      getGroup(ctx, args.groupId),
      getMembership(ctx, args.groupId, args.jazzUserId),
    ]);

    if (!(group && membership)) {
      throw new ConvexError("Group not found");
    }

    const now = Date.now();
    const inviteCode = await createUniqueInviteCode(
      ctx,
      group._id,
      `${now}:${args.jazzUserId}:${group.inviteCode}`
    );

    await ctx.db.patch(group._id, {
      inviteCode,
      updatedAt: now,
    });
    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorJazzUserId: args.jazzUserId,
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
    jazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.groupId, args.jazzUserId);

    if (!membership) {
      throw new ConvexError("Group not found");
    }

    const displayName = normalizeRequiredText(
      args.displayName,
      "Display name",
      MAX_DISPLAY_NAME_LENGTH
    );
    if (displayName === membership.displayName) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(membership._id, {
      displayName,
    });
    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: displayName,
      actorJazzUserId: args.jazzUserId,
      body: `${membership.displayName}さんが名前を「${membership.displayName}」から「${displayName}」に変更しました`,
      createdAt: now,
      groupId: args.groupId,
      kind: "display_name_updated",
      nextValue: displayName,
      previousValue: membership.displayName,
      targetDisplayNameSnapshot: displayName,
      targetJazzUserId: args.jazzUserId,
    });
  },
});

export const leave = mutation({
  args: { groupId: v.id("groups"), jazzUserId: v.string() },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.groupId, args.jazzUserId);

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

    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: membership.displayName,
      actorJazzUserId: args.jazzUserId,
      body: `${membership.displayName}さんがグループから脱退しました`,
      createdAt: now,
      groupId: args.groupId,
      kind: "member_left",
    });
  },
});

export const leaveAllForCurrentUser = mutation({
  args: { jazzUserId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_jazzUserId", (q) => q.eq("jazzUserId", args.jazzUserId))
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

      await insertGroupChatEvent(ctx, {
        actorDisplayNameSnapshot: membership.displayName,
        actorJazzUserId: args.jazzUserId,
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
    jazzUserId: v.string(),
    targetJazzUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const actorMembership = await getMembership(
      ctx,
      args.groupId,
      args.jazzUserId
    );

    if (!actorMembership) {
      throw new ConvexError("Group not found");
    }

    const targetMembership = await getMembership(
      ctx,
      args.groupId,
      args.targetJazzUserId
    );

    if (!targetMembership) {
      return;
    }

    const now = Date.now();
    await insertGroupChatEvent(ctx, {
      actorDisplayNameSnapshot: actorMembership.displayName,
      actorJazzUserId: args.jazzUserId,
      body: `${actorMembership.displayName}さんが${targetMembership.displayName}さんをグループから削除しました`,
      createdAt: now,
      groupId: args.groupId,
      kind: "member_removed",
      targetDisplayNameSnapshot: targetMembership.displayName,
      targetJazzUserId: args.targetJazzUserId,
    });
    await ctx.db.delete(targetMembership._id);

    const remainingMembers = await listMembers(ctx, args.groupId);
    if (remainingMembers.length === 0) {
      await deleteGroupChatData(ctx, args.groupId);
      await ctx.db.delete(args.groupId);
    }
  },
});
