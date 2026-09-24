import { ConvexError } from "convex/values";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";

const INVITE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const INVITE_CODE_LENGTH = 8;
const MAX_CREATE_INVITE_CODE_ATTEMPTS = 8;
const TRAILING_SLASH_REGEX = /\/$/;

const getInviteBaseUrl = () => {
  const inviteBaseUrl = process.env.EXPO_PUBLIC_INVITE_BASE_URL?.trim();

  if (!inviteBaseUrl) {
    throw new ConvexError("EXPO_PUBLIC_INVITE_BASE_URL is required");
  }

  return inviteBaseUrl.replace(TRAILING_SLASH_REGEX, "");
};

export const buildInviteUrl = (inviteCode: string) =>
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

export const getGroupByInviteCode = async (
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

export const createUniqueInviteCode = async (
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
