import {
  GROUP_END_MIN_HOURS,
  GROUP_END_NOTICE_HOURS,
} from "@pochical/design/limits";
import { socketRules } from "@pochical/design/socket";
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

import { invites } from "../src/db/schema";
import { ChatNotice_Kind } from "../src/gen/pochical/v1/sync_pb";
import type { ServerFrame } from "../src/gen/pochical/v1/sync_pb";
import { photoKey } from "../src/photos";
import { alarmOf, runAlarm } from "./alarms";
import {
  call,
  failTelling,
  ORIGIN,
  signInAnonymously,
  userIdOf,
} from "./helpers";
import {
  changesIn,
  device,
  pair,
  PAIR_ROSTER,
  settled,
  syncSocket,
} from "./sync-helpers";

// A group's end: set by any member, said in its chat, and the group gone
// for everyone once it has passed (spec/sync-protocol.md, A group's end).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// The nearest an end may be set.
const MIN_MS = GROUP_END_MIN_HOURS * HOUR_MS;
// How long before its end a group says it ends soon.
const NOTICE_MS = GROUP_END_NOTICE_HOURS * HOUR_MS;
// An end far enough off that its coming is not yet said.
const FAR_MS = 30 * DAY_MS;
// Two devices' APNs tokens.
const MAKER_TOKEN = "a1".repeat(32);
const GUEST_TOKEN = "c3".repeat(32);

const registerToken = async (session: string, token: string): Promise<void> => {
  await call(
    "UserService/RegisterPushToken",
    { platform: "PUSH_PLATFORM_APNS", sandbox: true, token },
    session
  );
};

/** What reached APNs, each with the device it was for, all taken. */
const apnsCalls = () => {
  const calls: { body: unknown; token: string }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      body: await request.json(),
      token: request.url.split("/").at(-1) ?? "",
    });
    return new Response(null, { status: 200 });
  });
  return calls;
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);

/** SetGroupEnd as the apps call it: the answer's status. */
const setEnd = async (
  groupId: string,
  endsAt: number,
  token: string
): Promise<number> => {
  const response = await call(
    "GroupService/SetGroupEnd",
    { endsAtMs: String(endsAt), groupId },
    token
  );
  return response.status;
};

const createGroup = async (
  endsAt: number,
  token: string,
  requestId: string = crypto.randomUUID()
): Promise<Response> =>
  await call(
    "GroupService/CreateGroup",
    {
      displayName: "さくら",
      endsAtMs: String(endsAt),
      mark: { emoji: "🍻" },
      name: "忘年会",
      requestId,
    },
    token
  );

/** What `run` gives with the clock at `at`, the group's alarm not run. */
const atTime = async <T>(time: number, run: () => Promise<T>): Promise<T> => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(time);
  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
};

/**
 * The group's telling `userId`'s DO of their place in it failing until
 * restored, its other calls to that DO going through.
 */
const failJoiningNews = async (
  groupId: string,
  userId: string
): Promise<() => Promise<void>> => {
  const theirs = env.USERS.getByName(userId);
  return await failTelling(
    groupId,
    userId,
    () => {
      throw new Error("unreachable");
    },
    {
      setUnread: async (...count: Parameters<typeof theirs.setUnread>) =>
        await theirs.setUnread(...count),
    }
  );
};

/**
 * What the group still owes its members' DOs made due now, its news and
 * its notifications that it ends soon: how many of those are still owed.
 */
const owedDueNow = async (groupId: string): Promise<number> =>
  await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) => {
    state.storage.sql.exec("update membership_outbox set due_at = 0");
    state.storage.sql.exec("update end_notice_outbox set due_at = 0");
    return state.storage.sql
      .exec("select user_id from end_notice_outbox")
      .toArray().length;
  });

const groupSocket = async (
  groupId: string,
  token: string,
  cursor = PAIR_ROSTER
) => await syncSocket(`/v1/groups/${groupId}/socket`, token, cursor);

// A frame's news of the group's end: the group's value, and the chat's
// notice lines with who wrote each.
const endIn = (frame: ServerFrame) =>
  changesIn(frame).flatMap(({ kind }): object[] => {
    if (kind.case === "groupProfile") {
      return [{ endsAtMs: kind.value.endsAtMs }];
    }
    const content =
      kind.case === "chatLine" ? kind.value.content?.kind : undefined;
    return kind.case === "chatLine" && content?.case === "notice"
      ? [{ authorId: kind.value.authorId, notice: content.value }]
      : [];
  });

