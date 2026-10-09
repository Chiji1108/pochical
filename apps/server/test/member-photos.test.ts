import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { personPhotoKey, photoKey } from "../src/photos";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";
import { changesIn, pair, push, syncSocket } from "./sync-helpers";

// A JPEG's first bytes and a little more, as the app sends one.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const upload = async (path: string, token: string): Promise<Response> =>
  await exports.default.fetch(`${ORIGIN}${path}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });

const read = async (path: string, token: string): Promise<Response> =>
  await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

type Changes = ReturnType<typeof changesIn>;

const memberOf = (changes: Changes, userId: string) =>
  changes.filter(
    ({ kind }) => kind.case === "member" && kind.value.userId === userId
  );

describe("members' photos", () => {
  it("show a usual photo in the groups, for their members alone", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const photoId = crypto.randomUUID();
    const uploaded = await upload(`/v1/me/photos/${photoId}`, maker);
    expect(uploaded.status).toBe(204);
    await call("UserService/SetProfile", { name: "さくら", photoId }, maker);
    await push(makerId);
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    expect(
      memberOf(changesIn(await group.frames.next()), makerId)
    ).toMatchObject([{ kind: { value: { ownPhoto: false, photoId } } }]);
    // The group's copy, read by its members and no one else.
    const path = `/v1/groups/${groupId}/photos/${photoId}`;
    const byMember = await read(path, guest);
    expect(byMember.status).toBe(200);
    const byOutsider = await read(path, await signInAnonymously());
    expect(byOutsider.status).toBe(403);
  });

  it("are read from the user's own photos by them alone", async () => {
    const { guest, maker } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    const byThem = await read(`/v1/me/photos/${photoId}`, maker);
    expect(byThem.status).toBe(200);
    const byOther = await read(`/v1/me/photos/${photoId}`, guest);
    expect(byOther.status).toBe(404);
  });

  it("take only a photo the user uploaded", async () => {
    const token = await signInAnonymously();
    const set = await call(
      "UserService/SetProfile",
      { name: "さくら", photoId: crypto.randomUUID() },
      token
    );
    expect(set.status).toBe(400);
  });

  it("let a group have its own photo, or none, and go back to the usual one", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const usual = crypto.randomUUID();
    await upload(`/v1/me/photos/${usual}`, maker);
    await call(
      "UserService/SetProfile",
      { name: "さくら", photoId: usual },
      maker
    );
    await push(makerId);
    const own = crypto.randomUUID();
    const uploaded = await upload(`/v1/groups/${groupId}/photos/${own}`, maker);
    expect(uploaded.status).toBe(204);
    // Another member's upload is not theirs to use.
    const theirs = await call(
      "GroupService/SetGroupPhoto",
      { groupId, photoId: own },
      guest
    );
    expect(theirs.status).toBe(400);
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    await group.frames.next();

    await call("GroupService/SetGroupPhoto", { groupId, photoId: own }, maker);
    expect(
      memberOf(changesIn(await group.frames.next()), makerId)
    ).toMatchObject([{ kind: { value: { ownPhoto: true, photoId: own } } }]);
    await call("GroupService/SetGroupPhoto", { groupId, photoId: "" }, maker);
    expect(
      memberOf(changesIn(await group.frames.next()), makerId)
    ).toMatchObject([{ kind: { value: { ownPhoto: true, photoId: "" } } }]);
    await call("GroupService/SetGroupPhoto", { groupId, usual: true }, maker);
    expect(
      memberOf(changesIn(await group.frames.next()), makerId)
    ).toMatchObject([{ kind: { value: { ownPhoto: false, photoId: usual } } }]);
  });

  it("go with the account", async () => {
    const { groupId, maker, makerId } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    await call("UserService/SetProfile", { name: "さくら", photoId }, maker);
    await push(makerId);
    // The push may still be under way from the alarm set as it changed.
    await vi.waitFor(async () => {
      await expect(
        env.PHOTOS.head(photoKey(groupId, photoId))
      ).resolves.not.toBeNull();
    });
    const deleted = await call("UserService/DeleteAccount", {}, maker);
    expect(deleted.status).toBe(200);
    await expect(
      env.PHOTOS.head(photoKey(groupId, photoId))
    ).resolves.toBeNull();
    await expect(
      env.PHOTOS.head(personPhotoKey(makerId, photoId))
    ).resolves.toBeNull();
  });

  it("go from a group its member leaves", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    await call("UserService/SetProfile", { name: "さくら", photoId }, maker);
    await push(makerId);
    await vi.waitFor(async () => {
      await expect(
        env.PHOTOS.head(photoKey(groupId, photoId))
      ).resolves.not.toBeNull();
    });
    const group = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    await group.frames.next();
    await call("GroupService/LeaveGroup", { groupId }, maker);
    expect(
      memberOf(changesIn(await group.frames.next()), makerId)
    ).toMatchObject([{ kind: { value: { left: true, photoId: "" } } }]);
    await vi.waitFor(async () => {
      await expect(
        env.PHOTOS.head(photoKey(groupId, photoId))
      ).resolves.toBeNull();
    });
  });

  it("show on the join screen to whoever holds the invitation", async () => {
    const { groupId, inviteCode, maker, makerId } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    await call("UserService/SetProfile", { name: "さくら", photoId }, maker);
    await push(makerId);
    await vi.waitFor(async () => {
      await expect(
        env.PHOTOS.head(photoKey(groupId, photoId))
      ).resolves.not.toBeNull();
    });
    const outsider = await signInAnonymously();
    const invite = await call(
      "GroupService/GetInvite",
      { inviteCode },
      outsider
    );
    await expect(invite.json()).resolves.toMatchObject({
      members: [{ displayName: "さくら", photoId }, { displayName: "ゆうき" }],
    });
    const face = await read(
      `/v1/invites/${inviteCode}/photos/${photoId}`,
      outsider
    );
    expect(face.status).toBe(200);
    // Only a photo the group shows of someone in it.
    const other = await read(
      `/v1/invites/${inviteCode}/photos/${crypto.randomUUID()}`,
      outsider
    );
    expect(other.status).toBe(404);
  });
});

/** A rename to `mark`, as the status it answers. */
const renamed = async (
  groupId: string,
  mark: Record<string, unknown>,
  token: string
): Promise<number> => {
  const response = await call(
    "GroupService/RenameGroup",
    { groupId, mark, name: "いとこ会" },
    token
  );
  return response.status;
};

describe("a group's photo mark", () => {
  it("is copied from the caller's own photo and shown to the link's holders", async () => {
    const { groupId, guest, inviteCode, maker } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    await expect(renamed(groupId, { photoId }, maker)).resolves.toBe(200);
    // Members read the group's copy as they read its other photos.
    const byMember = await read(
      `/v1/groups/${groupId}/photos/${photoId}`,
      guest
    );
    // Anyone holding the link sees it with the group's name, no session
    // needed, and nothing else by that path.
    const markPath = `/v1/invites/${inviteCode}/mark`;
    const shown = await exports.default.fetch(
      `${ORIGIN}${markPath}/${photoId}`
    );
    const other = await exports.default.fetch(
      `${ORIGIN}${markPath}/${crypto.randomUUID()}`
    );
    // The join screen reads it as it reads the members' faces.
    const onJoinScreen = await read(
      `/v1/invites/${inviteCode}/photos/${photoId}`,
      await signInAnonymously()
    );
    expect([
      byMember.status,
      shown.status,
      other.status,
      onJoinScreen.status,
    ]).toStrictEqual([200, 200, 404, 200]);
    const preview = await call("InviteService/GetInvitePreview", {
      inviteCode,
    });
    await expect(preview.json()).resolves.toMatchObject({
      groupMark: { photoId },
    });
    // Another member renaming keeps it without a photo of their own.
    await expect(renamed(groupId, { photoId }, guest)).resolves.toBe(200);
  });

  it("takes only a photo the caller uploaded", async () => {
    const { groupId, guest, maker } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    const statuses = [
      await renamed(groupId, { photoId }, guest),
      await renamed(groupId, { photoId: crypto.randomUUID() }, maker),
      await renamed(groupId, { emoji: "🍉", photoId }, maker),
    ];
    expect(statuses).toStrictEqual([400, 400, 400]);
  });

  it("makes a group with it, moved out of the maker's own photos", async () => {
    const maker = await signInAnonymously();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    const body = {
      displayName: "さくら",
      mark: { photoId },
      name: "いとこ会",
      requestId: crypto.randomUUID(),
    };
    const created = await call("GroupService/CreateGroup", body, maker);
    expect(created.status).toBe(200);
    const { groupId } = (await created.json()) as { groupId: string };
    // A retry after a lost answer, its own copy gone already, still works.
    const retried = await call("GroupService/CreateGroup", body, maker);
    const makerId = await userIdOf(maker);
    const [inGroup, ownCopy] = await Promise.all([
      env.PHOTOS.head(photoKey(groupId, photoId)),
      env.PHOTOS.head(personPhotoKey(makerId, photoId)),
    ]);
    expect([retried.status, inGroup !== null, ownCopy]).toStrictEqual([
      200,
      true,
      null,
    ]);
  });

  it("leaves the usual photo it was made from", async () => {
    const { groupId, maker, makerId } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    await call("UserService/SetProfile", { name: "さくら", photoId }, maker);
    await expect(renamed(groupId, { photoId }, maker)).resolves.toBe(200);
    await expect(
      env.PHOTOS.head(personPhotoKey(makerId, photoId))
    ).resolves.not.toBeNull();
  });

  it("goes once the group's mark is another", async () => {
    const { groupId, maker } = await pair();
    const photoId = crypto.randomUUID();
    await upload(`/v1/me/photos/${photoId}`, maker);
    await renamed(groupId, { photoId }, maker);
    await renamed(groupId, { color: 2, letter: "い" }, maker);
    await vi.waitFor(async () => {
      await expect(
        env.PHOTOS.head(photoKey(groupId, photoId))
      ).resolves.toBeNull();
    });
  });
});
