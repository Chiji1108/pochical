import { GROUP_MAX_MEMBERS, textLimits } from "@pochical/design/limits";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { call, signInAnonymously, userIdOf } from "./helpers";
import {
  changesIn,
  device,
  pair,
  push,
  settled,
  syncSocket,
} from "./sync-helpers";

const profilesIn = (changes: ReturnType<typeof changesIn>) =>
  changes.filter(({ kind }) => kind.case === "profile");

describe("the usual name", () => {
  it("is kept with the account and told to the user's devices", async () => {
    const token = await signInAnonymously();
    const open = await device(token);
    const saved = await call(
      "UserService/SetProfile",
      { name: " さくら " },
      token
    );
    expect(saved.status).toBe(200);
    // A device already open hears of it, trimmed.
    expect(profilesIn(changesIn(await open.frames.next()))).toMatchObject([
      { kind: { value: { name: "さくら" } } },
    ]);
    // One that connects later catches up on it.
    const later = await device(token);
    expect(profilesIn(changesIn(await later.frames.next()))).toMatchObject([
      { kind: { value: { name: "さくら" } } },
    ]);
  });

  it("can be cleared, but not be longer than a person's name", async () => {
    const token = await signInAnonymously();
    const tooLong = "あ".repeat(textLimits.personName + 1);
    const refused = await call(
      "UserService/SetProfile",
      { name: tooLong },
      token
    );
    expect(refused.status).toBe(400);
    const cleared = await call("UserService/SetProfile", { name: "" }, token);
    expect(cleared.status).toBe(200);
    const phone = await device(token);
    expect(profilesIn(changesIn(await phone.frames.next()))).toMatchObject([
      { kind: { value: { name: "" } } },
    ]);
  });

  it("shows in the groups that follow it, live", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    await group.frames.next();
    await call("UserService/SetProfile", { name: "さくらこ" }, maker);
    await push(makerId);
    expect(changesIn(await group.frames.next())).toMatchObject([
      {
        kind: {
          case: "member",
          value: { displayName: "さくらこ", ownName: false, userId: makerId },
        },
      },
    ]);
  });

  it("gives way to a group's own name until that is cleared", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const named = await call(
      "GroupService/SetDisplayName",
      { displayName: "さっちゃん", groupId },
      maker
    );
    expect(named.status).toBe(200);
    await call("UserService/SetProfile", { name: "さくらこ" }, maker);
    await push(makerId);
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    const membersOf = (changes: ReturnType<typeof changesIn>) =>
      changes.filter(
        ({ kind }) => kind.case === "member" && kind.value.userId === makerId
      );
    expect(membersOf(changesIn(await group.frames.next()))).toMatchObject([
      { kind: { value: { displayName: "さっちゃん", ownName: true } } },
    ]);
    // Cleared, it follows the usual name again.
    await call(
      "GroupService/SetDisplayName",
      { displayName: "", groupId },
      maker
    );
    expect(membersOf(changesIn(await group.frames.next()))).toMatchObject([
      { kind: { value: { displayName: "さくらこ", ownName: false } } },
    ]);
  });

  it("is what a group joined with no name of its own shows", async () => {
    const { inviteCode } = await pair();
    const late = await signInAnonymously();
    await call("UserService/SetProfile", { name: "はると" }, late);
    const joined = await call(
      "GroupService/JoinGroup",
      { displayName: "", inviteCode },
      late
    );
    expect(joined.status).toBe(200);
    const { groupId } = (await joined.json()) as { groupId: string };
    const lateId = await userIdOf(late);
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, late);
    const mine = changesIn(await group.frames.next()).filter(
      ({ kind }) => kind.case === "member" && kind.value.userId === lateId
    );
    expect(mine).toMatchObject([
      { kind: { value: { displayName: "はると", ownName: false } } },
    ]);
  });

  it("is not taken from a join refused as the group is full", async () => {
    const { groupId, inviteCode } = await pair();
    const group = env.GROUPS.getByName(groupId);
    await Promise.all(
      Array.from(
        { length: GROUP_MAX_MEMBERS - 2 },
        async (_, index) =>
          await group.addMember({
            ownName: null,
            userId: `filler-${index}`,
            usualName: `メンバー${index}`,
            usualPhoto: "",
          })
      )
    );
    const late = await signInAnonymously();
    const refused = await call(
      "GroupService/JoinGroup",
      { displayName: "はると", inviteCode },
      late
    );
    expect(refused.status).toBe(429);
    // Nothing to catch up on: the pong comes first.
    const phone = await device(late);
    await expect(settled(phone.socket, phone.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });
});
