import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";
import { accountToken, idToken, link, providerKeys } from "./provider-helpers";
import type { Provider } from "./provider-helpers";

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

const me = async (token: string) => {
  const response = await call("UserService/GetMe", {}, token);
  const body: unknown = response.ok ? await response.json() : null;
  return {
    anonymous: isRecord(body) && body.anonymous === true,
    status: response.status,
  };
};

const peek = async (token: string, account: unknown) => {
  const response = await call("UserService/PeekAccount", { account }, token);
  const body: unknown = response.ok ? await response.json() : null;
  return { body, status: response.status };
};

describe.each<Provider>(["apple", "google"])(
  "switching to an account in use, with %s",
  (provider) => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** A user linked to the provider's account `subject`, with a group. */
    const accountInUse = async (subject: string) => {
      const token = await signInAnonymously();
      await link(token, provider, await idToken(provider, subject, "n0"), "n0");
      await makeGroup(token);
      return { token, userId: await userIdOf(token) };
    };

    it("says what the account holds to one who proves they hold it", async () => {
      providerKeys();
      const subject = `${provider}-sw1`;
      const theirs = await accountInUse(subject);
      const device = await signInAnonymously();
      const counted = await peek(
        device,
        await accountToken(provider, subject, "n1")
      );
      const own = await peek(
        theirs.token,
        await accountToken(provider, subject, "n2")
      );
      const forged = await peek(device, {
        ...(await accountToken(provider, subject, "n3")),
        nonce: "n4",
      });
      const unnamed = await peek(device, {
        ...(await accountToken(provider, subject, "n5")),
        provider: "SIGN_IN_PROVIDER_UNSPECIFIED",
      });
      expect([
        counted,
        own.status,
        forged.status,
        unnamed.status,
      ]).toStrictEqual([{ body: { groups: 1 }, status: 200 }, 404, 401, 400]);
    });

    it("keeps this device's data, the account's user deleted and the provider linked here", async () => {
      providerKeys();
      const subject = `${provider}-sw2`;
      const theirs = await accountInUse(subject);
      const device = await signInAnonymously();
      const deviceId = await userIdOf(device);
      const taken = await call(
        "UserService/TakeAccount",
        { account: await accountToken(provider, subject, "n5") },
        device
      );
      const linked = await env.DB.prepare(
        "select user_id from account where provider_id = ? and account_id = ?"
      )
        .bind(provider, subject)
        .first<string>("user_id");
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
      providerKeys();
      const subject = `${provider}-sw3`;
      const theirs = await accountInUse(subject);
      const device = await signInAnonymously();
      const signedIn = await exports.default.fetch(
        `${ORIGIN}/api/auth/sign-in/social`,
        {
          body: JSON.stringify({
            idToken: {
              nonce: "n6",
              token: await idToken(provider, subject, "n6"),
            },
            provider,
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
  }
);

/** Apple's token for the Services ID, as Android's sign-in gets it. */
const webToken = async (subject: string, nonce: string) =>
  await idToken("apple", subject, nonce, { aud: env.APPLE_SERVICES_ID });

describe("an Apple account linked on iOS, signed in to from Android's web page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is the same account: in use, counted, and signed in to", async () => {
    providerKeys();
    const subject = "apple-ios-then-android";
    const iPhone = await signInAnonymously();
    await link(iPhone, "apple", await idToken("apple", subject, "n0"), "n0");
    await makeGroup(iPhone);
    const android = await signInAnonymously();
    const linking = await link(
      android,
      "apple",
      await webToken(subject, "n1"),
      "n1"
    );
    const counted = await peek(android, {
      idToken: await webToken(subject, "n2"),
      nonce: "n2",
      provider: "SIGN_IN_PROVIDER_APPLE",
    });
    const signedIn = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-in/social`,
      {
        body: JSON.stringify({
          idToken: { nonce: "n3", token: await webToken(subject, "n3") },
          provider: "apple",
        }),
        headers: {
          Authorization: `Bearer ${android}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    expect([
      linking,
      counted,
      await userIdOf(signedIn.headers.get("set-auth-token") ?? ""),
    ]).toStrictEqual([
      409,
      { body: { groups: 1 }, status: 200 },
      await userIdOf(iPhone),
    ]);
  });
});
