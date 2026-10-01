import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter, HandlerContext } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import {
  CreateGroupResponseSchema,
  GetInviteLinkResponseSchema,
  GroupService,
  JoinGroupResponseSchema,
  RemakeInviteLinkResponseSchema,
} from "./gen/pochical/v1/group_pb";
import {
  codeOfGroup,
  groupOfCode,
  INVITE_CODE,
  issueInviteCode,
} from "./invite-codes";
import { requireEmoji, requireText, TEXT_LIMITS } from "./text-limits";
import { requireUser } from "./user-service";

const displayNameOf = (text: string): string =>
  requireText(text, TEXT_LIMITS.personName, "display_name");

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
      const name = requireText(request.name, TEXT_LIMITS.groupName, "name");
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

    getInviteLink: async ({ groupId }, context) => {
      await requireMember(context, groupId);
      const inviteCode =
        (await codeOfGroup(env.DB, groupId)) ??
        (await issueInviteCode(env.DB, groupId));
      return create(GetInviteLinkResponseSchema, { inviteCode });
    },

    joinGroup: async ({ inviteCode, displayName }, context) => {
      const user = await requireUser(context);
      if (!INVITE_CODE.test(inviteCode)) {
        throw new ConnectError("Malformed invite code", Code.InvalidArgument);
      }
      const shownAs = displayNameOf(displayName);
      const groupId = await groupOfCode(env.DB, inviteCode);
      if (groupId === null) {
        throw new ConnectError("No group uses this invite code", Code.NotFound);
      }
      // The Group DO decides; the user's DO then keeps its copy. Both are
      // idempotent, so a retry after a failure in between completes it.
      const added = await env.GROUPS.getByName(groupId).addMember({
        displayName: shownAs,
        userId: user.id,
      });
      await env.USERS.getByName(user.id).addMembership(groupId);
      return create(JoinGroupResponseSchema, {
        alreadyMember: !added,
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
