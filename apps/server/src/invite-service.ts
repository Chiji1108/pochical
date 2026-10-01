import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { ConnectRouter } from "@connectrpc/connect";
import { env } from "cloudflare:workers";

import {
  GetInvitePreviewResponseSchema,
  InviteService,
} from "./gen/pochical/v1/invite_pb";

/** 8 characters without the look-alikes I, O, l, 0 and 1. */
const INVITE_CODE = /^[A-HJ-NP-Za-km-z2-9]{8}$/u;

const findGroupId = async (inviteCode: string): Promise<string | null> => {
  const row = await env.DB.prepare(
    "SELECT group_id FROM invites WHERE code = ?"
  )
    .bind(inviteCode)
    .first<{ group_id: string }>();
  return row?.group_id ?? null;
};

export const registerInviteService = (router: ConnectRouter): void => {
  router.service(InviteService, {
    getInvitePreview: async ({ inviteCode }) => {
      if (!INVITE_CODE.test(inviteCode)) {
        throw new ConnectError("Malformed invite code", Code.InvalidArgument);
      }
      const groupId = await findGroupId(inviteCode);
      const profile =
        groupId === null
          ? null
          : await env.GROUP_ROOM.getByName(groupId).getProfile();
      if (profile === null) {
        throw new ConnectError("No group uses this invite code", Code.NotFound);
      }
      return create(GetInvitePreviewResponseSchema, {
        groupEmoji: profile.emoji ?? "",
        groupName: profile.name,
      });
    },
  });
};
