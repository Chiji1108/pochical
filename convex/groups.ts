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
const TRAILING_SLASH_REGEX = /\/$/;

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
  groupId: Id<"groups">
) => {
  for (
    let attempt = 0;
    attempt < MAX_CREATE_INVITE_CODE_ATTEMPTS;
    attempt += 1
  ) {
    const inviteCode = createInviteCode(`${groupId}:${attempt}`);
    const existingGroup = await ctx.db
      .query("groups")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique();

    if (!existingGroup || existingGroup._id === groupId) {
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

type GroupMemberSummary = Pick<
  Doc<"groupMembers">,
  "_id" | "displayName" | "jazzUserId"
>;

type GroupSummary = Pick<Doc<"groups">, "_id" | "name"> & {
  inviteUrl: string;
  memberCount: number;
  members: GroupMemberSummary[];
  ownDisplayName: string;
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
      groups.push({
        _id: group._id,
        inviteUrl: buildInviteUrl(group.inviteCode),
        memberCount: members.length,
        members: members.map((member) => ({
          _id: member._id,
          displayName: member.displayName,
          jazzUserId: member.jazzUserId,
        })),
        name: group.name,
        ownDisplayName: membership.displayName,
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

    return {
      _id: group._id,
      inviteUrl: buildInviteUrl(group.inviteCode),
      members: members.map((member) => ({
        _id: member._id,
        displayName: member.displayName,
        jazzUserId: member.jazzUserId,
      })),
      ownDisplayName: membership.displayName,
      name: group.name,
    };
  },
});

export const create = mutation({
  args: {
    displayName: v.string(),
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
    const groupId = await ctx.db.insert("groups", {
      createdAt: now,
      createdBy: args.jazzUserId,
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

    await ctx.db.patch(group._id, {
      name: normalizeRequiredText(
        args.name,
        "Group name",
        MAX_GROUP_NAME_LENGTH
      ),
      updatedAt: Date.now(),
    });
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

    await ctx.db.patch(membership._id, {
      displayName: normalizeRequiredText(
        args.displayName,
        "Display name",
        MAX_DISPLAY_NAME_LENGTH
      ),
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

    await ctx.db.delete(membership._id);

    const remainingMembers = await listMembers(ctx, args.groupId);
    if (remainingMembers.length === 0) {
      await ctx.db.delete(args.groupId);
    }
  },
});
