import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  call,
  memberOf,
  openSocket,
  ORIGIN,
  signInAnonymously,
  userIdOf,
} from "./helpers";
import { accountToken, idToken, link, providerKeys } from "./provider-helpers";
import type { Provider } from "./provider-helpers";

const STAFF = "staff@pochical.app";

/** A user linked to the provider's account `subject`. */
const linkedUser = async (provider: Provider, subject: string) => {
  const token = await signInAnonymously();
  await link(token, provider, await idToken(provider, subject, "n0"), "n0");
  return { token, userId: await userIdOf(token) };
};

/** Signing in with the provider to the account `subject`, from a new device. */
const signInWith = async (
  provider: Provider,
  subject: string,
  nonce: string
) => {
  const device = await signInAnonymously();
  const response = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-in/social`,
    {
      body: JSON.stringify({
        idToken: { nonce, token: await idToken(provider, subject, nonce) },
        provider,
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

/** The code a socket closes with, once it does. */
const closed = async (socket: WebSocket): Promise<number> => {
  const { promise, resolve } = Promise.withResolvers<number>();
  socket.addEventListener("close", (event) => {
    resolve(event.code);
  });
  return await promise;
};

describe.each<Provider>(["apple", "google"])(
  "suspending a user who signs in with %s",
  (provider) => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("signs out every device of theirs and refuses their sign-in with it", async () => {
      providerKeys();
      const { token, userId } = await linkedUser(provider, `${provider}-su1`);
      await expect(
        exports.AdminEntrypoint.suspend(userId, true, STAFF)
      ).resolves.toBeTruthy();
      const me = await call("UserService/GetMe", {}, token);
      const refused = await signInWith(provider, `${provider}-su1`, "n1");
      expect([me.status, refused.status, refused.body]).toStrictEqual([
        401,
        403,
        expect.objectContaining({ code: "USER_SUSPENDED" }),
      ]);
      const page = await exports.AdminEntrypoint.user(userId);
      expect(page?.suspendedAtMs).toBeTypeOf("number");
    });

    it("refuses switching to a suspended account, or taking its account away", async () => {
      providerKeys();
      const { userId } = await linkedUser(provider, `${provider}-su2`);
      await exports.AdminEntrypoint.suspend(userId, true, STAFF);
      const device = await signInAnonymously();
      const peeked = await call(
        "UserService/PeekAccount",
        { account: await accountToken(provider, `${provider}-su2`, "n2") },
        device
      );
      const taken = await call(
        "UserService/TakeAccount",
        { account: await accountToken(provider, `${provider}-su2`, "n3") },
        device
      );
      const stillTheirs = await env.DB.prepare(
        "select user_id from account where provider_id = ? and account_id = ?"
      )
        .bind(provider, `${provider}-su2`)
        .first<string>("user_id");
      // Connect answers PERMISSION_DENIED as 403.
      expect([peeked.status, taken.status, stillTheirs]).toStrictEqual([
        403,
        403,
        userId,
      ]);
    });

    it("lets them sign in again once let back, and notes both in 記録", async () => {
      providerKeys();
      const { userId } = await linkedUser(provider, `${provider}-su3`);
      await exports.AdminEntrypoint.suspend(userId, true, STAFF);
      await exports.AdminEntrypoint.suspend(userId, false, STAFF);
      const again = await signInWith(provider, `${provider}-su3`, "n4");
      const actions = await exports.AdminEntrypoint.actions();
      expect([
        again.status,
        actions
          .filter((action) => action.target === userId)
          .map((action) => action.action),
      ]).toStrictEqual([200, ["unsuspend", "suspend"]]);
    });
  }
);

describe("suspending a user", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("closes the sockets their sessions opened, in their groups too", async () => {
    const token = await memberOf("suspending");
    const own = await openSocket("/v1/me/socket", token);
    const group = await openSocket("/v1/groups/suspending/socket", token);
    const ownClosed = closed(own);
    const groupClosed = closed(group);
    await exports.AdminEntrypoint.suspend(await userIdOf(token), true, STAFF);
    await expect(Promise.all([ownClosed, groupClosed])).resolves.toStrictEqual([
      1000, 1000,
    ]);
  });

  it("keeps when the suspension began, suspended again", async () => {
    const { userId } = await linkedUser("apple", "apple-su4");
    await exports.AdminEntrypoint.suspend(userId, true, STAFF);
    const first = await exports.AdminEntrypoint.user(userId);
    await exports.AdminEntrypoint.suspend(userId, true, STAFF);
    const again = await exports.AdminEntrypoint.user(userId);
    expect(again?.suspendedAtMs).toBe(first?.suspendedAtMs);
  });

  it("suspends no one for an id with no account", async () => {
    await expect(
      exports.AdminEntrypoint.suspend(crypto.randomUUID(), true, STAFF)
    ).resolves.toBeFalsy();
  });
});
