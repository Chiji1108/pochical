import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { call, signInAnonymously, userIdOf } from "./helpers";
import { accountToken, idToken, link, providerKeys } from "./provider-helpers";
import type { Provider } from "./provider-helpers";

/** What GetMe says of the session's user. */
const meOf = async (token: string) => {
  const response = await call("UserService/GetMe", {}, token);
  const body: unknown = await response.json();
  const said = typeof body === "object" && body !== null ? body : {};
  return {
    anonymous: "anonymous" in said && said.anonymous === true,
    provider: "provider" in said ? said.provider : undefined,
  };
};

const PROTO = {
  apple: "SIGN_IN_PROVIDER_APPLE",
  google: "SIGN_IN_PROVIDER_GOOGLE",
} as const;

describe.each<Provider>(["apple", "google"])("linking %s", (provider) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the user, anonymous no more, and none of the provider's tokens", async () => {
    providerKeys();
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const before = await meOf(token);
    const status = await link(
      token,
      provider,
      await idToken(provider, `${provider}-1`, "n1"),
      "n1"
    );
    const kept = await env.DB.prepare(
      "select provider_id, id_token, access_token from account where user_id = ?"
    )
      .bind(userId)
      .first();
    expect([before, status, await meOf(token), kept]).toStrictEqual([
      { anonymous: true, provider: undefined },
      200,
      { anonymous: false, provider: PROTO[provider] },
      { access_token: null, id_token: null, provider_id: provider },
    ]);
  });

  it("says when the provider's account is another user's already", async () => {
    providerKeys();
    const first = await signInAnonymously();
    const subject = `${provider}-2`;
    await link(first, provider, await idToken(provider, subject, "n2"), "n2");
    const second = await signInAnonymously();
    const status = await link(
      second,
      provider,
      await idToken(provider, subject, "n3"),
      "n3"
    );
    const after = await meOf(second);
    expect([status, after.anonymous]).toStrictEqual([409, true]);
  });

  it("takes no token for another app, or with another nonce", async () => {
    providerKeys();
    const token = await signInAnonymously();
    const subject = `${provider}-3`;
    const statuses = [
      await link(
        token,
        provider,
        await idToken(provider, subject, "n4", { aud: "other" }),
        "n4"
      ),
      await link(
        token,
        provider,
        await idToken(provider, subject, "n5"),
        "other-nonce"
      ),
    ];
    const after = await meOf(token);
    expect([statuses, after.anonymous]).toStrictEqual([[401, 401], true]);
  });
});

describe("one provider a user", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("links no second provider to a user linked already, by either way", async () => {
    providerKeys();
    const token = await signInAnonymously();
    await link(token, "apple", await idToken("apple", "one-a", "n1"), "n1");
    const linked = await link(
      token,
      "google",
      await idToken("google", "one-g", "n2"),
      "n2"
    );
    const other = await signInAnonymously();
    await link(other, "google", await idToken("google", "one-g2", "n3"), "n3");
    const taken = await call(
      "UserService/TakeAccount",
      { account: await accountToken("google", "one-g2", "n4") },
      token
    );
    const kept = await env.DB.prepare(
      "select provider_id from account where user_id = ?"
    )
      .bind(await userIdOf(token))
      .all();
    const stillOther = await meOf(other);
    // better-auth answers a refused link 417, Connect FAILED_PRECONDITION
    // 400; the other user keeps their Google account.
    expect([
      linked,
      taken.status,
      kept.results,
      stillOther.anonymous,
    ]).toStrictEqual([417, 400, [{ provider_id: "apple" }], false]);
  });

  it("takes no ID token without its nonce", async () => {
    providerKeys();
    const token = await signInAnonymously();
    const linked = await link(
      token,
      "google",
      await idToken("google", "no-nonce", ""),
      ""
    );
    const peeked = await call(
      "UserService/PeekAccount",
      { account: { ...(await accountToken("google", "no-nonce", "")) } },
      token
    );
    expect([linked, peeked.status]).toStrictEqual([400, 400]);
  });
});

describe("linking Google", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes a token for the iOS client too, the Web client's being the apps' usual", async () => {
    providerKeys();
    const token = await signInAnonymously();
    const status = await link(
      token,
      "google",
      await idToken("google", "google-ios", "n6", {
        aud: env.GOOGLE_CLIENT_IDS[1],
      }),
      "n6"
    );
    expect(status).toBe(200);
  });
});
