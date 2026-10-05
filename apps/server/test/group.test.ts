import { GROUP_MAX_MEMBERS, syncLimits } from "@pochical/design/limits";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import {
  call,
  inOneLimitWindow,
  ORIGIN,
  openSocket,
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

type Created = { groupId: string; inviteCode: string };

const createGroup = async (
  token: string,
  name = "いとこ会"
): Promise<Created> => {
  const response = await call(
    "GroupService/CreateGroup",
    {
      displayName: "さくら",
      emoji: "🍉",
      name,
      requestId: crypto.randomUUID(),
    },
    token
  );
  expect(response.status).toBe(200);
  return (await response.json()) as Created;
};

const preview = async (inviteCode: string): Promise<Response> =>
  await call("InviteService/GetInvitePreview", { inviteCode });

const previewOf = async (inviteCode: string): Promise<unknown> => {
  const response = await preview(inviteCode);
  return await response.json();
};

const statusOf = async (response: Promise<Response>): Promise<number> => {
  const { status } = await response;
  return status;
};

const join = async (inviteCode: string, token: string): Promise<Response> =>
  await call(
    "GroupService/JoinGroup",
    { displayName: "ゆうき", inviteCode },
    token
  );

describe("GroupService", () => {
  it("makes a group with its maker in it and a live link", async () => {
    const maker = await signInAnonymously();
    const { groupId, inviteCode } = await createGroup(maker);

    await expect(previewOf(inviteCode)).resolves.toStrictEqual({
      groupEmoji: "🍉",
      groupName: "いとこ会",
      memberCount: 1,
    });
    const socket = await openSocket(`/v1/groups/${groupId}/socket`, maker);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("makes one group however often the same request comes", async () => {
    const maker = await signInAnonymously();
    const body = {
      displayName: "さくら",
      emoji: "🍉",
      name: "いとこ会",
      requestId: "the-same-request",
    };
    const made = async (sent: typeof body) => {
      const response = await call("GroupService/CreateGroup", sent, maker);
      expect(response.status).toBe(200);
      return (await response.json()) as Created;
    };
    const first = await made(body);
    // A retry after a lost answer, even with the name changed meanwhile,
    // gives back the first group, its link and its name unchanged.
    await expect(made({ ...body, name: "別の名前" })).resolves.toStrictEqual(
      first
    );
    await expect(previewOf(first.inviteCode)).resolves.toMatchObject({
      groupName: "いとこ会",
      memberCount: 1,
    });
    // A new request makes a new group.
    const second = await made({ ...body, requestId: "another-request" });
    expect(second.groupId).not.toBe(first.groupId);

    // Two tries at once, as a retry sent while the first is still on its
    // way, agree on one group and one live link.
    const racing = { ...body, requestId: "racing-request" };
    const [one, other] = await Promise.all([made(racing), made(racing)]);
    expect(other).toStrictEqual(one);
    await expect(previewOf(one?.inviteCode ?? "")).resolves.toMatchObject({
      groupName: "いとこ会",
    });
  });

  it("lets someone with the link join, once", async () => {
    const { groupId, inviteCode } = await createGroup(
      await signInAnonymously()
    );
    const guest = await signInAnonymously();

    const first = await join(inviteCode, guest);
    await expect(first.json()).resolves.toStrictEqual({ groupId });
    const again = await join(inviteCode, guest);
    await expect(again.json()).resolves.toStrictEqual({
      alreadyMember: true,
      groupId,
    });

    await expect(previewOf(inviteCode)).resolves.toMatchObject({
      memberCount: 2,
    });
    const socket = await openSocket(`/v1/groups/${groupId}/socket`, guest);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("stops the old link at once when it is remade", async () => {
    const maker = await signInAnonymously();
    const { groupId, inviteCode: old } = await createGroup(maker);

    const remade = await call(
      "GroupService/RemakeInviteLink",
      { groupId },
      maker
    );
    const { inviteCode } = (await remade.json()) as { inviteCode: string };
    expect(inviteCode).not.toBe(old);

    await expect(statusOf(preview(old))).resolves.toBe(404);
    const someone = await signInAnonymously();
    await expect(statusOf(join(old, someone))).resolves.toBe(404);
    const current = await call(
      "GroupService/GetInviteLink",
      { groupId },
      maker
    );
    await expect(current.json()).resolves.toStrictEqual({ inviteCode });
  });

  it("keeps the link to members", async () => {
    const { groupId } = await createGroup(await signInAnonymously());
    const outsider = await signInAnonymously();

    for (const method of [
      "GroupService/GetInviteLink",
      "GroupService/RemakeInviteLink",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one case at a time
      const response = await call(method, { groupId }, outsider);
      expect(response.status).toBe(403);
    }
  });

  it("needs a session", async () => {
    const response = await call("GroupService/CreateGroup", {
      displayName: "さくら",
      emoji: "🍉",
      name: "いとこ会",
      requestId: crypto.randomUUID(),
    });
    expect(response.status).toBe(401);
  });

  it("holds names to spec/text-limits.md, counting characters as seen", async () => {
    const ok = {
      displayName: "さくら",
      emoji: "🍉",
      name: "いとこ会",
      requestId: "request-1",
    };
    const accepted = [
      { ...ok, name: "あ".repeat(30) },
      // 30 emoji, each one character however many code units.
      { ...ok, name: "👨‍👩‍👧".repeat(30) },
      { ...ok, displayName: "あ".repeat(20) },
      // What one emoji is: spec/vectors/text.json, isEmoji.
      { ...ok, emoji: "👨‍👩‍👧" },
    ];
    const refused = [
      { ...ok, name: "あ".repeat(31) },
      { ...ok, name: "  " },
      { ...ok, displayName: "あ".repeat(21) },
      { ...ok, displayName: "" },
      { ...ok, emoji: "" },
      { ...ok, emoji: "🍉🍉" },
      { ...ok, requestId: "" },
      { ...ok, requestId: "has space" },
      { ...ok, requestId: "x".repeat(syncLimits.idLength + 1) },
    ];
    // Each by its own user, so the group-making limit does not count them
    // together.
    const results = await Promise.all(
      [...accepted, ...refused].map(async (body) => {
        const maker = await signInAnonymously();
        return await call("GroupService/CreateGroup", body, maker);
      })
    );
    expect(results.map((response) => response.status)).toStrictEqual([
      ...accepted.map(() => 200),
      ...refused.map(() => 400),
    ]);
  });

  it("shows who is in the group before joining, to signed-in people only", async () => {
    const maker = await signInAnonymously();
    const { groupId, inviteCode } = await createGroup(maker);
    const guest = await signInAnonymously();

    const before = await call("GroupService/GetInvite", { inviteCode }, guest);
    await expect(before.json()).resolves.toStrictEqual({
      groupEmoji: "🍉",
      groupId,
      groupName: "いとこ会",
      members: [{ displayName: "さくら" }],
    });
    await join(inviteCode, guest);
    const after = await call("GroupService/GetInvite", { inviteCode }, guest);
    await expect(after.json()).resolves.toMatchObject({
      alreadyMember: true,
      members: [{ displayName: "さくら" }, { displayName: "ゆうき" }],
    });

    const anonymous = await call("GroupService/GetInvite", { inviteCode });
    expect(anonymous.status).toBe(401);
    await expect(
      statusOf(
        call("GroupService/GetInvite", { inviteCode: "Zzzz2345" }, guest)
      )
    ).resolves.toBe(404);
  });

  it(`keeps a group to ${GROUP_MAX_MEMBERS} members`, async () => {
    const { groupId, inviteCode } = await createGroup(
      await signInAnonymously()
    );
    const group = env.GROUPS.getByName(groupId);
    await Promise.all(
      Array.from(
        { length: GROUP_MAX_MEMBERS - 1 },
        async (_, index) =>
          await group.addMember({
            displayName: `メンバー${index}`,
            userId: `filler-${index}`,
          })
      )
    );
    await expect(previewOf(inviteCode)).resolves.toMatchObject({
      memberCount: GROUP_MAX_MEMBERS,
    });

    const late = await signInAnonymously();
    const invite = await call("GroupService/GetInvite", { inviteCode }, late);
    await expect(invite.json()).resolves.toMatchObject({ full: true });
    const refused = await join(inviteCode, late);
    expect(refused.status).toBe(429);
    await expect(refused.json()).resolves.toMatchObject({
      code: "resource_exhausted",
    });
    await expect(previewOf(inviteCode)).resolves.toMatchObject({
      memberCount: GROUP_MAX_MEMBERS,
    });
  });

  it("holds back one user making many groups at once", async () => {
    const statuses = await inOneLimitWindow(async () => {
      const maker = await signInAnonymously();
      const counted: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- counted in order
        const response = await call(
          "GroupService/CreateGroup",
          {
            displayName: "さくら",
            emoji: "🍉",
            name: `グループ${attempt}`,
            requestId: `request-${attempt}`,
          },
          maker
        );
        counted.push(response.status);
      }
      return counted;
    });
    expect(statuses).toStrictEqual([200, 200, 200, 200, 200, 429]);
  });

  it("never counts a retry of one request against the limit", async () => {
    const statuses = await inOneLimitWindow(async () => {
      const maker = await signInAnonymously();
      const counted: number[] = [];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop -- counted in order
        const response = await call(
          "GroupService/CreateGroup",
          {
            displayName: "さくら",
            emoji: "🍉",
            name: "いとこ会",
            requestId: "retried",
          },
          maker
        );
        counted.push(response.status);
      }
      return counted;
    });
    expect(statuses).toStrictEqual(statuses.map(() => 200));
  });
});

describe("who is in a group, on members' devices", () => {
  it("lists a group on the user's devices as they make or join it", async () => {
    const maker = await signInAnonymously();
    const phone = await device(maker);
    const { groupId, inviteCode } = await createGroup(maker);
    expect(changesIn(await phone.frames.next())).toMatchObject([
      {
        kind: {
          case: "membership",
          value: { emoji: "🍉", groupId, name: "いとこ会" },
        },
      },
    ]);

    // A device opened later catches up on it, once however often they join.
    const guest = await signInAnonymously();
    await join(inviteCode, guest);
    await join(inviteCode, guest);
    const tablet = await device(guest);
    expect(changesIn(await tablet.frames.next())).toMatchObject([
      { kind: { case: "membership", value: { groupId } } },
    ]);
    await expect(settled(tablet.socket, tablet.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("shows members the group's name and who is in it, live", async () => {
    const { groupId, guest, inviteCode, makerId } = await pair();
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    expect(changesIn(await group.frames.next())).toMatchObject([
      {
        cursor: 1n,
        kind: {
          case: "groupProfile",
          value: { emoji: "🍉", name: "いとこ会" },
        },
      },
      {
        cursor: 2n,
        kind: {
          case: "member",
          value: { displayName: "さくら", userId: makerId },
        },
      },
      {
        cursor: 3n,
        kind: { case: "member", value: { displayName: "ゆうき" } },
      },
    ]);

    const newcomer = await signInAnonymously();
    await call(
      "GroupService/JoinGroup",
      { displayName: "あや", inviteCode },
      newcomer
    );
    expect(changesIn(await group.frames.next())).toMatchObject([
      { cursor: 4n, kind: { case: "member", value: { displayName: "あや" } } },
    ]);
  });
});

describe("changing a group and leaving it", () => {
  it("renames the group for everyone, in the group and in their lists", async () => {
    const { groupId, guest, maker } = await pair();
    const group = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      guest,
      PAIR_ROSTER
    );
    const phone = await device(maker);
    await phone.frames.next();

    const renamed = await call(
      "GroupService/RenameGroup",
      { emoji: "🏠", groupId, name: "いとこの家" },
      guest
    );
    expect(renamed.status).toBe(200);
    expect(changesIn(await group.frames.next())).toMatchObject([
      {
        kind: {
          case: "groupProfile",
          value: { emoji: "🏠", name: "いとこの家" },
        },
      },
    ]);
    expect(changesIn(await phone.frames.next())).toMatchObject([
      {
        kind: {
          case: "membership",
          value: { emoji: "🏠", groupId, name: "いとこの家" },
        },
      },
    ]);
  });

  it("changes how a member appears, and only for members", async () => {
    const { groupId, guest } = await pair();
    const group = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      guest,
      PAIR_ROSTER
    );
    await call(
      "GroupService/SetDisplayName",
      { displayName: "ゆうちゃん", groupId },
      guest
    );
    expect(changesIn(await group.frames.next())).toMatchObject([
      { kind: { case: "member", value: { displayName: "ゆうちゃん" } } },
    ]);

    const stranger = await signInAnonymously();
    await expect(
      statusOf(
        call(
          "GroupService/SetDisplayName",
          { displayName: "だれか", groupId },
          stranger
        )
      )
    ).resolves.toBe(403);
  });

  it("tells the member's devices and the group when they leave", async () => {
    const { groupId, guest, maker } = await pair();
    const tablet = await device(guest);
    await tablet.frames.next();
    const late = await syncSocket(
      `/v1/groups/${groupId}/socket`,
      maker,
      PAIR_ROSTER
    );

    await call("GroupService/LeaveGroup", { groupId }, guest);
    expect(changesIn(await tablet.frames.next())).toMatchObject([
      { kind: { case: "membership", value: { groupId, left: true } } },
    ]);
    expect(changesIn(await late.frames.next())).toMatchObject([
      { kind: { case: "member", value: { left: true } } },
    ]);
  });

  it("no longer lets in or counts one who left, until they join again", async () => {
    const { groupId, guest, inviteCode, maker, makerId } = await pair();
    await call("GroupService/LeaveGroup", { groupId }, guest);
    // Leaving twice changes nothing.
    const again = await call("GroupService/LeaveGroup", { groupId }, guest);
    expect(again.status).toBe(200);

    const refused = await exports.default.fetch(
      `${ORIGIN}/v1/groups/${groupId}/socket`,
      { headers: { Authorization: `Bearer ${guest}`, Upgrade: "websocket" } }
    );
    expect(refused.status).toBe(403);
    await expect(previewOf(inviteCode)).resolves.toMatchObject({
      memberCount: 1,
    });
    const invite = await call("GroupService/GetInvite", { inviteCode }, maker);
    await expect(invite.json()).resolves.toMatchObject({
      members: [{ displayName: "さくら" }],
    });

    // Back by the link, as anyone joins.
    await join(inviteCode, guest);
    const back = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    const roster = changesIn(await back.frames.next()).filter(
      ({ kind }) => kind.case === "member"
    );
    expect(roster).toMatchObject([
      { kind: { value: { left: false, userId: makerId } } },
      { kind: { value: { left: false } } },
    ]);
  });
});

describe("finishing a leaving", () => {
  it("takes the member out of the group on a retry after the group's step failed", async () => {
    const { groupId, guest, inviteCode } = await pair();
    // As if the first try stopped after the user's own step.
    await env.USERS.getByName(await userIdOf(guest)).removeMembership(groupId);
    await call("GroupService/LeaveGroup", { groupId }, guest);
    await expect(previewOf(inviteCode)).resolves.toMatchObject({
      memberCount: 1,
    });
  });
});
