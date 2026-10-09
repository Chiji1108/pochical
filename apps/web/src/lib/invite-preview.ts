import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { INVITE_CODE } from "@pochical/design/invite";

import type { InviteGroupMark } from "../components/invite-mark";
import { InviteService } from "../gen/pochical/v1/invite_pb";

export type InvitePreview =
  | {
      status: "valid";
      groupName: string;
      groupMark: InviteGroupMark;
      memberCount: number;
    }
  | { status: "invalid" | "unavailable" };
// The server as the site reaches it: its service binding's fetch.
export type InviteFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
// A service binding ignores the host; this one names where the apps reach
// the same server.
const SERVER_ORIGIN = "https://api.pochical.app";
const TIMEOUT_MS = 5000;

// A string hash's base and modulus: a 32-bit polynomial hash, enough to
// tell one invitation's versions apart.
const HASH_BASE = 31;
const HASH_MODULUS = 2 ** 32;
const HASH_RADIX = 36;

/**
 * A short name for what an invitation's share image draws: its group's
 * name, mark (a photo by its id) and member count. It changes with any of them, so the image
 * is drawn again, and its address on the page changes for the apps that
 * keep a link's card by the image's address.
 */
export const inviteImageVersion = ({
  groupName,
  groupMark,
  memberCount,
}: {
  groupName: string;
  groupMark: InviteGroupMark;
  memberCount: number;
}): string => {
  const { emoji, icon, letter, color, photoId } = groupMark;
  const drawn = JSON.stringify([
    groupName,
    emoji,
    icon,
    letter,
    color,
    photoId,
    memberCount,
  ]);
  let hash = 0;
  for (const character of drawn) {
    hash = (hash * HASH_BASE + (character.codePointAt(0) ?? 0)) % HASH_MODULUS;
  }
  return hash.toString(HASH_RADIX);
};

export async function fetchInvitePreview(
  code: string,
  server: InviteFetch
): Promise<InvitePreview> {
  if (!INVITE_CODE.test(code)) {
    return { status: "invalid" };
  }
  const client = createClient(
    InviteService,
    createConnectTransport({
      baseUrl: SERVER_ORIGIN,
      // Workers' fetch rejects the "error" redirect mode connect-web asks
      // for. "manual" hands back a 3xx, which fails the call all the same.
      fetch: async (input, init) =>
        await server(input, { ...init, redirect: "manual" }),
    })
  );
  try {
    const { groupMark, groupName, memberCount } = await client.getInvitePreview(
      { inviteCode: code },
      { timeoutMs: TIMEOUT_MS }
    );
    return {
      groupMark: {
        color: groupMark?.color ?? 0,
        emoji: groupMark?.emoji ?? "",
        icon: groupMark?.icon ?? "",
        letter: groupMark?.letter ?? "",
        photoId: groupMark?.photoId ?? "",
      },
      groupName,
      memberCount,
      status: "valid",
    };
  } catch (error) {
    const { code: reason } = ConnectError.from(error);
    const gone = reason === Code.NotFound || reason === Code.InvalidArgument;
    return { status: gone ? "invalid" : "unavailable" };
  }
}

/**
 * A group's photo mark for anyone holding its live invitation, as the
 * server gives it; null when it is not the group's mark (any longer).
 */
export async function fetchInviteMark(
  code: string,
  photoId: string,
  server: InviteFetch
): Promise<Response | null> {
  if (!INVITE_CODE.test(code)) {
    return null;
  }
  const response = await server(
    `${SERVER_ORIGIN}/v1/invites/${code}/mark/${encodeURIComponent(photoId)}`,
    { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  return response.ok ? response : null;
}
