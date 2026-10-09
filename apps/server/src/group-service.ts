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
  LeaveGroupResponseSchema,
  RemakeInviteLinkResponseSchema,
  RenameGroupResponseSchema,
  SetDisplayNameResponseSchema,
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

/**
 * How the caller will appear in a group from the name they typed: their
 * usual name, which the group then follows, or one of its own; empty for
 * the usual one (spec/sync-protocol.md, Profile). A caller with no usual
 * name must give one, and joining or making a group adopts it as theirs.
 */
const namesFor = async (
  userId: string,
  typed: string,
  adopt: boolean
): Promise<{ usualName: string; ownName: string | null; adopted: boolean }> => {
  const usualName = await env.USERS.getByName(userId).profileName();
  const name = typed.trim();
  if (name === "") {
    if (usualName === "") {
      throw new ConnectError("display_name is empty", Code.InvalidArgument);
    }
    return { adopted: false, ownName: null, usualName };
  }
  requireText(name, textLimits.personName, "display_name");
  if (usualName === "" && adopt) {
    return { adopted: true, ownName: null, usualName: name };
  }
  return {
    adopted: false,
    ownName: name === usualName ? null : name,
    usualName,
  };
};

/** A name given with no usual one yet becomes it, once the group has them. */
const adoptName = async (
  userId: string,
  { adopted, usualName }: { adopted: boolean; usualName: string }
): Promise<void> => {
  if (adopted) {
    await env.USERS.getByName(userId).setProfile(usualName);
  }
};

/** The caller's id, when they are in the group; PERMISSION_DENIED otherwise. */
const requireMember = async (
  context: HandlerContext,
  groupId: string
): Promise<string> => {
  const user = await requireUser(context);
  // The user's own DO, so an id that is not theirs wakes no Group DO.
  if (!(await env.USERS.getByName(user.id).isMember(groupId))) {
    throw new ConnectError("Not a member of this group", Code.PermissionDenied);
  }
  return user.id;
};

export const registerGroupService = (router: ConnectRouter): void => {
  router.service(GroupService, {
    createGroup: async (request, context) => {
      const user = await requireUser(context);
      const name = requireText(request.name, textLimits.groupName, "name");
      const emoji = requireEmoji(request.emoji);
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
      const names = await namesFor(user.id, request.displayName, true);
      const groupId = await users.groupIdFor(request.requestId);
      await env.GROUPS.getByName(groupId).create(
        { emoji, name },
        { ownName: names.ownName, userId: user.id, usualName: names.usualName }
      );
      await adoptName(user.id, names);
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
        // Names only: who they are stays inside the group.
        members: memberList.map(({ displayName }) => ({ displayName })),
      });
    },

    getInviteLink: async ({ groupId }, context) => {
      await requireMember(context, groupId);
      const inviteCode = await liveInviteCode(env.DB, groupId);
      return create(GetInviteLinkResponseSchema, { inviteCode });
    },

    joinGroup: async ({ inviteCode, displayName }, context) => {
      const user = await requireUser(context);
      const groupId = await requireGroupOfCode(env.DB, inviteCode);
      const names = await namesFor(user.id, displayName, true);
      // The Group DO decides; the user's DO then keeps its copy. Both are
      // idempotent, so a retry after a failure in between completes it.
      const group = env.GROUPS.getByName(groupId);
      const result = await group.addMember({
        ownName: names.ownName,
        userId: user.id,
        usualName: names.usualName,
      });
      if (result === "full") {
        throw new ConnectError(
          `The group has its most members (${GROUP_MAX_MEMBERS})`,
          Code.ResourceExhausted
        );
      }
      await adoptName(user.id, names);
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

    leaveGroup: async ({ groupId }, context) => {
      const user = await requireUser(context);
      // The user's DO first, so their devices stop opening the group even
      // if the group's own step fails; both can be repeated.
      // A group the user was never in wakes no Group DO.
      const users = env.USERS.getByName(user.id);
      if (await users.wasMember(groupId)) {
        await users.removeMembership(groupId);
        await env.GROUPS.getByName(groupId).removeMember(user.id);
      }
      return create(LeaveGroupResponseSchema, {});
    },

    remakeInviteLink: async ({ groupId }, context) => {
      await requireMember(context, groupId);
      const inviteCode = await issueInviteCode(env.DB, groupId);
      return create(RemakeInviteLinkResponseSchema, { inviteCode });
    },

    renameGroup: async (request, context) => {
      await requireMember(context, request.groupId);
      const name = requireText(request.name, textLimits.groupName, "name");
      const emoji = requireEmoji(request.emoji);
      const group = env.GROUPS.getByName(request.groupId);
      await group.setProfile({ emoji, name });
      // Each member's list of groups shows the new name; one that cannot be
      // reached now hears it from the group's socket when they open it.
      const memberList = await group.memberList();
      await Promise.allSettled(
        memberList.map(async ({ userId }) => {
          await env.USERS.getByName(userId).renameMembership(request.groupId, {
            emoji,
            name,
          });
        })
      );
      return create(RenameGroupResponseSchema, {});
    },

    setDisplayName: async (request, context) => {
      const userId = await requireMember(context, request.groupId);
      const { ownName } = await namesFor(userId, request.displayName, false);
      await env.GROUPS.getByName(request.groupId).setDisplayName(
        userId,
        ownName
      );
      return create(SetDisplayNameResponseSchema, {});
    },
  });
};
