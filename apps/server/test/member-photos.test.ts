import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { personPhotoKey, photoKey } from "../src/photos";
import { call, ORIGIN, signInAnonymously } from "./helpers";
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
});
