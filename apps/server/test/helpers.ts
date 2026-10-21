import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { expect } from "vitest";

import { photosPage } from "../src/group-chat";
import { chatLines, memberBlocks } from "../src/group-do-schema";

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

/**
 * A signed-in member of the group, as their session token: its maker when
 * the group is new, else someone added to it.
 */
export const memberOf = async (groupId: string): Promise<string> => {
  const token = await signInAnonymously();
  const userId = await userIdOf(token);
  const member = { ownName: null, userId, usualName: "テスト", usualPhoto: "" };
  const group = env.GROUPS.getByName(groupId);
  await env.USERS.getByName(userId).noteGroup(groupId);
  const made = await group.create(
    {
      mark: { color: 0, emoji: "🍉", icon: "", letter: "", photoId: "" },
      name: "テスト",
    },
    member
  );
  if (!made) {
    await group.addMember(member);
  }
  return token;
};

/**
 * Has the group's telling of `userId`'s own DO of their membership go
 * through `takeMembership` instead, failing as an unreachable DO would
 * unless given another, until the function it gives back is called.
 */
export const failTelling = async (
  groupId: string,
  userId: string,
  takeMembership: (...news: unknown[]) => Promise<void> = () => {
    throw new Error("unreachable");
  }
): Promise<() => Promise<void>> => {
  const group = env.GROUPS.getByName(groupId);
  const users = {
    getByName: (name: string) =>
      name === userId ? { takeMembership } : env.USERS.getByName(name),
  };
  await runInDurableObject(group, (instance) => {
    Reflect.set(
      instance,
      "env",
      new Proxy(env, {
        get: (target, key): unknown =>
          key === "USERS" ? users : Reflect.get(target, key),
      })
    );
  });
  return async () => {
    await runInDurableObject(group, (instance) => {
      Reflect.set(instance, "env", env);
    });
  };
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

/**
 * A line of a chat laid straight into a group's database, by what makes
 * its photos seen or not: how many it holds, none for words.
 */
export type PhotoLine = {
  authorId: string;
  hiddenFrom?: string;
  photos: number;
  seq: number;
  threadId?: string;
  unsent?: boolean;
};

/**
 * A line's photo as spec/vectors/chat-photos.json names it: its line's
 * seq, and a letter for its place in the line.
 */
export const photoName = (seq: number, at: number): string =>
  `${seq}${String.fromCodePoint(("a".codePointAt(0) ?? 0) + at)}`;

/** A PhotoLine's photos as its row keeps them, none for words. */
const photosOf = ({ photos, seq }: PhotoLine) =>
  photos === 0
    ? null
    : Array.from({ length: photos }, (_, at) => ({
        height: 1,
        id: photoName(seq, at),
        width: 1,
      }));

/**
 * What a ChatPhotosRequest answers `userId` (photosPage), the page's
 * photos as photoName names them, in a new group whose chats hold `lines`
 * and where `userId` has blocked `blocked`.
 */
export const photosAmong = async ({
  after,
  blocked = [],
  lines,
  seq,
  size,
  threadId = "group",
  userId,
}: {
  after: boolean;
  blocked?: string[];
  lines: PhotoLine[];
  seq: number;
  size?: number;
  threadId?: string;
  userId: string;
}): Promise<{ offset: number; photos: string[]; total: number }> =>
  await runInDurableObject(
    env.GROUPS.getByName(crypto.randomUUID()),
    (_, state) => {
      const db = drizzle(state.storage);
      for (const [index, line] of lines.entries()) {
        db.insert(chatLines)
          .values({
            authorId: line.authorId,
            createdCursor: index + 1,
            cursor: index + 1,
            hiddenFrom: line.hiddenFrom ?? null,
            opId: `op-${index}`,
            photos: photosOf(line),
            sentAt: new Date(line.seq),
            seq: line.seq,
            text: "",
            threadId: line.threadId ?? "group",
            unsent: line.unsent ?? false,
          })
          .run();
      }
      for (const blockedId of blocked) {
        db.insert(memberBlocks).values({ blockedId, userId }).run();
      }
      const page = photosPage(db, userId, threadId, BigInt(seq), after, size);
      return {
        offset: page.offset,
        photos: page.photos.map((entry) => entry.photo?.id ?? ""),
        total: page.total,
      };
    }
  );
