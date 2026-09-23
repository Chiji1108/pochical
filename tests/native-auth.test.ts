import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { verifyNativeIdentity } from "../convex-lib/nativeIdentity";

const pair = await generateKeyPair("RS256");
const jwk = await exportJWK(pair.publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: "test" }] });
const nonce = "a".repeat(64);
const token = (overrides: Record<string, unknown> = {}) =>
  new SignJWT({
    sub: "provider-user",
    iss: "https://accounts.google.com",
    aud: "web-client",
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    email: "user@example.com",
    email_verified: true,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(pair.privateKey);

test("native identity verifies signature, issuer, audience, expiry and nonce", async () => {
  expect(
    await verifyNativeIdentity(
      "google",
      await token(),
      nonce,
      "web-client",
      keys
    )
  ).toEqual({ id: "provider-user", email: "user@example.com" });
  for (const claims of [
    { iss: "https://attacker.example" },
    { aud: "other-app" },
    { exp: 1 },
    { nonce: "other" },
    { sub: "" },
  ]) {
    await expect(
      verifyNativeIdentity(
        "google",
        await token(claims),
        nonce,
        "web-client",
        keys
      )
    ).rejects.toThrow();
  }
  const wrongPair = await generateKeyPair("RS256");
  const forged = await new SignJWT({ sub: "provider-user", nonce })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .sign(wrongPair.privateKey);
  await expect(
    verifyNativeIdentity("google", forged, nonce, "web-client", keys)
  ).rejects.toThrow();
  expect(
    await verifyNativeIdentity(
      "apple",
      await token({
        iss: "https://appleid.apple.com",
        aud: "tech.chiji.pochical",
        email_verified: "true",
      }),
      nonce,
      "tech.chiji.pochical",
      keys
    )
  ).toEqual({ id: "provider-user", email: "user@example.com" });
  expect(
    await verifyNativeIdentity(
      "google",
      await token({ email_verified: false }),
      nonce,
      "web-client",
      keys
    )
  ).toEqual({ id: "provider-user" });
});

test("native login challenges require authentication and reject mismatch, replay and expiry", async () => {
  const t = convexTest(schema, {
    "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
    "../convex/nativeAuth.ts": () => import("../convex/nativeAuth"),
  });
  await expect(
    t.mutation(api.nativeAuth.prepare, { provider: "google", nonce })
  ).rejects.toThrow();
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { isAnonymous: true })
  );
  const user = t.withIdentity({ subject: `${userId}|session` });
  const id = await user.mutation(api.nativeAuth.prepare, {
    provider: "google",
    nonce,
  });
  await expect(
    t.mutation(internal.nativeAuth.consume, { id, provider: "apple", nonce })
  ).rejects.toThrow();
  await expect(
    t.mutation(internal.nativeAuth.consume, {
      id,
      provider: "google",
      nonce: "wrong",
    })
  ).rejects.toThrow();
  await t.mutation(internal.nativeAuth.consume, {
    id,
    provider: "google",
    nonce,
  });
  await expect(
    t.mutation(internal.nativeAuth.consume, { id, provider: "google", nonce })
  ).rejects.toThrow();
  const expired = await t.run((ctx) =>
    ctx.db.insert("nativeAuthChallenges", {
      provider: "google",
      nonce,
      expiresAt: 1,
    })
  );
  await expect(
    t.mutation(internal.nativeAuth.consume, {
      id: expired,
      provider: "google",
      nonce,
    })
  ).rejects.toThrow();
  await t.mutation(internal.nativeAuth.remove, { id: expired });
  await t.mutation(internal.nativeAuth.remove, { id: expired });
  expect(await t.run((ctx) => ctx.db.get(expired))).toBeNull();
});

test("native account creation reuses web provider subjects without merging equal emails", async () => {
  const t = convexTest(schema, {
    "../convex/_generated/api.ts": () => import("../convex/_generated/api"),
    "../convex/auth.ts": () => import("../convex/auth"),
    "../convex/nativeAuth.ts": () => import("../convex/nativeAuth"),
  });
  const webUser = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "same@example.com",
      emailVerificationTime: Date.now(),
    });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "apple",
      providerAccountId: "apple-sub",
    });
    return userId;
  });
  const authenticate = (provider: "apple" | "google", id: string) =>
    t.mutation(internal.auth.store, {
      args: {
        type: "createAccountFromCredentials",
        provider,
        account: { id },
        profile: { email: "same@example.com", isAnonymous: false },
        shouldLinkViaEmail: false,
        shouldLinkViaPhone: false,
      },
    });
  const apple = await authenticate("apple", "apple-sub");
  expect(apple.user._id).toBe(webUser);
  const google = await authenticate("google", "google-sub");
  expect(google.user._id).not.toBe(webUser);
  const again = await authenticate("google", "google-sub");
  expect(again.user._id).toBe(google.user._id);
});