/** The group's alarm run as it would be at `at`. */
const alarmAt = async (groupId: string, at: number): Promise<void> => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  try {
    await runAlarm(env.GROUPS.getByName(groupId));
  } finally {
    vi.useRealTimers();
  }
};

/** Whether the group is still set up. */
const isThere = async (groupId: string): Promise<boolean> =>
  (await env.GROUPS.getByName(groupId).getProfile()) !== null;

const closeCodeOf = async (socket: WebSocket): Promise<number> => {
  const { promise, resolve } = Promise.withResolvers<number>();
  socket.addEventListener("close", (event) => {
    resolve(event.code);
  });
  return await promise;
};

const hasInvite = async (groupId: string): Promise<boolean> => {
  const row = await drizzle(env.DB)
    .select()
    .from(invites)
    .where(eq(invites.groupId, groupId))
    .get();
  return row !== undefined;
};

/** A photo uploaded to the group's photos: its key in the bucket. */
const uploadPhoto = async (groupId: string, token: string): Promise<string> => {
  const photoId = crypto.randomUUID();
  await exports.default.fetch(
    `${ORIGIN}/v1/groups/${groupId}/photos/${photoId}`,
    { body: JPEG, headers: { Authorization: `Bearer ${token}` }, method: "PUT" }
  );
  return photoKey(groupId, photoId);
};

/** Nothing more came on the socket: a Ping's Pong is the next frame. */
const quiet = async ({
  frames,
  socket,
}: Awaited<ReturnType<typeof groupSocket>>): Promise<boolean> => {
  const frame = await settled(socket, frames);
  return frame.kind.case === "pong";
};

