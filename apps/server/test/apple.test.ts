import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";

// Sign in with Apple, as Apple's keys would sign its ID tokens: a test key
// stands in for Apple's, served where better-auth asks for them.
const generated = await crypto.subtle.generateKey(
  {
    hash: "SHA-256",
    modulusLength: 2048,
    name: "RSASSA-PKCS1-v1_5",
    publicExponent: new Uint8Array([1, 0, 1]),
  },
  true,
  ["sign", "verify"]
);
if (!("privateKey" in generated)) {
  throw new Error("An RSA key pair was asked for");
}
const pair = generated;
const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
if (exported instanceof ArrayBuffer) {
  throw new TypeError("A JWK was asked for");
}
const appleKey = {
  alg: "RS256",
  e: exported.e,
  kid: "test-kid",
  kty: "RSA",
  n: exported.n,
};

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const part = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

/** An ID token as Apple gives the app, for `sub`, with `more` claims. */
const idToken = async (
  sub: string,
  nonce: string,
  more: Record<string, unknown> = {}
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const head = part({ alg: "RS256", kid: appleKey.kid });
  const body = part({
    aud: "app.pochical",
    email: `${sub}@privaterelay.appleid.com`,
    email_verified: "true",
    exp: now + 600,
    iat: now,
    iss: "https://appleid.apple.com",
    nonce,
    sub,
    ...more,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`)
  );
  return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
};

/** Apple's keys, from the test key; everything else as it is. */
const appleKeys = () => {
  const through = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === "https://appleid.apple.com/auth/keys") {
      return Response.json({ keys: [appleKey] });
    }
    return await through(request);
  });
};

/** Links Apple's account to the session's user; the status. */
const link = async (token: string, appleToken: string, nonce: string) => {
  const response = await exports.default.fetch(
    `${ORIGIN}/api/auth/link-social`,
    {
      body: JSON.stringify({
        idToken: { nonce, token: appleToken },
        provider: "apple",
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );
  return response.status;
};

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
