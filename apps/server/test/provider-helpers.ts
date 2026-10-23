import { env, exports } from "cloudflare:workers";
import { vi } from "vitest";

import { ORIGIN } from "./helpers";

// Signing in with Apple or Google, as each provider's keys would sign its
// ID tokens: a test key stands in for both, served where better-auth asks
// for them.
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
const testKey = {
  alg: "RS256",
  e: exported.e,
  kid: "test-kid",
  kty: "RSA",
  n: exported.n,
};

/** Where each provider serves its keys. */
const KEYS = new Set([
  "https://appleid.apple.com/auth/keys",
  "https://www.googleapis.com/oauth2/v3/certs",
]);

export type Provider = "apple" | "google";

/** As UserService's ProviderToken names each. */
const PROTO_PROVIDER = {
  apple: "SIGN_IN_PROVIDER_APPLE",
  google: "SIGN_IN_PROVIDER_GOOGLE",
} as const;

/** What each provider's ID token says beyond the person and the nonce. */
const claimsOf = (provider: Provider, sub: string) =>
  provider === "apple"
    ? {
        aud: "app.pochical",
        email: `${sub}@privaterelay.appleid.com`,
        email_verified: "true",
        iss: "https://appleid.apple.com",
      }
    : {
        // As the apps ask: for the Web client, by the iOS client.
        aud: env.GOOGLE_CLIENT_IDS[0],
        azp: env.GOOGLE_CLIENT_IDS[1],
        email: `${sub}@gmail.com`,
        email_verified: true,
        iss: "https://accounts.google.com",
      };

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const part = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

/** An ID token as the provider gives the app, for `sub`, with `more` claims. */
export const idToken = async (
  provider: Provider,
  sub: string,
  nonce: string,
  more: Record<string, unknown> = {}
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const head = part({ alg: "RS256", kid: testKey.kid });
  const body = part({
    ...claimsOf(provider, sub),
    exp: now + 600,
    iat: now,
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

/** UserService's ProviderToken for `sub`, as the apps send it. */
export const accountToken = async (
  provider: Provider,
  sub: string,
  nonce: string
) => ({
  idToken: await idToken(provider, sub, nonce),
  nonce,
  provider: PROTO_PROVIDER[provider],
});

/**
 * The providers' keys, from the test key; what `more` answers, as Apple's
 * other calls; everything else as it is.
 */
export const providerKeys = (
  more: (request: Request) => Response | undefined = () => undefined
) => {
  const through = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (KEYS.has(request.url)) {
      return Response.json({ keys: [testKey] });
    }
    return more(request) ?? (await through(request));
  });
};

/** Links the provider's account to the session's user; the status. */
export const link = async (
  token: string,
  provider: Provider,
  providerToken: string,
  nonce: string
) => {
  const response = await exports.default.fetch(
    `${ORIGIN}/api/auth/link-social`,
    {
      body: JSON.stringify({
        idToken: { nonce, token: providerToken },
        provider,
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
