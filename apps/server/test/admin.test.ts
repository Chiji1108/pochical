import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { verifyAccess } from "../src/admin";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";

const ISSUER = "https://pochical.cloudflareaccess.com";
const AUDIENCE = "aud-tag";

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const encoded = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

/** A token as Cloudflare Access signs one, with a key of the test's own. */
const signedToken = async (claims: Record<string, unknown>) => {
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
  if (!("privateKey" in pair)) {
    throw new Error("No key pair");
  }
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  if (jwk instanceof ArrayBuffer) {
    throw new TypeError("Not a JWK");
  }
  const head = encoded({ alg: "RS256", kid: "k1" });
  const body = encoded(claims);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`)
  );
  return {
    keys: [{ ...jwk, kid: "k1" }],
    token: `${head}.${body}.${base64url(new Uint8Array(signature))}`,
  };
};

describe("Cloudflare Access's word", () => {
  const exp = Math.floor(Date.now() / 1000) + 60;

  it("lets in a token signed for the admin pages", async () => {
    const { keys, token } = await signedToken({
      aud: [AUDIENCE],
      exp,
      iss: ISSUER,
    });
    await expect(
      verifyAccess(token, keys, AUDIENCE, ISSUER)
    ).resolves.toBeTruthy();
  });

  it("keeps out one for another app, expired, or not signed by the team", async () => {
    const other = await signedToken({ aud: ["other"], exp, iss: ISSUER });
    const old = await signedToken({
      aud: [AUDIENCE],
      exp: exp - 120,
      iss: ISSUER,
    });
    const mine = await signedToken({ aud: [AUDIENCE], exp, iss: ISSUER });
    const theirs = await signedToken({ aud: [AUDIENCE], exp, iss: ISSUER });
    expect([
      await verifyAccess(other.token, other.keys, AUDIENCE, ISSUER),
      await verifyAccess(old.token, old.keys, AUDIENCE, ISSUER),
      await verifyAccess(mine.token, theirs.keys, AUDIENCE, ISSUER),
    ]).toStrictEqual([false, false, false]);
  });
});

const adminFetch = async (path: string, init?: RequestInit) =>
  await exports.default.fetch(`${ORIGIN}${path}`, {
    redirect: "manual",
    ...init,
  });

describe("the admin pages", () => {
  it("list the chats and answer one, the user hearing of it", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    await call(
      "SupportService/SendSupportMessage",
      { id: crypto.randomUUID(), text: "色を変えたい" },
      token
    );
    const list = await adminFetch("/admin/support");
    const listed = await list.text();
    expect([
      list.status,
      listed.includes("色を変えたい"),
      listed.includes("未返信"),
    ]).toStrictEqual([200, true, true]);
    const form = new URLSearchParams({ text: "設定から変えられます" });
    const path = `/admin/support/${encodeURIComponent(userId)}`;
    // A form from anywhere else cannot answer.
    const elsewhere = await adminFetch(path, {
      body: form,
      headers: { Origin: "https://evil.test" },
      method: "POST",
    });
    const answered = await adminFetch(path, {
      body: form,
      headers: { Origin: ORIGIN },
      method: "POST",
    });
    expect([elsewhere.status, answered.status]).toStrictEqual([403, 303]);
    const response = await call("SupportService/GetSupportChat", {}, token);
    const chat: unknown = await response.json();
    expect(JSON.stringify(chat)).toContain("設定から変えられます");
    expect(JSON.stringify(chat)).toContain('"unread":1');
  });

  it("list the reports", async () => {
    await env.DB.prepare(
      "insert into reports (id, created_at, group_id, reporter_id, target_id, reason, context) values (?, ?, 'g', 'r', 't', 'spam', '宣伝')"
    )
      .bind(crypto.randomUUID(), Date.now())
      .run();
    const response = await adminFetch("/admin/reports");
    const text = await response.text();
    expect([
      response.status,
      text.includes("宣伝"),
      text.includes("スパム"),
    ]).toStrictEqual([200, true, true]);
  });
});
