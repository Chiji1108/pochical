import { exports } from "cloudflare:workers";
import { vi } from "vitest";

import { ORIGIN } from "./helpers";

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
export const idToken = async (
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

/**
 * Apple's keys, from the test key; what `more` answers, as Apple's other
 * calls; everything else as it is.
 */
export const appleKeys = (
  more: (request: Request) => Response | undefined = () => undefined
) => {
  const through = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === "https://appleid.apple.com/auth/keys") {
      return Response.json({ keys: [appleKey] });
    }
    return more(request) ?? (await through(request));
  });
};

/** Links Apple's account to the session's user; the status. */
export const link = async (
  token: string,
  appleToken: string,
  nonce: string
) => {
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
