import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

import { user } from "../src/db/auth-schema";
import { reports } from "../src/db/schema";
import { photoKey } from "../src/photos";
import { resetEverything } from "../src/reset";
import { supportPlace } from "../src/support-lines";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";
import { pair, supportChat } from "./sync-helpers";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const signedIn = async (token: string): Promise<number> => {
  const response = await call("UserService/GetMe", {}, token);
  return response.status;
};

/** The rows of `sql` in a DO's own database. */
const rowsIn = async (
  namespace: DurableObjectNamespace,
  name: string,
  sql: string
) =>
  await runInDurableObject(namespace.getByName(name), (_, state) =>
    state.storage.sql.exec(sql).toArray()
  );

const NOTHING = {
  anonymous: 0,
  groups: 0,
  objects: { bytes: 0, count: 0 },
  reports: 0,
  supportChats: 0,
  users: 0,
};

/**
 * Two users in a group with a photo, one with a chat with Pochical's
 * people, a report, and objects in the bucket no part of the server
 * names.
 */
const seed = async () => {
  const { groupId, guest, maker, makerId } = await pair();
  const guestId = await userIdOf(guest);
  const photoId = crypto.randomUUID();
  const put = await exports.default.fetch(
    `${ORIGIN}/v1/groups/${groupId}/photos/${photoId}`,
    { body: JPEG, headers: { Authorization: `Bearer ${maker}` }, method: "PUT" }
  );
  expect(put.status).toBe(204);
  const chat = await supportChat(guest);
  await chat.say("消してください");
  await drizzle(env.DB).insert(reports).values({
    context: "ゆうき",
    createdAt: new Date(),
    groupId,
    id: crypto.randomUUID(),
    reason: "spam",
    reporterId: makerId,
    targetId: guestId,
  });
  await Promise.all(
    [
      "misc/thing",
      `previews/pages/${"0".repeat(64)}.json`,
      photoKey(crypto.randomUUID(), crypto.randomUUID()),
    ].map(async (key) => {
      await env.PHOTOS.put(key, JPEG);
    })
  );
  return { groupId, guest, guestId, maker, makerId };
};

describe("erasing everything (全消去)", () => {
  it("previews what it erases, erases every user, group and object, and erases nothing more run again", async () => {
    const { groupId, guest, guestId, maker } = await seed();
    const admin = exports.AdminEntrypoint;
    await expect(admin.resetPreview()).resolves.toStrictEqual({
      anonymous: 2,
      groups: 1,
      // The group's photo, and the three no part of the server names.
      objects: { bytes: 4 * JPEG.byteLength, count: 4 },
      reports: 1,
      supportChats: 1,
      users: 2,
    });

    await expect(admin.reset()).resolves.toStrictEqual(NOTHING);
    // Their sessions unknown, their group and chat empty, the bucket too.
    const left = await Promise.all([
      signedIn(maker),
      signedIn(guest),
      rowsIn(env.GROUPS, groupId, "select user_id from members"),
      rowsIn(env.GROUPS, supportPlace(guestId), "select seq from chat_lines"),
      env.PHOTOS.list().then(({ objects }) => objects),
    ]);
    expect(left).toStrictEqual([401, 401, [], [], []]);

    await expect(admin.reset()).resolves.toStrictEqual(NOTHING);
  });

  it("finishes a reset cut off part way: a group its users' erasure did not reach, found by its invitation or its photos", async () => {
    const invited = await pair();
    const { groupId } = await seed();
    // Their accounts gone, the groups not: as an erasure cut off part way,
    // the second with its invitation deleted too, its photos left.
    await drizzle(env.DB).delete(user);
    await env.DB.prepare("delete from invites where group_id = ?")
      .bind(groupId)
      .run();

    await expect(exports.AdminEntrypoint.reset()).resolves.toStrictEqual(
      NOTHING
    );
    for (const id of [invited.groupId, groupId]) {
      // oxlint-disable-next-line no-await-in-loop -- each group in turn
      await expect(
        rowsIn(env.GROUPS, id, "select user_id from members")
      ).resolves.toStrictEqual([]);
    }
  });

  it("finds a group again whose erasure failed, by the invitation it keeps until its Group DO is erased", async () => {
    const { groupId } = await pair();
    // Its users' accounts gone, so only its invitation leads to it.
    await drizzle(env.DB).delete(user);
    // Its Group DO cannot be reached, the first time.
    const getByName = env.GROUPS.getByName.bind(env.GROUPS);
    const unreachable = vi
      .spyOn(env.GROUPS, "getByName")
      .mockImplementation((name) =>
        name === groupId
          ? Object.assign(getByName(name), {
              erase: () => {
                throw new Error("unreachable");
              },
            })
          : getByName(name)
      );
    await expect(resetEverything(env)).rejects.toThrow("unreachable");
    unreachable.mockRestore();

    await expect(exports.AdminEntrypoint.reset()).resolves.toStrictEqual(
      NOTHING
    );
    await expect(
      rowsIn(env.GROUPS, groupId, "select user_id from members")
    ).resolves.toStrictEqual([]);
  });

  it("lets the device sign in anew afterwards, as a new user", async () => {
    const before = await signInAnonymously();
    const beforeId = await userIdOf(before);
    await exports.AdminEntrypoint.reset();
    const after = await signInAnonymously();
    await expect(userIdOf(after)).resolves.not.toBe(beforeId);
    await expect(signedIn(after)).resolves.toBe(200);
  });
});
