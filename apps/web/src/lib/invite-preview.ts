import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { InviteService } from "../gen/pochical/v1/invite_pb";

export type InvitePreview =
  | {
      status: "valid";
      groupName: string;
      groupEmoji: string;
      memberCount: number;
    }
  | { status: "invalid" | "unavailable" };
// The server as the site reaches it: its service binding's fetch.
export type InviteFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
const INVITE_CODE = /^[A-HJ-NP-Za-km-z2-9]{8}$/u;
// A service binding ignores the host; this one names where the apps reach
// the same server.
const SERVER_ORIGIN = "https://api.pochical.app";
const TIMEOUT_MS = 5000;

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
    const { groupEmoji, groupName, memberCount } =
      await client.getInvitePreview(
        { inviteCode: code },
        { timeoutMs: TIMEOUT_MS }
      );
    return { groupEmoji, groupName, memberCount, status: "valid" };
  } catch (error) {
    const { code: reason } = ConnectError.from(error);
    const gone = reason === Code.NotFound || reason === Code.InvalidArgument;
    return { status: gone ? "invalid" : "unavailable" };
  }
}
