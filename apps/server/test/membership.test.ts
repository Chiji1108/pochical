import { socketRules } from "@pochical/design/socket";
import {
  listDurableObjectIds,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { NEWS_RETRY_FIRST_MS } from "../src/group-do";
import { CURRENT_PROTOCOL_VERSION } from "../src/protocol";
import {
  call,
  failTelling,
  ORIGIN,
  openSocket,
  signInAnonymously,
  userIdOf,
} from "./helpers";
import { changesIn, device, pair, sendFrame, syncSocket } from "./sync-helpers";

// Who is in a group, decided by its Group DO and told to each member's own
// DO until it takes it (spec/sync-protocol.md, Groups).

const MARK = { color: 0, emoji: "🍉", icon: "", letter: "", photoId: "" };

const upgrade = async (path: string, token: string): Promise<Response> =>
  await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Upgrade: "websocket" },
  });

const closeCodeOf = async (socket: WebSocket): Promise<number> => {
  const { promise, resolve } = Promise.withResolvers<number>();
  socket.addEventListener("close", (event) => {
    resolve(event.code);
  });
  return await promise;
};

const createGroup = async (token: string) => {
  const response = await call(
    "GroupService/CreateGroup",
    {
      displayName: "さくら",
      mark: { emoji: "🍉" },
      name: "いとこ会",
      requestId: crypto.randomUUID(),
    },
    token
  );
  return (await response.json()) as { groupId: string; inviteCode: string };
};

const join = async (inviteCode: string, token: string): Promise<Response> =>
  await call(
    "GroupService/JoinGroup",
    { displayName: "ゆうき", inviteCode },
    token
  );

/** The group's alarm, as set now. */
const alarmOf = async (groupId: string): Promise<number | null> =>
  await runInDurableObject(
    env.GROUPS.getByName(groupId),
    async (_, state) => await state.storage.getAlarm()
  );

describe("the group deciding who reaches it", () => {
  it("closes a removed member's socket, and keeps them out while their own DO still lists the group", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    const closed = closeCodeOf(group.socket);
    const restore = await failTelling(groupId, guestId);

    const removed = await call(
      "GroupService/RemoveMember",
      { groupId, userId: guestId },
      maker
    );
    expect(removed.status).toBe(200);
    await expect(closed).resolves.toBe(socketRules.notMemberCloseCode);
    // Their DO has not heard, so the Worker lets them through to the
    // group, which refuses the socket before any catch-up, and the photos.
    await expect(
      env.USERS.getByName(guestId).isMember(groupId)
    ).resolves.toBeTruthy();
    const again = await upgrade(`/v1/groups/${groupId}/socket`, guest);
    expect(again.status).toBe(403);
    const photo = await exports.default.fetch(
      `${ORIGIN}/v1/groups/${groupId}/photos/${crypto.randomUUID()}`,
      { headers: { Authorization: `Bearer ${guest}` } }
    );
    expect(photo.status).toBe(403);
    await restore();
  });

  it("answers no frame, Hello first, on a socket whose user the group no longer has", async () => {
    const { groupId, guest } = await pair();
    const guestId = await userIdOf(guest);
    const socket = await openSocket(`/v1/groups/${groupId}/socket`, guest);
    let frames = 0;
    socket.addEventListener("message", () => {
      frames += 1;
    });
    const closed = closeCodeOf(socket);
    // Out of the group as the socket was let in, without its closing.
    await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) => {
      state.storage.sql.exec(
        "update members set left_at = 1 where user_id = ?",
        guestId
      );
    });

    sendFrame(socket, {
      case: "hello",
      value: { cursor: 0n, protocolVersion: CURRENT_PROTOCOL_VERSION },
    });
    await expect(closed).resolves.toBe(socketRules.notMemberCloseCode);
    expect(frames).toBe(0);
  });
});

