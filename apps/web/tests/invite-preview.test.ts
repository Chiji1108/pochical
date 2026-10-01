import { expect, test } from "bun:test";

import { fetchInvitePreview } from "../src/lib/invite-preview";
import type { InviteFetch } from "../src/lib/invite-preview";

const url = "https://server.example";
const respond =
  (status: number, data: unknown): InviteFetch =>
  async () =>
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
      status,
    });
test("asks the server's InviteService over Connect", async () => {
  const requests: Request[] = [];
  const recording: InviteFetch = async (input, init) => {
    requests.push(new Request(input, init));
    return await respond(200, { groupEmoji: "🌿", groupName: "同期" })(
      input,
      init
    );
  };
  expect(await fetchInvitePreview("Abcd2345", url, recording)).toEqual({
    groupEmoji: "🌿",
    groupName: "同期",
    status: "valid",
  });
  const [request] = requests;
  expect(request?.url).toBe(
    "https://server.example/pochical.v1.InviteService/GetInvitePreview"
  );
  expect(await request?.json()).toEqual({ inviteCode: "Abcd2345" });
});
test("reads a group without an emoji mark", async () => {
  expect(
    await fetchInvitePreview(
      "Abcd2345",
      url,
      respond(200, { groupName: "同期" })
    )
  ).toEqual({ groupEmoji: "", groupName: "同期", status: "valid" });
});
test("distinguishes revoked links from outages and malformed replies", async () => {
  for (const code of ["not_found", "invalid_argument"]) {
    expect(
      await fetchInvitePreview("Abcd2345", url, respond(404, { code }))
    ).toEqual({ status: "invalid" });
  }
  for (const response of [
    respond(503, {}),
    respond(500, { code: "internal" }),
    respond(200, { groupName: 12 }),
  ]) {
    expect(await fetchInvitePreview("Abcd2345", url, response)).toEqual({
      status: "unavailable",
    });
  }
});
test("rejects malformed codes without making a request and handles missing configuration", async () => {
  const unexpected: InviteFetch = () => {
    throw new Error("must not fetch");
  };
  expect(await fetchInvitePreview("../other", url, unexpected)).toEqual({
    status: "invalid",
  });
  for (const baseUrl of [undefined, "", "http://server.example", "nonsense"]) {
    expect(await fetchInvitePreview("Abcd2345", baseUrl, unexpected)).toEqual({
      status: "unavailable",
    });
  }
  expect(await fetchInvitePreview("Abcd2345", url, unexpected)).toEqual({
    status: "unavailable",
  });
});
