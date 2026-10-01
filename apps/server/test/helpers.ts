import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

export const ORIGIN = "https://server.test";

/** Signs in anonymously and returns the session token the bearer plugin hands back. */
export const signInAnonymously = async (): Promise<string> => {
  const response = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-in/anonymous`,
    { method: "POST" }
  );
  expect(response.status).toBe(200);
  const token = response.headers.get("set-auth-token");
  if (token === null) {
    throw new Error("Sign-in gave no set-auth-token header");
  }
  return token;
};

/** The user id a session token belongs to, from UserService.GetMe. */
export const userIdOf = async (token: string): Promise<string> => {
  const response = await exports.default.fetch(
    `${ORIGIN}/pochical.v1.UserService/GetMe`,
    {
      body: "{}",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  );
  const { userId } = (await response.json()) as { userId: string };
  return userId;
};

/** A signed-in member of the group, as their session token. */
export const memberOf = async (groupId: string): Promise<string> => {
  const token = await signInAnonymously();
  await env.USERS.getByName(await userIdOf(token)).addMembership(groupId);
  return token;
};

/** Opens a socket at the path, expecting it to be accepted. */
export const openSocket = async (
  path: string,
  token: string
): Promise<WebSocket> => {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) {
    throw new Error("Upgrade response had no WebSocket");
  }
  socket.accept();
  return socket;
};
