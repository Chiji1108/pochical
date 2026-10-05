import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter, HandlerContext } from "@connectrpc/connect";
import { GROUP_MAX_MEMBERS, textLimits } from "@pochical/design/limits";
import { env } from "cloudflare:workers";

import {
  CreateGroupResponseSchema,
  GetInviteLinkResponseSchema,
  GetInviteResponseSchema,
  GroupService,
  JoinGroupResponseSchema,
  RemakeInviteLinkResponseSchema,
} from "./gen/pochical/v1/group_pb";
import { isId } from "./ids";
import {
  issueInviteCode,
  liveInviteCode,
  noGroupOfCode,
  requireGroupOfCode,
} from "./invite-codes";
import { overLimit } from "./rate-limits";
import { requireUser } from "./session";
import { requireEmoji, requireText } from "./text-limits";

const displayNameOf = (text: string): string =>
  requireText(text, textLimits.personName, "display_name");

/** The caller, when they are in the group; PERMISSION_DENIED otherwise. */
const requireMember = async (
  context: HandlerContext,
  groupId: string
): Promise<void> => {
  const user = await requireUser(context);
  // The user's own DO, so an id that is not theirs wakes no Group DO.
  if (!(await env.USERS.getByName(user.id).isMember(groupId))) {
    throw new ConnectError("Not a member of this group", Code.PermissionDenied);
  }
};

export const registerGroupService = (router: ConnectRouter): void => {
  router.service(GroupService, {
    createGroup: async (request, context) => {
      const user = await requireUser(context);
      const name = requireText(request.name, textLimits.groupName, "name");
      const emoji = requireEmoji(request.emoji);
      const displayName = displayNameOf(request.displayName);
      if (!isId(request.requestId)) {
        throw new ConnectError("Malformed request_id", Code.InvalidArgument);
      }

      // Each step can be repeated, so a retry with the same request id
      // finishes what a failed try left and makes no second group. Only a
      // new request counts against the limit on groups made.
      const users = env.USERS.getByName(user.id);
      const isRetry = (await users.groupOf(request.requestId)) !== null;
      if (!isRetry && (await overLimit(env.GROUP_CREATE_LIMIT, user.id))) {
        throw new ConnectError(
          "Too many groups made just now",
          Code.ResourceExhausted
        );
      }
      const groupId = await users.groupIdFor(request.requestId);
      await env.GROUPS.getByName(groupId).create(
        { emoji, name },
        { displayName, userId: user.id }
      );
      await users.addMembership(groupId, { emoji, name });
      const inviteCode = await liveInviteCode(env.DB, groupId);
      return create(CreateGroupResponseSchema, { groupId, inviteCode });
    },

    getInvite: async ({ inviteCode }, context) => {
      const user = await requireUser(context);
      const groupId = await requireGroupOfCode(env.DB, inviteCode);
      const group = env.GROUPS.getByName(groupId);
      const [profile, memberList, alreadyMember] = await Promise.all([
        group.getProfile(),
        group.memberList(),
        group.isMember(user.id),
      ]);
      if (profile === null) {
        throw noGroupOfCode();
      }
      return create(GetInviteResponseSchema, {
        alreadyMember,
        full: !alreadyMember && memberList.length >= GROUP_MAX_MEMBERS,
        groupEmoji: profile.emoji ?? "",
        groupId,
        groupName: profile.name,
        members: memberList,
      });
    },

    getInviteLink: async ({ groupId }, context) => {
      await requireMember(context, groupId);
      const inviteCode = await liveInviteCode(env.DB, groupId);
      return create(GetInviteLinkResponseSchema, { inviteCode });
    },

    joinGroup: async ({ inviteCode, displayName }, context) => {
      const user = await requireUser(context);
      const shownAs = displayNameOf(displayName);
      const groupId = await requireGroupOfCode(env.DB, inviteCode);
      // The Group DO decides; the user's DO then keeps its copy. Both are
      // idempotent, so a retry after a failure in between completes it.
      const group = env.GROUPS.getByName(groupId);
      const result = await group.addMember({
        displayName: shownAs,
        userId: user.id,
      });
      if (result === "full") {
        throw new ConnectError(
          `The group has its most members (${GROUP_MAX_MEMBERS})`,
          Code.ResourceExhausted
        );
      }
      const profile = await group.getProfile();
      if (profile === null) {
        throw noGroupOfCode();
      }
      await env.USERS.getByName(user.id).addMembership(groupId, profile);
      return create(JoinGroupResponseSchema, {
        alreadyMember: result === "already",
        groupId,
      });
    },

    remakeInviteLink: async ({ groupId }, context) => {
      await requireMember(context, groupId);
      const inviteCode = await issueInviteCode(env.DB, groupId);
      return create(RemakeInviteLinkResponseSchema, { inviteCode });
    },
  });
};
