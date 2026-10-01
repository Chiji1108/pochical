import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { InviteService } from "../gen/pochical/v1/invite_pb";

export type InvitePreview =
  | { status: "valid"; groupName: string; groupEmoji: string }
  | { status: "invalid" | "unavailable" };
export type InviteFetch = typeof fetch;
const INVITE_CODE = /^[A-HJ-NP-Za-km-z2-9]{8}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const TIMEOUT_MS = 5000;

// The server's origin, when it is https (or http on this machine for
// `wrangler dev`).
const serverOrigin = (baseUrl: string | undefined): string | null => {
  if (baseUrl === undefined || !URL.canParse(baseUrl)) {
    return null;
  }
  const url = new URL(baseUrl);
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  return url.protocol === "https:" || local ? url.origin : null;
};

export async function fetchInvitePreview(
  code: string,
  baseUrl: string | undefined,
  request: InviteFetch = fetch
): Promise<InvitePreview> {
  if (!INVITE_CODE.test(code)) {
    return { status: "invalid" };
  }
  const origin = serverOrigin(baseUrl);
  if (origin === null) {
    return { status: "unavailable" };
  }
  const client = createClient(
    InviteService,
    createConnectTransport({
      baseUrl: origin,
      // Workers' fetch rejects the "error" redirect mode connect-web asks
      // for. "manual" hands back a 3xx, which fails the call all the same.
      fetch: async (input, init) =>
        await request(input, { ...init, redirect: "manual" }),
    })
  );
  try {
    const { groupEmoji, groupName } = await client.getInvitePreview(
      { inviteCode: code },
      { timeoutMs: TIMEOUT_MS }
    );
    return { groupEmoji, groupName, status: "valid" };
  } catch (error) {
    const { code: reason } = ConnectError.from(error);
    const gone = reason === Code.NotFound || reason === Code.InvalidArgument;
    return { status: gone ? "invalid" : "unavailable" };
  }
}
