import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appleKeys, idToken, link } from "./apple-helpers";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";

const STAFF = "staff@pochical.app";

/** A user linked to the Apple account `subject`. */
const linkedUser = async (subject: string) => {
  const token = await signInAnonymously();
  await link(token, await idToken(subject, "n0"), "n0");
  return { token, userId: await userIdOf(token) };
};

/** Signing in with Apple to the account `subject`, from a new device. */
const signInWithApple = async (subject: string, nonce: string) => {
  const device = await signInAnonymously();
  const response = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-in/social`,
    {
      body: JSON.stringify({
        idToken: { nonce, token: await idToken(subject, nonce) },
        provider: "apple",
      }),
      headers: {
        Authorization: `Bearer ${device}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );
  const body: unknown = response.ok ? null : await response.json();
  return { body, device, status: response.status };
};

describe("suspending a user", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signs out every device of theirs and refuses their sign-in with Apple", async () => {
    appleKeys();
    const { token, userId } = await linkedUser("apple-su1");
    await expect(
      exports.AdminEntrypoint.suspend(userId, true, STAFF)
    ).resolves.toBeTruthy();
    const me = await call("UserService/GetMe", {}, token);
    const refused = await signInWithApple("apple-su1", "n1");
    expect([me.status, refused.status, refused.body]).toStrictEqual([
      401,
      403,
      expect.objectContaining({ code: "USER_SUSPENDED" }),
    ]);
    const page = await exports.AdminEntrypoint.user(userId);
    expect(page?.suspendedAtMs).toBeTypeOf("number");
  });

  it("refuses switching to a suspended account, or taking its Apple account away", async () => {
    appleKeys();
    const { userId } = await linkedUser("apple-su2");
    await exports.AdminEntrypoint.suspend(userId, true, STAFF);
    const device = await signInAnonymously();
    const peeked = await call(
      "UserService/PeekAccount",
      { appleIdToken: await idToken("apple-su2", "n2"), nonce: "n2" },
      device
    );
    const taken = await call(
      "UserService/TakeAccount",
      { appleIdToken: await idToken("apple-su2", "n3"), nonce: "n3" },
      device
    );
    const stillTheirs = await env.DB.prepare(
      "select user_id from account where provider_id = 'apple' and account_id = 'apple-su2'"
    ).first<string>("user_id");
    // Connect answers PERMISSION_DENIED as 403.
    expect([peeked.status, taken.status, stillTheirs]).toStrictEqual([
      403,
      403,
      userId,
    ]);
  });

  it("lets them sign in again once let back, and notes both in 記録", async () => {
    appleKeys();
    const { userId } = await linkedUser("apple-su3");
    await exports.AdminEntrypoint.suspend(userId, true, STAFF);
    await exports.AdminEntrypoint.suspend(userId, false, STAFF);
    const again = await signInWithApple("apple-su3", "n4");
    const actions = await exports.AdminEntrypoint.actions();
    expect([
      again.status,
      actions
        .filter((action) => action.target === userId)
        .map((action) => action.action),
    ]).toStrictEqual([200, ["unsuspend", "suspend"]]);
  });

  it("suspends no one for an id with no account", async () => {
    await expect(
      exports.AdminEntrypoint.suspend(crypto.randomUUID(), true, STAFF)
    ).resolves.toBeFalsy();
  });
});