describe("setting a group's end", () => {
  it("is any member's, later or earlier, each said in the chat", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const mine = await groupSocket(groupId, maker);
    const first = Date.now() + FAR_MS;

    await setEnd(groupId, first, maker);
    expect(endIn(await mine.frames.next())).toMatchObject([
      { endsAtMs: BigInt(first) },
      {
        authorId: makerId,
        notice: { endsAtMs: BigInt(first), kind: ChatNotice_Kind.END_SET },
      },
    ]);

    const later = first + 30 * DAY_MS;
    await setEnd(groupId, later, guest);
    expect(endIn(await mine.frames.next())).toMatchObject([
      { endsAtMs: BigInt(later) },
      {
        authorId: guestId,
        notice: { endsAtMs: BigInt(later), kind: ChatNotice_Kind.END_SET },
      },
    ]);

    // The same end again changes nothing and says nothing.
    await setEnd(groupId, later, maker);
    await expect(quiet(mine)).resolves.toBeTruthy();
  });

  it("is taken away by any member, said in the chat", async () => {
    const { groupId, guest, maker } = await pair();
    await setEnd(groupId, Date.now() + FAR_MS, maker);
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 2n);

    await expect(setEnd(groupId, 0, guest)).resolves.toBe(200);
    expect(endIn(await mine.frames.next())).toMatchObject([
      { endsAtMs: 0n },
      {
        authorId: await userIdOf(guest),
        notice: { endsAtMs: 0n, kind: ChatNotice_Kind.END_CLEARED },
      },
    ]);
    await expect(env.GROUPS.getByName(groupId).endsAt()).resolves.toBeNull();
  });

  it("is members' alone, and never less than GROUP_END_MIN_HOURS away", async () => {
    const { groupId, maker } = await pair();
    const stranger = await signInAnonymously();
    await expect(setEnd(groupId, Date.now() + FAR_MS, stranger)).resolves.toBe(
      403
    );
    await expect(setEnd(groupId, Date.now() - 1, maker)).resolves.toBe(400);
    await expect(
      setEnd(groupId, Date.now() + MIN_MS - HOUR_MS, maker)
    ).resolves.toBe(400);
    await expect(env.GROUPS.getByName(groupId).endsAt()).resolves.toBeNull();
  });

  it("comes with a group made with one, and shows before joining", async () => {
    const maker = await signInAnonymously();
    const endsAt = Date.now() + FAR_MS;
    const made = await createGroup(endsAt, maker);
    const { groupId, inviteCode } = (await made.json()) as {
      groupId: string;
      inviteCode: string;
    };
    const mine = await groupSocket(groupId, maker, 0n);
    expect(endIn(await mine.frames.next())).toMatchObject([
      { endsAtMs: BigInt(endsAt) },
      {
        authorId: await userIdOf(maker),
        notice: { endsAtMs: BigInt(endsAt), kind: ChatNotice_Kind.END_SET },
      },
    ]);
    const invite = await call(
      "GroupService/GetInvite",
      { inviteCode },
      await signInAnonymously()
    );
    await expect(invite.json()).resolves.toMatchObject({
      endsAtMs: String(endsAt),
    });

    const soon = await createGroup(Date.now() + MIN_MS - HOUR_MS, maker);
    expect(soon.status).toBe(400);
  });

  it("is a moment a date can be", async () => {
    const { groupId, maker } = await pair();
    // Past the last moment there is: no date, so no end to keep or tell.
    await expect(setEnd(groupId, 8_640_000_000_000_001, maker)).resolves.toBe(
      400
    );
    await expect(setEnd(groupId, Number.MAX_SAFE_INTEGER, maker)).resolves.toBe(
      400
    );
    await expect(setEnd(groupId, -1, maker)).resolves.toBe(400);
    await expect(env.GROUPS.getByName(groupId).endsAt()).resolves.toBeNull();
  });

  it("is not set by someone taken out as the call came", async () => {
    const { groupId, maker } = await pair();
    const stranger = await userIdOf(await signInAnonymously());
    const group = env.GROUPS.getByName(groupId);
    await expect(
      group.setEnd(Date.now() + FAR_MS, stranger)
    ).resolves.toBeFalsy();
    await expect(group.endsAt()).resolves.toBeNull();
    await expect(setEnd(groupId, Date.now() + FAR_MS, maker)).resolves.toBe(
      200
    );
  });

  it("answers a group made again with the group, its end come since", async () => {
    const maker = await signInAnonymously();
    const endsAt = Date.now() + DAY_MS;
    const requestId = crypto.randomUUID();
    const made = await createGroup(endsAt, maker, requestId);
    const { groupId } = (await made.json()) as { groupId: string };
    // The answer lost, the same request comes after the end it asked for.
    const again = await atTime(
      endsAt + 1,
      async () => await createGroup(endsAt, maker, requestId)
    );
    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toMatchObject({ groupId });
  });

  it("has its alarm set again by a group made again", async () => {
    const maker = await signInAnonymously();
    const endsAt = Date.now() + FAR_MS;
    const requestId = crypto.randomUUID();
    const made = await createGroup(endsAt, maker, requestId);
    const { groupId } = (await made.json()) as { groupId: string };
    const group = env.GROUPS.getByName(groupId);
    // As a first try cut off after the group was written leaves it.
    await runInDurableObject(group, async (_, state) => {
      await state.storage.deleteAlarm();
    });
    await createGroup(endsAt, maker, requestId);
    await expect(alarmOf(group)).resolves.toBe(endsAt - NOTICE_MS);
  });
});

