import { listDurableObjectIds } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import { session } from "../src/db/auth-schema";
import {
  inOneLimitWindow,
  memberOf,
  openSocket,
  ORIGIN,
  signInAnonymously,
  userIdOf,
} from "./helpers";

type Headers = Record<string, string>;

const getMe = async (headers: Headers): Promise<Response> =>
  await exports.default.fetch(`${ORIGIN}/pochical.v1.UserService/GetMe`, {
    body: "{}",
    headers: { "Content-Type": "application/json", ...headers },
    method: "POST",
  });

const upgrade = async (path: string, headers: Headers = {}) =>
  await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { Upgrade: "websocket", ...headers },
  });

describe("anonymous sign-in", () => {
  it("gives a session token that names an anonymous user", async () => {
    const token = await signInAnonymously();

    const response = await getMe({ Authorization: `Bearer ${token}` });
    expect(response.status).toBe(200);
    const me = (await response.json()) as { anonymous: unknown };
    expect(me.anonymous).toBeTruthy();
    await expect(userIdOf(token)).resolves.toMatch(/\S/u);
  });

  it("gives each sign-in its own user", async () => {
    const [first, second] = await Promise.all([
      signInAnonymously(),
      signInAnonymously(),
    ]);
    await expect(userIdOf(first)).resolves.not.toBe(await userIdOf(second));
  });

  it("answers UNAUTHENTICATED without a valid token", async () => {
    const cases: Headers[] = [{}, { Authorization: "Bearer not-a-token" }];
    for (const headers of cases) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const response = await getMe(headers);
      expect(response.status).toBe(401);
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      await expect(response.json()).resolves.toMatchObject({
        code: "unauthenticated",
      });
    }
  });
});

// The code a socket closes with, once it does.
const closeCodeOf = async (socket: WebSocket): Promise<number> => {
  const { promise, resolve } = Promise.withResolvers<number>();
  socket.addEventListener("close", (event) => {
    resolve(event.code);
  });
  return await promise;
};

describe("sockets", () => {
  it("opens the user's own socket", async () => {
    const socket = await openSocket("/v1/me/socket", await signInAnonymously());
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("refuses sockets without a session, whatever header is sent", async () => {
    const spoofed = { "X-Pochical-User": "someone" };
    for (const path of ["/v1/me/socket", "/v1/groups/any/socket"]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const response = await upgrade(path, spoofed);
      expect(response.status).toBe(401);
    }
  });

  it("lets members into their group", async () => {
    const socket = await openSocket(
      "/v1/groups/members-only/socket",
      await memberOf("members-only")
    );
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("keeps others out without creating the group", async () => {
    const token = await signInAnonymously();
    const response = await upgrade("/v1/groups/not-theirs/socket", {
      Authorization: `Bearer ${token}`,
    });
    expect(response.status).toBe(403);
    const ids = await listDurableObjectIds(env.GROUPS);
    const notTheirs = env.GROUPS.idFromName("not-theirs");
    expect(ids.filter((id) => id.equals(notTheirs))).toHaveLength(0);
  });

  it("closes the sockets a session opened once it signs out", async () => {
    const token = await memberOf("signing-out");
    const own = await openSocket("/v1/me/socket", token);
    const group = await openSocket("/v1/groups/signing-out/socket", token);
    const ownClosed = closeCodeOf(own);
    const groupClosed = closeCodeOf(group);

    const response = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-out`,
      {
        body: "{}",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    await expect(ownClosed).resolves.toBe(1000);
    await expect(groupClosed).resolves.toBe(1000);
    // And the session lets nothing in again.
    const again = await upgrade("/v1/me/socket", {
      Authorization: `Bearer ${token}`,
    });
    expect(again.status).toBe(401);
  });
});

describe("what a session keeps", () => {
  it("keeps no address or device", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/api/auth/sign-in/anonymous`,
      {
        body: "{}",
        headers: {
          "CF-Connecting-IP": "203.0.113.1",
          "Content-Type": "application/json",
          "User-Agent": "Pochical/1.0 (iPhone)",
        },
        method: "POST",
      }
    );
    expect(response.status).toBe(200);
    const sessions = await drizzle(env.DB)
      .select({ ipAddress: session.ipAddress, userAgent: session.userAgent })
      .from(session)
      .all();
    expect(sessions.length).toBeGreaterThan(0);
    for (const kept of sessions) {
      expect(kept).toStrictEqual({ ipAddress: null, userAgent: null });
    }
  });

  it("lasts for good, so a user away a long while is still signed in", async () => {
    const token = await signInAnonymously();
    const sessions = await drizzle(env.DB)
      .select({ expiresAt: session.expiresAt })
      .from(session)
      .where(eq(session.userId, await userIdOf(token)))
      .all();
    const inFiftyYears = new Date();
    inFiftyYears.setFullYear(inFiftyYears.getFullYear() + 50);
    expect(sessions.length).toBeGreaterThan(0);
    for (const kept of sessions) {
      expect(kept.expiresAt.getTime()).toBeGreaterThan(inFiftyYears.getTime());
    }
  });

  it("is never refreshed, which would cut it back to 400 days", async () => {
    const token = await signInAnonymously();
    const theirs = eq(session.userId, await userIdOf(token));
    // A session near its end, as better-auth would refresh it.
    const nearItsEnd = new Date(Date.now() + 60_000);
    await drizzle(env.DB)
      .update(session)
      .set({ expiresAt: nearItsEnd })
      .where(theirs)
      .run();

    const response = await getMe({ Authorization: `Bearer ${token}` });
    expect(response.status).toBe(200);
    const kept = await drizzle(env.DB)
      .select({ expiresAt: session.expiresAt })
      .from(session)
      .where(theirs)
      .get();
    expect(kept?.expiresAt.getTime()).toBe(nearItsEnd.getTime());
  });
});

// An anonymous sign-in as it reaches the Worker from a client's address.
const signInFrom = async (address: string): Promise<Response> =>
  await exports.default.fetch(`${ORIGIN}/api/auth/sign-in/anonymous`, {
    body: "{}",
    headers: {
      "CF-Connecting-IP": address,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

describe("rate limits", () => {
  it("holds back anonymous sign-ins from one address", async () => {
    const statuses = await inOneLimitWindow(async (round) => {
      const address = `198.51.100.${round + 1}`;
      const counted: number[] = [];
      for (let attempt = 0; attempt < 21; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- counted in order
        const { status } = await signInFrom(address);
        counted.push(status);
      }
      return counted;
    });
    expect(statuses).toStrictEqual([
      ...Array.from({ length: 20 }, () => 200),
      429,
    ]);
  });
});
