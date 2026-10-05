import { env, exports } from "cloudflare:workers";
import { expect } from "vitest";

export const ORIGIN = "https://server.test";

/** Signs in anonymously and returns the session token the bearer plugin hands back. */
export const signInAnonymously = async (): Promise<string> => {
  const response = await exports.default.fetch(
    `${ORIGIN}/api/auth/sign-in/anonymous`,
    // As the apps send it: better-auth wants a JSON body.
    {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
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
  await env.USERS.getByName(await userIdOf(token)).addMembership(groupId, {
    emoji: "🍉",
    name: "テスト",
  });
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

/** A Connect JSON call, as the apps make one, with the session token. */
export const call = async (
  method: string,
  body: Record<string, unknown>,
  token?: string
): Promise<Response> =>
  await exports.default.fetch(`${ORIGIN}/pochical.v1.${method}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    method: "POST",
  });

// The limiters (wrangler.jsonc's `ratelimits`) count in windows of `period`
// seconds, and miniflare lines its windows up with the clock: a run of
// requests that crosses into the next minute is counted in two windows and
// may never reach the limit.
const LIMIT_PERIOD_MS = 60_000;
const LIMIT_ROUNDS = 3;

/**
 * Runs `run` until one round of it falls inside a single limiter window, and
 * returns that round's result. A round that crossed a window's end counts for
 * nothing, so the next round starts over; `run` is given the round's number
 * to make fresh keys from, untouched by the rounds before.
 */
export const inOneLimitWindow = async <T>(
  run: (round: number) => Promise<T>
): Promise<T> => {
  for (let round = 0; round < LIMIT_ROUNDS; round += 1) {
    // Before the first request is sent and after the last answer arrives,
    // so every count the limiter made falls between the two.
    const window = Math.floor(Date.now() / LIMIT_PERIOD_MS);
    // oxlint-disable-next-line no-await-in-loop -- a round at a time
    const result = await run(round);
    if (Math.floor(Date.now() / LIMIT_PERIOD_MS) === window) {
      return result;
    }
  }
  throw new Error(`No round of ${LIMIT_ROUNDS} fell inside one limit window`);
};