describe("a group's end coming", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is said in the chat once, GROUP_END_NOTICE_HOURS before, by no one", async () => {
    const { groupId, maker } = await pair();
    const endsAt = Date.now() + NOTICE_MS + 2 * DAY_MS;
    await setEnd(groupId, endsAt, maker);
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 2n);
    const soon = endsAt - NOTICE_MS;

    // Not before its time.
    await alarmAt(groupId, soon - 1);
    await expect(quiet(mine)).resolves.toBeTruthy();

    await alarmAt(groupId, soon);
    expect(endIn(await mine.frames.next())).toMatchObject([
      {
        authorId: "",
        notice: { endsAtMs: BigInt(endsAt), kind: ChatNotice_Kind.ENDS_SOON },
      },
    ]);
    // Once: a later run says nothing more, and the group is still there.
    await alarmAt(groupId, soon + HOUR_MS);
    await expect(quiet(mine)).resolves.toBeTruthy();
    await expect(isThere(groupId)).resolves.toBeTruthy();
  });

  it("notifies every member once, a chat turned off too, worded by the app", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(maker, MAKER_TOKEN);
    await registerToken(guest, GUEST_TOKEN);
    await call(
      "UserService/SetChatMuted",
      { groupId, muted: true, threadId: "group" },
      guest
    );
    const endsAt = Date.now() + NOTICE_MS + 2 * DAY_MS;
    const calls = apnsCalls();
    await setEnd(groupId, endsAt, maker);
    // Setting it notifies no one.
    await alarmAt(groupId, endsAt - NOTICE_MS - 1);
    expect(calls).toHaveLength(0);

    await alarmAt(groupId, endsAt - NOTICE_MS);
    expect(calls.map(({ token }) => token).toSorted()).toStrictEqual(
      [MAKER_TOKEN, GUEST_TOKEN].toSorted()
    );
    const toGuest = calls.find(({ token }) => token === GUEST_TOKEN);
    // The moment it ends, which each device words as its own day; of no
    // line, so with no writer and nothing to answer.
    expect(toGuest?.body).toStrictEqual({
      aps: {
        alert: {
          "loc-args": [String(endsAt)],
          "loc-key": "GROUP_ENDS",
          "title-loc-args": ["いとこ会"],
          "title-loc-key": "CHAT_TITLE",
        },
        badge: 0,
        "mutable-content": 1,
        sound: "default",
        "thread-id": `${groupId}/group`,
      },
      groupId,
      recipientId: await userIdOf(guest),
      threadId: "group",
    });
    await alarmAt(groupId, endsAt - HOUR_MS);
    expect(calls).toHaveLength(2);
  });

  it("is said and notified at once for an end set nearer than that", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(guest, GUEST_TOKEN);
    const calls = apnsCalls();
    const near = Date.now() + DAY_MS;
    await setEnd(groupId, near, maker);
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 2n);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(endIn(await mine.frames.next())).toMatchObject([
      {
        authorId: "",
        notice: { endsAtMs: BigInt(near), kind: ChatNotice_Kind.ENDS_SOON },
      },
    ]);
    expect(calls).toHaveLength(1);

    // Moved, still near: said and notified anew, with the new end.
    const nearer = near - HOUR_MS;
    await setEnd(groupId, nearer, guest);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls.map(({ body }) => body)).toMatchObject([
      { aps: { alert: { "loc-args": [String(near)] } } },
      { aps: { alert: { "loc-args": [String(nearer)] } } },
    ]);
  });

  it("comes anew for an end moved later, and not at all for one taken away", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(guest, GUEST_TOKEN);
    const calls = apnsCalls();
    await setEnd(groupId, Date.now() + DAY_MS, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls).toHaveLength(1);

    // Moved out past the hours: nothing until its own time comes.
    const far = Date.now() + NOTICE_MS + 30 * DAY_MS;
    await setEnd(groupId, far, maker);
    await alarmAt(groupId, far - NOTICE_MS - 1);
    expect(calls).toHaveLength(1);
    await alarmAt(groupId, far - NOTICE_MS);
    expect(calls).toHaveLength(2);

    // Taken away after an end moved again: its time goes with it, and
    // the group stays past the end it had.
    await setEnd(groupId, far + DAY_MS, maker);
    await setEnd(groupId, 0, maker);
    await alarmAt(groupId, far + 2 * DAY_MS);
    expect(calls).toHaveLength(2);
    await expect(isThere(groupId)).resolves.toBeTruthy();
  });

  it("is told as a mention is: not to a chat turned off once mentions do not notify", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(guest, GUEST_TOKEN);
    await call(
      "UserService/SetChatMuted",
      { groupId, muted: true, threadId: "group" },
      guest
    );
    await call(
      "UserService/SetChatNotifications",
      { mentionsWhenMuted: false },
      guest
    );
    const calls = apnsCalls();
    await setEnd(groupId, Date.now() + DAY_MS, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls).toHaveLength(0);
  });
});

describe("a group whose end has come, its alarm still to end it", () => {
  it("takes no one in and shows no invitation", async () => {
    const { groupId, inviteCode, maker } = await pair();
    const endsAt = Date.now() + FAR_MS;
    await setEnd(groupId, endsAt, maker);
    const stranger = await signInAnonymously();
    const [join, invite] = await atTime(
      endsAt,
      async () =>
        await Promise.all([
          call(
            "GroupService/JoinGroup",
            { displayName: "あや", inviteCode },
            stranger
          ),
          call("GroupService/GetInvite", { inviteCode }, stranger),
        ])
    );
    expect([join.status, invite.status]).toStrictEqual([404, 404]);
    await expect(
      env.USERS.getByName(await userIdOf(stranger)).isMember(groupId)
    ).resolves.toBeFalsy();
  });

  it("takes no new end, nor any other change, and ends all the same", async () => {
    const { groupId, guest, maker } = await pair();
    const endsAt = Date.now() + FAR_MS;
    await setEnd(groupId, endsAt, maker);
    const [moved, renamed] = await atTime(
      endsAt,
      async () =>
        await Promise.all([
          setEnd(groupId, endsAt + FAR_MS, guest),
          call(
            "GroupService/RenameGroup",
            { groupId, mark: { emoji: "🍉" }, name: "つづき" },
            maker
          ),
        ])
    );
    // Gone to its members already: not answered as saved.
    expect([moved, renamed.status]).toStrictEqual([403, 403]);
    await expect(env.GROUPS.getByName(groupId).endsAt()).resolves.toBe(endsAt);
    await alarmAt(groupId, endsAt);
    await expect(isThere(groupId)).resolves.toBeFalsy();
  });
});

