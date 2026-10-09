import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appleKeys, idToken, link } from "./apple-helpers";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A group made by the user, so their account holds something. */
const makeGroup = async (token: string): Promise<void> => {
  await call(
    "GroupService/CreateGroup",
    {
      displayName: "さくら",
      mark: { emoji: "🍉" },
      name: "いとこ会",
      requestId: crypto.randomUUID(),
    },
    token
  );
};

/** A user linked to the Apple account `subject`, with a group. */
const accountInUse = async (subject: string) => {
  const token = await signInAnonymously();
  await link(token, await idToken(subject, "n0"), "n0");
  await makeGroup(token);
  return { token, userId: await userIdOf(token) };
};

const peek = async (token: string, appleIdToken: string, nonce: string) => {
  const response = await call(
    "UserService/PeekAccount",
    { appleIdToken, nonce },
    token
  );
  const body: unknown = response.ok ? await response.json() : null;
  return { body, status: response.status };
};

const me = async (token: string) => {
  const response = await call("UserService/GetMe", {}, token);
  const body: unknown = response.ok ? await response.json() : null;
  return {
    anonymous: isRecord(body) && body.anonymous === true,
    status: response.status,
  };
};

describe("switching to an account in use", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says what the account holds to one who proves they hold it", async () => {
    appleKeys();
    const theirs = await accountInUse("apple-sw1");
    const device = await signInAnonymously();
    const counted = await peek(device, await idToken("apple-sw1", "n1"), "n1");
    const own = await peek(
      theirs.token,
      await idToken("apple-sw1", "n2"),
      "n2"
    );
    const forged = await peek(device, await idToken("apple-sw1", "n3"), "n4");
    expect([counted, own.status, forged.status]).toStrictEqual([
      { body: { groups: 1 }, status: 200 },
      404,
      401,
    ]);
  });

  it("keeps this device's data, the account's user deleted and Apple linked here", async () => {
    appleKeys();
    const theirs = await accountInUse("apple-sw2");
    const device = await signInAnonymously();
    const deviceId = await userIdOf(device);
    const taken = await call(
      "UserService/TakeAccount",
      { appleIdToken: await idToken("apple-sw2", "n5"), nonce: "n5" },
      device
    );
    const linked = await env.DB.prepare(
      "select user_id from account where provider_id = 'apple' and account_id = 'apple-sw2'"
    ).first<string>("user_id");
    expect([
      taken.status,
      await me(theirs.token),
      await me(device),
      linked,
    ]).toStrictEqual([
      200,
      { anonymous: false, status: 401 },
      { anonymous: false, status: 200 },
      deviceId,
    ]);
  });

  it("signs in to the account's data with the same token, the device's user kept until deleted", async () => {
    appleKeys();
    const theirs = await accountInUse("apple-sw3");
    const device = await signInAnonymously();
    const signedIn = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-in/social`,
      {
        body: JSON.stringify({
          idToken: { nonce: "n6", token: await idToken("apple-sw3", "n6") },
          provider: "apple",
        }),
        headers: {
          Authorization: `Bearer ${device}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    const token = signedIn.headers.get("set-auth-token") ?? "";
    const stillThere = await me(device);
    expect([
      signedIn.status,
      await userIdOf(token),
      stillThere.status,
    ]).toStrictEqual([200, theirs.userId, 200]);
  });
});
