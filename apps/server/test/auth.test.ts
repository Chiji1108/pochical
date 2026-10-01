import { listDurableObjectIds } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
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
});
