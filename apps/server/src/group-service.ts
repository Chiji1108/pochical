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
  RemoveMemberResponseSchema,
  RenameGroupResponseSchema,
  SetDisplayNameResponseSchema,
  SetGroupPhotoResponseSchema,
} from "./gen/pochical/v1/group_pb";
import { dropPickedPhoto, requireMark, shareMarkPhoto } from "./group-marks";
import { isId } from "./ids";
import {
  issueInviteCode,
  liveInviteCode,
  noGroupOfCode,
  requireGroupOfCode,
} from "./invite-codes";
import { isMemberOf } from "./membership";
import { sharePersonPhoto } from "./photos";
import { overLimit } from "./rate-limits";
import { requireUser } from "./session";
import { requireText } from "./text-limits";

/** The usual photo into a group's photos, before the group shows it. */
const shareUsualPhoto = async (
  userId: string,
  photoId: string,
  groupId: string
): Promise<void> => {
  if (photoId !== "") {
    await sharePersonPhoto(env, userId, photoId, groupId);
  }
};

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
): Promise<{
  usualName: string;
  ownName: string | null;
  usualPhoto: string;
  adopted: boolean;
}> => {
  const { name: usualName, photoId: usualPhoto } =
    await env.USERS.getByName(userId).profileOf();
  const name = typed.trim();
  if (name === "") {
    if (usualName === "") {
      throw new ConnectError("display_name is empty", Code.InvalidArgument);
    }
    return { adopted: false, ownName: null, usualName, usualPhoto };
  }
  requireText(name, textLimits.personName, "display_name");
  if (usualName === "" && adopt) {
    return { adopted: true, ownName: null, usualName: name, usualPhoto };
  }
  return {
    adopted: false,
    ownName: name === usualName ? null : name,
    usualName,
    usualPhoto,
  };
};

/** A name given with no usual one yet becomes it, once the group has them. */
const adoptName = async (
  userId: string,
  {
    adopted,
    usualName,
    usualPhoto,
  }: { adopted: boolean; usualName: string; usualPhoto: string }
): Promise<void> => {
  if (adopted) {
    await env.USERS.getByName(userId).setProfile(usualName, usualPhoto);
  }
};

/** The caller's id, when they are in the group; PERMISSION_DENIED otherwise. */
const requireMember = async (
  context: HandlerContext,
  groupId: string
): Promise<string> => {
  const user = await requireUser(context);
  if (!(await isMemberOf(env, user.id, groupId))) {
    throw new ConnectError("Not a member of this group", Code.PermissionDenied);
  }
  return user.id;
};

/**
 * The group's news of the caller has reached their own DO, which lists the
 * group (`listed`) or not, so their devices show it and its socket lets
 * them in as the call answers. UNAVAILABLE while not, for the app to try
 * again; the group tells it again meanwhile, until it is taken.
 */
const requireTold = async (
  userId: string,
  groupId: string,
  listed: boolean
): Promise<void> => {
  if ((await env.USERS.getByName(userId).isMember(groupId)) !== listed) {
    throw new ConnectError("Try again", Code.Unavailable);
  }
};

