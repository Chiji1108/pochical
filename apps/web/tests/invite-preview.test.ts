import { expect, test } from "bun:test";

import { fetchInvitePreview } from "../src/lib/invite-preview";
import type { InviteFetch } from "../src/lib/invite-preview";

const url = "https://example.convex.site";
const respond =
  (status: number, data: unknown): InviteFetch =>
  async () =>
    new Response(JSON.stringify(data), { status });
test("validates an invitation response", async () => {
  expect(
    await fetchInvitePreview(
      "Abcd2345",
      url,
      respond(200, { groupEmoji: "🌿", groupName: "同期", ok: true })
    )
  ).toEqual({ groupEmoji: "🌿", groupName: "同期", status: "valid" });
});
test("distinguishes revoked links from outages and malformed replies", async () => {
  expect(
    await fetchInvitePreview("Abcd2345", url, respond(404, { ok: false }))
  ).toEqual({ status: "invalid" });
  for (const response of [
    respond(503, {}),
    respond(200, { ok: true }),
    respond(200, { groupEmoji: "a", groupName: 12, ok: true }),
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
  expect(await fetchInvitePreview("Abcd2345", undefined, unexpected)).toEqual({
    status: "unavailable",
  });
  expect(await fetchInvitePreview("Abcd2345", url, unexpected)).toEqual({
    status: "unavailable",
  });
});
