import { expect, test } from "bun:test";

import { fetchInvitePreview } from "../src/lib/invite-preview";
import type { InviteFetch } from "../src/lib/invite-preview";

const respond =
  (status: number, data: unknown): InviteFetch =>
  async () =>
    Response.json(data, { status });
test("asks the server's InviteService over Connect", async () => {
  const requests: Request[] = [];
  const recording: InviteFetch = async (input, init) => {
    requests.push(new Request(input, init));
    return await respond(200, { groupEmoji: "🌿", groupName: "同期" })(
      input,
      init
    );
  };
  expect(await fetchInvitePreview("Abcd2345", recording)).toEqual({
    groupEmoji: "🌿",
    groupName: "同期",
    status: "valid",
  });
  const [request] = requests;
  expect(request?.url).toBe(
    "https://api.pochical.app/pochical.v1.InviteService/GetInvitePreview"
  );
  expect(await request?.json()).toEqual({ inviteCode: "Abcd2345" });
});
test("reads a group without an emoji mark", async () => {
  expect(
    await fetchInvitePreview("Abcd2345", respond(200, { groupName: "同期" }))
  ).toEqual({ groupEmoji: "", groupName: "同期", status: "valid" });
});
test("distinguishes revoked links from outages and malformed replies", async () => {
  for (const code of ["not_found", "invalid_argument"]) {
    expect(
      await fetchInvitePreview("Abcd2345", respond(404, { code }))
    ).toEqual({ status: "invalid" });
  }
  const unreachable: InviteFetch = () => {
    throw new Error("binding unavailable");
  };
  for (const server of [
    respond(503, {}),
    respond(500, { code: "internal" }),
    respond(200, { groupName: 12 }),
    unreachable,
  ]) {
    expect(await fetchInvitePreview("Abcd2345", server)).toEqual({
      status: "unavailable",
    });
  }
});
test("rejects malformed codes without asking the server", async () => {
  const unexpected: InviteFetch = () => {
    throw new Error("must not fetch");
  };
  expect(await fetchInvitePreview("../other", unexpected)).toEqual({
    status: "invalid",
  });
});
