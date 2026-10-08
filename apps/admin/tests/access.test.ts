import { describe, expect, it } from "bun:test";

import { verifyAccess } from "../src/access";

const ISSUER = "https://pochical.cloudflareaccess.com";
const AUDIENCE = "aud-tag";
const NOW = 1_800_000_000_000;

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const textPart = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

const pair = await crypto.subtle.generateKey(
  {
    hash: "SHA-256",
    modulusLength: 2048,
    name: "RSASSA-PKCS1-v1_5",
    publicExponent: new Uint8Array([1, 0, 1]),
  },
  true,
  ["sign", "verify"]
);
const keys = [
  { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" },
];

/** A token as Access signs it, with `claims` over the usual ones. */
const token = async (
  claims: Record<string, unknown> = {},
  kid = "k1"
): Promise<string> => {
  const head = textPart({ alg: "RS256", kid });
  const body = textPart({
    aud: [AUDIENCE],
    exp: NOW / 1000 + 60,
    iss: ISSUER,
    ...claims,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`)
  );
  return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
};

describe("Access's token", () => {
  it("lets in one Access signed for the site", async () => {
    expect(await verifyAccess(await token(), keys, AUDIENCE, ISSUER, NOW)).toBe(
      true
    );
  });

  it("keeps out one for another site, team, or time, or signed by another key", async () => {
    const refused = await Promise.all([
      verifyAccess(
        await token({ aud: ["other"] }),
        keys,
        AUDIENCE,
        ISSUER,
        NOW
      ),
      verifyAccess(
        await token({ iss: "https://else.cloudflareaccess.com" }),
        keys,
        AUDIENCE,
        ISSUER,
        NOW
      ),
      verifyAccess(
        await token({ exp: NOW / 1000 - 1 }),
        keys,
        AUDIENCE,
        ISSUER,
        NOW
      ),
      verifyAccess(await token({}, "k2"), keys, AUDIENCE, ISSUER, NOW),
    ]);
    expect(refused).toStrictEqual([false, false, false, false]);
  });

  it("keeps out one changed after signing, or not a token at all", async () => {
    const signed = await token();
    const [head, , signature] = signed.split(".");
    const forged = `${head}.${textPart({ aud: [AUDIENCE], exp: NOW, iss: ISSUER })}.${signature}`;
    expect(await verifyAccess(forged, keys, AUDIENCE, ISSUER, NOW)).toBe(false);
    expect(await verifyAccess("nonsense", keys, AUDIENCE, ISSUER, NOW)).toBe(
      false
    );
    expect(
      await verifyAccess(`${head}.${head}.!`, keys, AUDIENCE, ISSUER, NOW)
    ).toBe(false);
  });
});