describe("the notification that a group ends soon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is owed to a member until their own DO has taken it", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(maker, MAKER_TOKEN);
    await registerToken(guest, GUEST_TOKEN);
    const calls = apnsCalls();
    const restore = await failTelling(groupId, await userIdOf(guest));
    await setEnd(groupId, Date.now() + DAY_MS, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    // The maker's went; the guest's DO could not be reached.
    expect(calls.map(({ token }) => token)).toStrictEqual([MAKER_TOKEN]);

    await restore();
    await expect(owedDueNow(groupId)).resolves.toBe(1);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls.map(({ token }) => token)).toStrictEqual([
      MAKER_TOKEN,
      GUEST_TOKEN,
    ]);
    // Taken: owed no more, and not sent again.
    await expect(owedDueNow(groupId)).resolves.toBe(0);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls).toHaveLength(2);
  });

  it("stays owed to a member whose own DO has not heard they joined", async () => {
    const { groupId, inviteCode, maker } = await pair();
    const late = await signInAnonymously();
    const lateId = await userIdOf(late);
    await registerToken(late, GUEST_TOKEN);
    const calls = apnsCalls();
    // In the group, the news of it not reaching their own DO: only that
    // call fails, the rest going to their DO as ever.
    const restore = await failJoiningNews(groupId, lateId);
    await call(
      "GroupService/JoinGroup",
      { displayName: "あや", inviteCode },
      late
    );
    await setEnd(groupId, Date.now() + DAY_MS, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    // Their DO, not listing the group, sends nothing: still owed.
    expect(calls).toHaveLength(0);

    await restore();
    await owedDueNow(groupId);
    await runAlarm(env.GROUPS.getByName(groupId));
    // The alarm tried the notice before the news went: owed until the
    // run after, whichever order the two are told in.
    await owedDueNow(groupId);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls.map(({ token }) => token)).toStrictEqual([GUEST_TOKEN]);
    await expect(owedDueNow(groupId)).resolves.toBe(0);
  });

  it("stays owed while their DO cannot read their devices", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(guest, GUEST_TOKEN);
    const calls = apnsCalls();
    const guestDo = env.USERS.getByName(await userIdOf(guest));
    // D1 out of reach as the guest's DO looks their devices up.
    await runInDurableObject(guestDo, (instance) => {
      const failing = new Proxy(env.DB, {
        get: (target, key): unknown =>
          key === "prepare"
            ? () => {
                throw new Error("D1 out of reach");
              }
            : Reflect.get(target, key),
      });
      Reflect.set(
        instance,
        "env",
        new Proxy(env, {
          get: (target, key): unknown =>
            key === "DB" ? failing : Reflect.get(target, key),
        })
      );
    });
    await setEnd(groupId, Date.now() + DAY_MS, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls).toHaveLength(0);
    await expect(owedDueNow(groupId)).resolves.toBe(1);

    await runInDurableObject(guestDo, (instance) => {
      Reflect.set(instance, "env", env);
    });
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls.map(({ token }) => token)).toStrictEqual([GUEST_TOKEN]);
    await expect(owedDueNow(groupId)).resolves.toBe(0);
  });

  it("stays owed while their DO cannot keep a try the push service put off", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(guest, GUEST_TOKEN);
    const guestDo = env.USERS.getByName(await userIdOf(guest));
    // APNs asks to be tried later, and the DO's own tries cannot be kept.
    const answers = [503, 200];
    const calls: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(await new Request(input, init).json());
      return new Response(null, { status: answers.shift() ?? 200 });
    });
    await runInDurableObject(guestDo, (_, state) => {
      state.storage.sql.exec("alter table push_retries rename to put_away");
    });
    await setEnd(groupId, Date.now() + DAY_MS, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls).toHaveLength(1);
    await expect(owedDueNow(groupId)).resolves.toBe(1);

    await runInDurableObject(guestDo, (_, state) => {
      state.storage.sql.exec("alter table put_away rename to push_retries");
    });
    await runAlarm(env.GROUPS.getByName(groupId));
    expect(calls).toHaveLength(2);
    await expect(owedDueNow(groupId)).resolves.toBe(0);
  });

  it("is owed no more to a member who left, nor of an end since moved", async () => {
    const { groupId, guest, maker } = await pair();
    await registerToken(guest, GUEST_TOKEN);
    const calls = apnsCalls();
    const guestId = await userIdOf(guest);
    const restore = await failTelling(groupId, guestId);
    const near = Date.now() + DAY_MS;
    await setEnd(groupId, near, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    await restore();

    // Moved out past the hours: what was owed of the end before goes.
    await setEnd(groupId, Date.now() + FAR_MS, maker);
    await expect(owedDueNow(groupId)).resolves.toBe(0);

    // Owed again of a near end, and gone with their leaving.
    const failing = await failTelling(groupId, guestId);
    await setEnd(groupId, near, maker);
    await runAlarm(env.GROUPS.getByName(groupId));
    await failing();
    await call("GroupService/LeaveGroup", { groupId }, guest);
    await expect(owedDueNow(groupId)).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("a group ended", () => {
  it("goes from every member's list, as on leaving, its sockets closed", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const endsAt = Date.now() + DAY_MS;
    await setEnd(groupId, endsAt, maker);
    // An end this near is said at once, by the group's alarm, which gives
    // each member's DO their count with its notification: a first count
    // of a chat is told to their devices. Run before the phone connects,
    // so what the phone hears next is the group's ending alone.
    await runAlarm(env.GROUPS.getByName(groupId));
    const phone = await device(guest);
    await phone.frames.next();
    const open = await groupSocket(groupId, maker);
    const closed = closeCodeOf(open.socket);

    // Still there the moment before.
    await alarmAt(groupId, endsAt - 1);
    await expect(isThere(groupId)).resolves.toBeTruthy();

    await alarmAt(groupId, endsAt);
    await expect(closed).resolves.toBe(socketRules.notMemberCloseCode);
    expect(changesIn(await phone.frames.next())).toMatchObject([
      { kind: { case: "membership", value: { groupId, left: true } } },
    ]);
    await expect(
      Promise.all([
        env.USERS.getByName(makerId).isMember(groupId),
        env.USERS.getByName(guestId).isMember(groupId),
      ])
    ).resolves.toStrictEqual([false, false]);
  });

  it("keeps nothing: no group, no invitation, no photos, and no way in", async () => {
    const { groupId, inviteCode, maker } = await pair();
    const photo = await uploadPhoto(groupId, maker);
    const endsAt = Date.now() + DAY_MS;
    await setEnd(groupId, endsAt, maker);
    await alarmAt(groupId, endsAt);

    await expect(
      Promise.all([
        isThere(groupId),
        env.GROUPS.getByName(groupId).memberCount(),
        hasInvite(groupId),
        env.PHOTOS.head(photo),
      ])
    ).resolves.toStrictEqual([false, 0, false, null]);
    const join = await call(
      "GroupService/JoinGroup",
      { displayName: "あや", inviteCode },
      await signInAnonymously()
    );
    expect(join.status).toBe(404);
    const again = await exports.default.fetch(
      `${ORIGIN}/v1/groups/${groupId}/socket`,
      { headers: { Authorization: `Bearer ${maker}`, Upgrade: "websocket" } }
    );
    expect(again.status).toBe(403);
  });

  it("is ended again after an ending that failed", async () => {
    const { groupId, maker, makerId } = await pair();
    await uploadPhoto(groupId, maker);
    const endsAt = Date.now() + DAY_MS;
    await setEnd(groupId, endsAt, maker);
    const deletes = vi
      .spyOn(env.PHOTOS, "delete")
      .mockRejectedValue(new Error("R2 out of reach"));
    await alarmAt(groupId, endsAt);
    // Still the group, to be ended again.
    await expect(isThere(groupId)).resolves.toBeTruthy();

    deletes.mockRestore();
    await alarmAt(groupId, endsAt + DAY_MS);
    await expect(isThere(groupId)).resolves.toBeFalsy();
    await expect(
      env.USERS.getByName(makerId).isMember(groupId)
    ).resolves.toBeFalsy();
    await expect(hasInvite(groupId)).resolves.toBeFalsy();
  });
});
