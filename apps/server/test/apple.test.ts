import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appleKeys, idToken, link } from "./apple-helpers";
import { call, signInAnonymously, userIdOf } from "./helpers";

const anonymousOf = async (token: string): Promise<boolean> => {
  const response = await call("UserService/GetMe", {}, token);
  const body: unknown = await response.json();
  return typeof body === "object" && body !== null && "anonymous" in body
    ? body.anonymous === true
    : false;
};

describe("linking Sign in with Apple", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the user, anonymous no more, and none of Apple's tokens", async () => {
    appleKeys();
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const before = await anonymousOf(token);
    const status = await link(token, await idToken("apple-1", "n1"), "n1");
    const kept = await env.DB.prepare(
      "select provider_id, id_token, access_token from account where user_id = ?"
    )
      .bind(userId)
      .first();
    expect([before, status, await anonymousOf(token), kept]).toStrictEqual([
      true,
      200,
      false,
      { access_token: null, id_token: null, provider_id: "apple" },
    ]);
  });

  it("says when Apple's account is another user's already", async () => {
    appleKeys();
    const first = await signInAnonymously();
    await link(first, await idToken("apple-2", "n2"), "n2");
    const second = await signInAnonymously();
    const status = await link(second, await idToken("apple-2", "n3"), "n3");
    expect([status, await anonymousOf(second)]).toStrictEqual([409, true]);
  });

  it("takes no token for another app, or with another nonce", async () => {
    appleKeys();
    const token = await signInAnonymously();
    const statuses = [
      await link(token, await idToken("apple-3", "n4", { aud: "other" }), "n4"),
      await link(token, await idToken("apple-3", "n5"), "other-nonce"),
    ];
    expect([statuses, await anonymousOf(token)]).toStrictEqual([
      [401, 401],
      true,
    ]);
  });
});
