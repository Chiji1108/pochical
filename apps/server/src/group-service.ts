import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter, HandlerContext } from "@connectrpc/connect";
import { INVITE_CODE } from "@pochical/design/invite";
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
import { codeOfGroup, groupOfCode, issueInviteCode } from "./invite-codes";
import { requireEmoji, requireText } from "./text-limits";
import { requireUser } from "./user-service";

const displayNameOf = (text: string): string =>
  requireText(text, textLimits.personName, "display_name");

/** The group a live code opens; INVALID_ARGUMENT or NOT_FOUND otherwise. */
const requireGroupOfCode = async (inviteCode: string): Promise<string> => {
  if (!INVITE_CODE.test(inviteCode)) {
    throw new ConnectError("Malformed invite code", Code.InvalidArgument);
  }
  const groupId = await groupOfCode(env.DB, inviteCode);
  if (groupId === null) {
    throw new ConnectError("No group uses this invite code", Code.NotFound);
  }
  return groupId;
};

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

      const groupId = crypto.randomUUID();
      await env.GROUPS.getByName(groupId).create(
        { emoji, name },
        { displayName, userId: user.id }
      );
      await env.USERS.getByName(user.id).addMembership(groupId);
      const inviteCode = await issueInviteCode(env.DB, groupId);
      return create(CreateGroupResponseSchema, { groupId, inviteCode });
    },

    getInvite: async ({ inviteCode }, context) => {
      const user = await requireUser(context);
      const groupId = await requireGroupOfCode(inviteCode);
      const group = env.GROUPS.getByName(groupId);
      const [profile, memberList, alreadyMember] = await Promise.all([
        group.getProfile(),
        group.memberList(),
        group.isMember(user.id),
      ]);
      if (profile === null) {
        throw new ConnectError("No group uses this invite code", Code.NotFound);
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
      const inviteCode =
        (await codeOfGroup(env.DB, groupId)) ??
        (await issueInviteCode(env.DB, groupId));
      return create(GetInviteLinkResponseSchema, { inviteCode });
    },

    joinGroup: async ({ inviteCode, displayName }, context) => {
      const user = await requireUser(context);
      const shownAs = displayNameOf(displayName);
      const groupId = await requireGroupOfCode(inviteCode);
      // The Group DO decides; the user's DO then keeps its copy. Both are
      // idempotent, so a retry after a failure in between completes it.
      const result = await env.GROUPS.getByName(groupId).addMember({
        displayName: shownAs,
        userId: user.id,
      });
      if (result === "full") {
        throw new ConnectError(
          `The group has its most members (${GROUP_MAX_MEMBERS})`,
          Code.ResourceExhausted
        );
      }
      await env.USERS.getByName(user.id).addMembership(groupId);
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
