import { GROUP_END_NOTICE_DAYS } from "@pochical/design/limits";
import { socketRules } from "@pochical/design/socket";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

import { invites } from "../src/db/schema";
import { ChatNotice_Kind } from "../src/gen/pochical/v1/sync_pb";
import type { ServerFrame } from "../src/gen/pochical/v1/sync_pb";
import { photoKey } from "../src/photos";
import { runAlarm } from "./alarms";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";
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

const DAY_MS = 24 * 60 * 60 * 1000;
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

const createGroup = async (endsAt: number, token: string): Promise<Response> =>
  await call(
    "GroupService/CreateGroup",
    {
      displayName: "さくら",
      endsAtMs: String(endsAt),
      mark: { emoji: "🍻" },
      name: "忘年会",
      requestId: crypto.randomUUID(),
    },
    token
  );

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
    const first = Date.now() + DAY_MS;

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
    await setEnd(groupId, Date.now() + DAY_MS, maker);
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

  it("is members' alone, and never a time already past", async () => {
    const { groupId, maker } = await pair();
    const stranger = await signInAnonymously();
    await expect(setEnd(groupId, Date.now() + DAY_MS, stranger)).resolves.toBe(
      403
    );
    await expect(setEnd(groupId, Date.now() - 1, maker)).resolves.toBe(400);
    await expect(env.GROUPS.getByName(groupId).endsAt()).resolves.toBeNull();
  });

  it("comes with a group made with one, and shows before joining", async () => {
    const maker = await signInAnonymously();
    const endsAt = Date.now() + DAY_MS;
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

    const past = await createGroup(Date.now() - 1, maker);
    expect(past.status).toBe(400);
  });
});

describe("a group's end coming", () => {
  it("is said in the chat once, GROUP_END_NOTICE_DAYS before, by no one", async () => {
    const { groupId, maker } = await pair();
    const endsAt = Date.now() + (GROUP_END_NOTICE_DAYS + 2) * DAY_MS;
    await setEnd(groupId, endsAt, maker);
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 2n);
    const soon = endsAt - GROUP_END_NOTICE_DAYS * DAY_MS;

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
    await alarmAt(groupId, soon + DAY_MS);
    await expect(quiet(mine)).resolves.toBeTruthy();
    await expect(isThere(groupId)).resolves.toBeTruthy();
  });

  it("is not said of an end set inside those days, nor of one taken away", async () => {
    const { groupId, maker } = await pair();
    const near = Date.now() + DAY_MS;
    await setEnd(groupId, near, maker);
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 2n);
    await alarmAt(groupId, near - 1);
    await expect(quiet(mine)).resolves.toBeTruthy();

    // Moved far ahead, then taken away: the time of its line goes too,
    // and the group stays past the end it had.
    const far = Date.now() + (GROUP_END_NOTICE_DAYS + 30) * DAY_MS;
    await setEnd(groupId, far, maker);
    await mine.frames.next();
    await setEnd(groupId, 0, maker);
    await mine.frames.next();
    await alarmAt(groupId, far + DAY_MS);
    await expect(quiet(mine)).resolves.toBeTruthy();
    await expect(isThere(groupId)).resolves.toBeTruthy();
  });
});

describe("a group ended", () => {
  it("goes from every member's list, as on leaving, its sockets closed", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const endsAt = Date.now() + DAY_MS;
    await setEnd(groupId, endsAt, maker);
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