describe("telling a member's own DO", () => {
  it("tells a joiner's DO again until it takes it, and the join then answers", async () => {
    const maker = await signInAnonymously();
    const { groupId, inviteCode } = await createGroup(maker);
    const guest = await signInAnonymously();
    const guestId = await userIdOf(guest);
    const phone = await device(guest);
    const restore = await failTelling(groupId, guestId);

    const before = Date.now();
    const failed = await join(inviteCode, guest);
    // The name they gave, theirs now; no group in their list yet.
    await phone.frames.next();
    // UNAVAILABLE, for the app to try again: the group has them, their
    // own DO not yet, and the group's alarm comes back to tell it.
    expect({
      inGroup: await env.GROUPS.getByName(groupId).isMember(guestId),
      listed: await env.USERS.getByName(guestId).isMember(groupId),
      status: failed.status,
    }).toStrictEqual({ inGroup: true, listed: false, status: 503 });
    const retry = (await alarmOf(groupId)) ?? 0;
    expect(retry).toBeGreaterThanOrEqual(before + NEWS_RETRY_FIRST_MS);

    // Still failing, the alarm comes back later each time.
    await runDurableObjectAlarm(env.GROUPS.getByName(groupId));
    await expect(alarmOf(groupId)).resolves.toBeGreaterThan(retry);

    await restore();
    await runDurableObjectAlarm(env.GROUPS.getByName(groupId));
    expect(changesIn(await phone.frames.next())).toMatchObject([
      { kind: { case: "membership", value: { groupId, left: false } } },
    ]);
    // Listed, with nothing left to tell nor an alarm to tell it, and the
    // join tried again answers.
    const again = await join(inviteCode, guest);
    expect({
      alarm: await alarmOf(groupId),
      listed: await env.USERS.getByName(guestId).isMember(groupId),
      status: again.status,
    }).toStrictEqual({ alarm: null, listed: true, status: 200 });
  });

  it("takes a leaver out of the group at once, and out of their own list once it can be told", async () => {
    const { groupId, guest, inviteCode } = await pair();
    const guestId = await userIdOf(guest);
    const restore = await failTelling(groupId, guestId);

    const failed = await call("GroupService/LeaveGroup", { groupId }, guest);
    expect(failed.status).toBe(503);
    const preview = await call("InviteService/GetInvitePreview", {
      inviteCode,
    });
    await expect(preview.json()).resolves.toMatchObject({ memberCount: 1 });
    const socket = await upgrade(`/v1/groups/${groupId}/socket`, guest);
    expect(socket.status).toBe(403);

    // The app's retry tells it at once.
    await restore();
    const left = await call("GroupService/LeaveGroup", { groupId }, guest);
    expect(left.status).toBe(200);
    await expect(
      env.USERS.getByName(guestId).isMember(groupId)
    ).resolves.toBeFalsy();
  });

  it("tells each member's DO of a new name, one unreachable once it can be", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    const restore = await failTelling(groupId, guestId);
    const renamed = await call(
      "GroupService/RenameGroup",
      { groupId, mark: { emoji: "🍉" }, name: "はとこ会" },
      maker
    );
    expect(renamed.status).toBe(200);
    const nameIn = async (userId: string) =>
      await runInDurableObject(
        env.USERS.getByName(userId),
        (_, state) =>
          state.storage.sql
            .exec<{
              name: string;
            }>("select name from memberships where group_id = ?", groupId)
            .one().name
      );
    await expect(nameIn(await userIdOf(maker))).resolves.toBe("はとこ会");
    await expect(nameIn(guestId)).resolves.toBe("いとこ会");

    await restore();
    await runDurableObjectAlarm(env.GROUPS.getByName(groupId));
    await expect(nameIn(guestId)).resolves.toBe("はとこ会");
  });

  it("takes only news newer than it has, however late it comes", async () => {
    const userId = await userIdOf(await signInAnonymously());
    const users = env.USERS.getByName(userId);
    const group = { mark: MARK, name: "いとこ会" };
    await users.takeMembership("g-late", { cursor: 5, group: null });
    // The join told before the leaving, coming after it.
    await users.takeMembership("g-late", { cursor: 3, group });
    await expect(users.isMember("g-late")).resolves.toBeFalsy();
    await users.takeMembership("g-late", { cursor: 8, group });
    await users.takeMembership("g-late", { cursor: 8, group: null });
    await expect(users.isMember("g-late")).resolves.toBeTruthy();
  });
});

describe("reporting", () => {
  it("refuses a report on a group the user is not in without waking it", async () => {
    const token = await signInAnonymously();
    const groupId = crypto.randomUUID();
    const response = await call(
      "ChatService/Report",
      { groupId, reason: "REPORT_REASON_SPAM", userId: "someone" },
      token
    );
    expect(response.status).toBe(404);
    const ids = await listDurableObjectIds(env.GROUPS);
    const theirs = env.GROUPS.idFromName(groupId);
    expect(ids.filter((id) => id.equals(theirs))).toHaveLength(0);
  });
});
