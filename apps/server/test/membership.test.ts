import { socketRules } from "@pochical/design/socket";
import { listDurableObjectIds, runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { NEWS_RETRY_FIRST_MS } from "../src/group-do";
import { CURRENT_PROTOCOL_VERSION } from "../src/protocol";
import { alarmOf, runAlarm } from "./alarms";
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

/**
 * Runs the group's alarm as its time comes: the news it waits to tell
 * due now, as it would be by then.
 */
const alarmComes = async (groupId: string): Promise<void> => {
  const group = env.GROUPS.getByName(groupId);
  await runInDurableObject(group, (_, state) => {
    state.storage.sql.exec("update membership_outbox set due_at = 0");
  });
  await expect(runAlarm(group)).resolves.toBeTruthy();
};

/** How many tries to tell `userId` of the group have failed in a row. */
const failuresTelling = async (groupId: string, userId: string) =>
  await runInDurableObject(
    env.GROUPS.getByName(groupId),
    (_, state) =>
      state.storage.sql
        .exec<{
          failures: number;
        }>("select failures from membership_outbox where user_id = ?", userId)
        .one().failures
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
    const retry = (await alarmOf(env.GROUPS.getByName(groupId))) ?? 0;
    expect(retry).toBeGreaterThanOrEqual(before + NEWS_RETRY_FIRST_MS);

    // Still failing, the alarm comes back later each time.
    await alarmComes(groupId);
    await expect(
      alarmOf(env.GROUPS.getByName(groupId))
    ).resolves.toBeGreaterThan(retry);

    await restore();
    await alarmComes(groupId);
    expect(changesIn(await phone.frames.next())).toMatchObject([
      { kind: { case: "membership", value: { groupId, left: false } } },
    ]);
    // Listed, with nothing left to tell nor an alarm to tell it, and the
    // join tried again answers.
    const again = await join(inviteCode, guest);
    expect({
      alarm: await alarmOf(env.GROUPS.getByName(groupId)),
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

  it("answers a rename once the renamer's list has it, the others' coming by the alarm at once", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    // The guest's DO takes it only once the test lets it, so a rename that
    // waited on it would never answer.
    const held = Promise.withResolvers<undefined>();
    const taken = Promise.withResolvers<undefined>();
    const restore = await failTelling(groupId, guestId, async (...news) => {
      await held.promise;
      try {
        await Reflect.apply(
          env.USERS.getByName(guestId).takeMembership,
          undefined,
          news
        );
        taken.resolve(undefined);
      } catch (error) {
        taken.reject(error);
        throw error;
      }
    });
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
    const renamed = await call(
      "GroupService/RenameGroup",
      { groupId, mark: { emoji: "🍉" }, name: "はとこ会" },
      maker
    );
    expect(renamed.status).toBe(200);
    await expect(nameIn(await userIdOf(maker))).resolves.toBe("はとこ会");
    await expect(nameIn(guestId)).resolves.toBe("いとこ会");
    // No alarm run here: it comes by itself. Let and waited for inside the
    // group, where its alarm tells the guest's DO.
    await runInDurableObject(env.GROUPS.getByName(groupId), async () => {
      held.resolve(undefined);
      await taken.promise;
    });
    await expect(nameIn(guestId)).resolves.toBe("はとこ会");
    await restore();
  });

  it("tells failed news again only in its time, not with someone else's", async () => {
    const maker = await signInAnonymously();
    const { groupId, inviteCode } = await createGroup(maker);
    const guest = await signInAnonymously();
    const guestId = await userIdOf(guest);
    const restore = await failTelling(groupId, guestId);
    await join(inviteCode, guest);

    // Someone else joins: the guest's news is not due yet.
    await join(inviteCode, await signInAnonymously());
    await expect(failuresTelling(groupId, guestId)).resolves.toBe(1);
    await alarmComes(groupId);
    await expect(failuresTelling(groupId, guestId)).resolves.toBe(2);
    await restore();
  });

  it("reaches a group the user's DO lists from before it noted groups, to leave it or delete the account", async () => {
    const { groupId, guest, inviteCode } = await pair();
    const guestId = await userIdOf(guest);
    const forgetNoted = async () => {
      await runInDurableObject(env.USERS.getByName(guestId), (_, state) => {
        state.storage.sql.exec("delete from known_groups");
      });
    };
    await forgetNoted();
    const left = await call("GroupService/LeaveGroup", { groupId }, guest);
    const preview = await call("InviteService/GetInvitePreview", {
      inviteCode,
    });
    expect(left.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({ memberCount: 1 });

    // Joined again, and deleted with the group listed alone.
    await join(inviteCode, guest);
    await forgetNoted();
    const deleted = await call(
      "UserService/DeleteAccount",
      { appleAuthorizationCode: "" },
      guest
    );
    expect(deleted.status).toBe(200);
    const theirs = await runInDurableObject(
      env.GROUPS.getByName(groupId),
      (_, state) =>
        state.storage.sql
          .exec(
            "select deleted, display_name from members where user_id = ?",
            guestId
          )
          .toArray()
    );
    expect(theirs).toStrictEqual([{ deleted: 1, display_name: "" }]);
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