export const registerGroupService = (router: ConnectRouter): void => {
  router.service(GroupService, {
    createGroup: async (request, context) => {
      const user = await requireUser(context);
      const name = requireText(request.name, textLimits.groupName, "name");
      const mark = requireMark(request.mark);
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
      // Noted by the user's DO before the group is made (noteGroup).
      const groupId = await users.groupIdFor(request.requestId);
      await shareUsualPhoto(user.id, names.usualPhoto, groupId);
      const group = env.GROUPS.getByName(groupId);
      // A retry finds the group made with it already.
      const made = await group.getProfile();
      await shareMarkPhoto(env, user.id, mark, groupId, made?.mark.photoId);
      await group.create(
        { mark, name },
        {
          ownName: names.ownName,
          userId: user.id,
          usualName: names.usualName,
          usualPhoto: names.usualPhoto,
        }
      );
      await adoptName(user.id, names);
      await dropPickedPhoto(env, user.id, mark, names.usualPhoto);
      await requireTold(user.id, groupId, true);
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
        groupId,
        groupMark: profile.mark,
        groupName: profile.name,
        // Names and faces only: who they are stays inside the group.
        members: memberList.map(({ displayName, photoId }) => ({
          displayName,
          photoId,
        })),
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
      await shareUsualPhoto(user.id, names.usualPhoto, groupId);
      // Noted by the user's DO before the group hears of them, so deleting
      // the account reaches the group whatever happens after; the Group DO
      // then decides, and tells the user's DO (takeMembership).
      await env.USERS.getByName(user.id).noteGroup(groupId);
      const group = env.GROUPS.getByName(groupId);
      const result = await group.addMember({
        ownName: names.ownName,
        userId: user.id,
        usualName: names.usualName,
        usualPhoto: names.usualPhoto,
      });
      if (result === "gone") {
        throw noGroupOfCode();
      }
      if (result === "full") {
        throw new ConnectError(
          `The group has its most members (${GROUP_MAX_MEMBERS})`,
          Code.ResourceExhausted
        );
      }
      await adoptName(user.id, names);
      await requireTold(user.id, groupId, true);
      return create(JoinGroupResponseSchema, {
        alreadyMember: result === "already",
        groupId,
      });
    },

    leaveGroup: async ({ groupId }, context) => {
      const user = await requireUser(context);
      // The Group DO decides, closes their sockets there and tells their
      // DO; a group the user never asked to join wakes none.
      if (await env.USERS.getByName(user.id).knowsGroup(groupId)) {
        await env.GROUPS.getByName(groupId).removeMember(user.id);
        await requireTold(user.id, groupId, false);
      }
      return create(LeaveGroupResponseSchema, {});
    },

    remakeInviteLink: async ({ groupId }, context) => {
      const by = await requireMember(context, groupId);
      const inviteCode = await issueInviteCode(env.DB, groupId);
      // Said in the chat: a link someone already sent stops working.
      await env.GROUPS.getByName(groupId).noteInviteRemade(by);
      return create(RemakeInviteLinkResponseSchema, { inviteCode });
    },

    removeMember: async ({ groupId, userId }, context) => {
      const by = await requireMember(context, groupId);
      if (userId === by) {
        throw new ConnectError(
          "Leave the group rather than remove yourself",
          Code.InvalidArgument
        );
      }
      const group = env.GROUPS.getByName(groupId);
      if (!(await group.isMember(userId))) {
        throw new ConnectError("No such member", Code.NotFound);
      }
      // As on leaving: the group tells their DO, until it is taken.
      await group.removeMember(userId, by);
      return create(RemoveMemberResponseSchema, {});
    },

    renameGroup: async (request, context) => {
      const userId = await requireMember(context, request.groupId);
      const name = requireText(request.name, textLimits.groupName, "name");
      const mark = requireMark(request.mark);
      const group = env.GROUPS.getByName(request.groupId);
      const current = await group.getProfile();
      await shareMarkPhoto(
        env,
        userId,
        mark,
        request.groupId,
        current?.mark.photoId
      );
      // Each member's list of groups shows it as the group tells their DO.
      await group.setProfile({ mark, name }, userId);
      if (mark.photoId !== "") {
        const { photoId: usualPhoto } =
          await env.USERS.getByName(userId).profileOf();
        await dropPickedPhoto(env, userId, mark, usualPhoto);
      }
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

    setGroupPhoto: async ({ groupId, usual, photoId }, context) => {
      const userId = await requireMember(context, groupId);
      if (!(usual || photoId === "" || isId(photoId))) {
        throw new ConnectError("Malformed photo_id", Code.InvalidArgument);
      }
      const kept = await env.GROUPS.getByName(groupId).setGroupPhoto(userId, {
        photoId,
        usual,
      });
      if (!kept) {
        throw new ConnectError("Not your photo", Code.InvalidArgument);
      }
      return create(SetGroupPhotoResponseSchema, {});
    },
  });
};
