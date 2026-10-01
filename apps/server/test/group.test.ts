import { GROUP_MAX_MEMBERS } from "@pochical/design/limits";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { call, openSocket, signInAnonymously } from "./helpers";

type Created = { groupId: string; inviteCode: string };

const createGroup = async (
  token: string,
  name = "いとこ会"
): Promise<Created> => {
  const response = await call(
    "GroupService/CreateGroup",
    { displayName: "さくら", emoji: "🍉", name },
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
    });
    expect(response.status).toBe(401);
  });

  it("holds names to spec/text-limits.md, counting characters as seen", async () => {
    const token = await signInAnonymously();
    const ok = { displayName: "さくら", emoji: "🍉", name: "いとこ会" };
    const accepted = [
      { ...ok, name: "あ".repeat(30) },
      // 30 emoji, each one character however many code units.
      { ...ok, name: "👨‍👩‍👧".repeat(30) },
      { ...ok, displayName: "あ".repeat(20) },
      { ...ok, emoji: "👨‍👩‍👧" },
      { ...ok, emoji: "🇯🇵" },
    ];
    const refused = [
      { ...ok, name: "あ".repeat(31) },
      { ...ok, name: "  " },
      { ...ok, displayName: "あ".repeat(21) },
      { ...ok, displayName: "" },
      { ...ok, emoji: "" },
      { ...ok, emoji: "🍉🍉" },
      { ...ok, emoji: "あ" },
    ];
    const results = await Promise.all(
      [...accepted, ...refused].map(
        async (body) => await call("GroupService/CreateGroup", body, token)
      )
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
});
