import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { eraseGroup, eraseUser } from "../src/account-deletion";
import type { GroupDO } from "../src/group-do";
import {
  personPhotoKey,
  photoKey,
  smallKey,
  uploadedPhotoKey,
} from "../src/photos";
import type { UserDO } from "../src/user-do";
import { call, ORIGIN } from "./helpers";
import {
  PAIR_ROSTER,
  pair,
  push,
  sendFrame,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

// R2 never keeps an object nothing notes: each way one could be left is
// closed where it is written or let go (spec/admin.md, What keeps the
// bucket clean).

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const upload = async (path: string, token: string): Promise<number> => {
  const put = await exports.default.fetch(`${ORIGIN}${path}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  return put.status;
};

const stored = async (key: string): Promise<boolean> =>
  (await env.PHOTOS.head(key)) !== null;

/** The group's notes of its photos, by id. */
const notesOf = async (groupId: string): Promise<Record<string, string>> =>
  await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) =>
    Object.fromEntries(
      state.storage.sql
        .exec<{ id: string; state: string }>(
          "select id, state from group_photos"
        )
        .toArray()
        .map(({ id, state: held }) => [id, held])
    )
  );

/** A Group DO's alarm run now, whenever it was set for. */
const groupAlarm = async (groupId: string): Promise<void> => {
  await runInDurableObject(
    env.GROUPS.getByName(groupId),
    async (instance: GroupDO) => {
      await instance.alarm();
    }
  );
};

/** A User DO's alarm run now, whenever it was set for. */
const userAlarm = async (userId: string): Promise<void> => {
  await runInDurableObject(
    env.USERS.getByName(userId),
    async (instance: UserDO) => {
      await instance.alarm();
    }
  );
};

/** R2's deletes refused until restored, as when it is out of reach. */
const failingDeletes = () =>
  vi
    .spyOn(env.PHOTOS, "delete")
    .mockRejectedValue(new Error("R2 out of reach"));

const sendPhotoLine = async (
  groupId: string,
  token: string,
  photoId: string
) => {
  const mine = await syncSocket(
    `/v1/groups/${groupId}/socket`,
    token,
    PAIR_ROSTER
  );
  sendFrame(mine.socket, {
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: {
            case: "send",
            value: {
              content: {
                kind: {
                  case: "photos",
                  value: { photos: [{ height: 10, id: photoId, width: 10 }] },
                },
              },
              threadId: "group",
            },
          },
          opId: crypto.randomUUID(),
        },
      ],
    },
  });
  await untilAcked(mine.frames);
  return mine;
};

describe("the photos bucket", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("a group's photo let go", () => {
    it("keeps its note until R2 has deleted it, when its line is taken back", async () => {
      const { groupId, maker } = await pair();
      const id = crypto.randomUUID();
      await upload(`/v1/groups/${groupId}/photos/${id}`, maker);
      await upload(`/v1/groups/${groupId}/photos/${id}?size=small`, maker);
      const mine = await sendPhotoLine(groupId, maker, id);
      const deletes = failingDeletes();
      sendFrame(mine.socket, {
        case: "chatEdits",
        value: {
          edits: [
            {
              kind: { case: "unsend", value: { seq: 2n, threadId: "group" } },
              opId: crypto.randomUUID(),
            },
          ],
        },
      });
      await untilAcked(mine.frames);
      // The sweep the take-back set fails at R2: the note says so still.
      await groupAlarm(groupId);
      await expect(stored(photoKey(groupId, id))).resolves.toBeTruthy();
      await expect(notesOf(groupId)).resolves.toMatchObject({
        [id]: "takingBack",
      });
      // Its upload again is refused meanwhile, as for one taken back.
      await expect(
        upload(`/v1/groups/${groupId}/photos/${id}`, maker)
      ).resolves.toBe(409);

      deletes.mockRestore();
      await groupAlarm(groupId);
      await expect(
        Promise.all([
          stored(photoKey(groupId, id)),
          stored(smallKey(photoKey(groupId, id))),
        ])
      ).resolves.toStrictEqual([false, false]);
      await expect(notesOf(groupId)).resolves.toMatchObject({
        [id]: "takenBack",
      });
    });

    it("keeps its note until R2 has deleted it, when the group shows it no more", async () => {
      const { groupId, guest } = await pair();
      const own = crypto.randomUUID();
      await upload(`/v1/groups/${groupId}/photos/${own}`, guest);
      await call(
        "GroupService/SetGroupPhoto",
        { groupId, photoId: own },
        guest
      );
      const deletes = failingDeletes();
      // Back to the usual photo: the own one goes.
      await call(
        "GroupService/SetGroupPhoto",
        { groupId, photoId: "", usual: true },
        guest
      );
      await groupAlarm(groupId);
      await expect(stored(photoKey(groupId, own))).resolves.toBeTruthy();
      await expect(notesOf(groupId)).resolves.toMatchObject({
        [own]: "deleting",
      });

      deletes.mockRestore();
      await groupAlarm(groupId);
      await expect(stored(photoKey(groupId, own))).resolves.toBeFalsy();
      await expect(notesOf(groupId)).resolves.not.toHaveProperty(own);
    });

    it("is never stored after the sweep deletes it, though its upload was on its way", async () => {
      const { groupId, makerId } = await pair();
      const group = env.GROUPS.getByName(groupId);
      const id = crypto.randomUUID();
      const kept = await runInDurableObject(group, async (instance, state) => {
        // R2 takes the upload's bytes only once let.
        const { promise: landed, resolve: land } =
          Promise.withResolvers<undefined>();
        const put = env.PHOTOS.put.bind(env.PHOTOS);
        vi.spyOn(env.PHOTOS, "put").mockImplementationOnce(async (...args) => {
          await landed;
          return await put(...args);
        });
        const storing = instance.storePhoto(id, makerId, JPEG, {
          contentType: "image/jpeg",
          small: false,
        });
        // Its send recalled meanwhile, which lets it go at once.
        state.storage.sql.exec(
          "update group_photos set state = 'deleting', uploaded_at = 0 where id = ?",
          id
        );
        const sweeping = instance.alarm();
        land(undefined);
        await Promise.all([storing, sweeping]);
        return state.storage.sql
          .exec("select id from group_photos where id = ?", id)
          .toArray();
      });
      expect(kept).toStrictEqual([]);
      await expect(stored(photoKey(groupId, id))).resolves.toBeFalsy();
    });

    it("goes at once when its send is recalled before it came", async () => {
      const { groupId, maker } = await pair();
      const id = crypto.randomUUID();
      await upload(`/v1/groups/${groupId}/photos/${id}`, maker);
      const mine = await syncSocket(
        `/v1/groups/${groupId}/socket`,
        maker,
        PAIR_ROSTER
      );
      const deletes = failingDeletes();
      sendFrame(mine.socket, {
        case: "chatEdits",
        value: {
          edits: [
            {
              kind: {
                case: "recall",
                value: {
                  photoIds: [id],
                  sendOpId: crypto.randomUUID(),
                  threadId: "group",
                },
              },
              opId: crypto.randomUUID(),
            },
          ],
        },
      });
      await untilAcked(mine.frames);
      // Noted as going, then forgotten only once R2 has deleted it.
      await groupAlarm(groupId);
      await expect(notesOf(groupId)).resolves.toMatchObject({
        [id]: "deleting",
      });
      deletes.mockRestore();
      await groupAlarm(groupId);
      await expect(stored(photoKey(groupId, id))).resolves.toBeFalsy();
      await expect(notesOf(groupId)).resolves.not.toHaveProperty(id);
    });
  });

  describe("a group erased", () => {
    it("deletes its photos before its notes, so a cut-off erase is run again", async () => {
      const { groupId, maker } = await pair();
      const id = crypto.randomUUID();
      await upload(`/v1/groups/${groupId}/photos/${id}`, maker);
      const deletes = failingDeletes();
      await expect(eraseGroup(env, groupId)).rejects.toThrow("R2 out of reach");
      // Still the group, its note of the photo kept.
      await expect(notesOf(groupId)).resolves.toMatchObject({ [id]: "unsent" });
      await expect(
        env.GROUPS.getByName(groupId).getProfile()
      ).resolves.not.toBeNull();

      deletes.mockRestore();
      await eraseGroup(env, groupId);
      await expect(stored(photoKey(groupId, id))).resolves.toBeFalsy();
      await expect(
        env.GROUPS.getByName(groupId).getProfile()
      ).resolves.toBeNull();
    });
  });

  describe("a user's own photo", () => {
    it("is kept apart as an upload until SetProfile takes it", async () => {
      const { maker, makerId } = await pair();
      const id = crypto.randomUUID();
      await expect(upload(`/v1/me/photos/${id}`, maker)).resolves.toBe(204);
      // Never set: only the upload, which the bucket's lifecycle rule takes.
      await expect(
        Promise.all([
          stored(uploadedPhotoKey(makerId, id)),
          stored(personPhotoKey(makerId, id)),
        ])
      ).resolves.toStrictEqual([true, false]);
      await call(
        "UserService/SetProfile",
        { name: "さくら", photoId: id },
        maker
      );
      await expect(stored(personPhotoKey(makerId, id))).resolves.toBeTruthy();
      await expect(
        env.USERS.getByName(makerId).bucketReferences()
      ).resolves.toStrictEqual({ going: [], photoId: id });
    });

    it("replaced, is noted as going until R2 has deleted it", async () => {
      const { maker, makerId } = await pair();
      const first = crypto.randomUUID();
      const next = crypto.randomUUID();
      await upload(`/v1/me/photos/${first}`, maker);
      await upload(`/v1/me/photos/${next}`, maker);
      await call(
        "UserService/SetProfile",
        { name: "さくら", photoId: first },
        maker
      );
      await push(makerId);
      const deletes = failingDeletes();
      await call(
        "UserService/SetProfile",
        { name: "さくら", photoId: next },
        maker
      );
      await userAlarm(makerId);
      await expect(
        stored(personPhotoKey(makerId, first))
      ).resolves.toBeTruthy();
      await expect(
        env.USERS.getByName(makerId).bucketReferences()
      ).resolves.toStrictEqual({ going: [first], photoId: next });

      deletes.mockRestore();
      await userAlarm(makerId);
      await expect(stored(personPhotoKey(makerId, first))).resolves.toBeFalsy();
      await expect(
        env.USERS.getByName(makerId).bucketReferences()
      ).resolves.toStrictEqual({ going: [], photoId: next });
    });

    it("goes with the account, though SetProfile was storing it as it went", async () => {
      const { maker, makerId } = await pair();
      const id = crypto.randomUUID();
      await upload(`/v1/me/photos/${id}`, maker);
      // R2 takes the usual photo's copy only once let.
      const { promise: landed, resolve: land } =
        Promise.withResolvers<undefined>();
      const { promise: storing, resolve: started } =
        Promise.withResolvers<undefined>();
      const put = env.PHOTOS.put.bind(env.PHOTOS);
      vi.spyOn(env.PHOTOS, "put").mockImplementationOnce(async (...args) => {
        started(undefined);
        await landed;
        return await put(...args);
      });
      const set = call(
        "UserService/SetProfile",
        { name: "さくら", photoId: id },
        maker
      );
      await storing;
      const erased = eraseUser(env, makerId);
      land(undefined);
      await Promise.all([set, erased]);
      const left = await Promise.all(
        [`people/${makerId}/`, uploadedPhotoKey(makerId, "")].map(
          async (prefix) => {
            const listed = await env.PHOTOS.list({ prefix });
            return listed.objects.length;
          }
        )
      );
      expect(left).toStrictEqual([0, 0]);
    });

    it("picked as a group's mark, is copied into the group alone", async () => {
      const { groupId, maker, makerId } = await pair();
      const id = crypto.randomUUID();
      await upload(`/v1/me/photos/${id}`, maker);
      const renamed = await call(
        "GroupService/RenameGroup",
        { groupId, mark: { photoId: id }, name: "いとこ会" },
        maker
      );
      expect(renamed.status).toBe(200);
      await expect(
        Promise.all([
          stored(photoKey(groupId, id)),
          stored(personPhotoKey(makerId, id)),
        ])
      ).resolves.toStrictEqual([true, false]);
    });
  });
});
