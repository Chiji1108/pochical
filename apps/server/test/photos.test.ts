import { chatRules } from "@pochical/design/chat";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { photoKey, sharePersonPhoto, smallKey } from "../src/photos";
import { alarmsSettled, runAlarm } from "./alarms";
import { call, ORIGIN, signInAnonymously, userIdOf } from "./helpers";
import {
  changesBesidesNotices,
  changesIn,
  holding,
  pair,
  push,
  sendFrame,
  syncSocket,
} from "./sync-helpers";

// A JPEG's first bytes and a little more, as the app sends one.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const photo = async (
  method: "GET" | "PUT",
  groupId: string,
  photoId: string,
  token: string,
  body?: Uint8Array,
  size = ""
): Promise<Response> =>
  await exports.default.fetch(
    `${ORIGIN}/v1/groups/${groupId}/photos/${photoId}${size === "" ? "" : `?size=${size}`}`,
    {
      body,
      headers: { Authorization: `Bearer ${token}` },
      method,
    }
  );

// A ThumbHash's first bytes, as the app makes one.
const THUMB_HASH = new Uint8Array([0x9d, 0xe7, 0x0d, 0x2c, 0x98]);

const sendPhoto = (
  socket: WebSocket,
  opId: string,
  id: string,
  size = 100,
  thumbHash = THUMB_HASH
): void => {
  sendFrame(socket, {
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
                  value: {
                    photos: [{ height: size, id, thumbHash, width: size }],
                  },
                },
              },
              threadId: "group",
            },
          },
          opId,
        },
      ],
    },
  });
};

describe("a group's photos", () => {
  it("are stored for their uploader and read by the members alone", async () => {
    const { groupId, guest, maker } = await pair();
    const outsider = await signInAnonymously();
    // What each upload is answered with, in turn.
    const statusOf = async (token: string, body: Uint8Array) => {
      const answer = await photo("PUT", groupId, "p1", token, body);
      return answer.status;
    };
    // Not a member, not a JPEG, stored, then someone else's id.
    const answers = [
      await statusOf(outsider, JPEG),
      await statusOf(maker, new Uint8Array([1, 2, 3])),
      await statusOf(maker, JPEG),
      await statusOf(guest, JPEG),
    ];
    expect(answers).toStrictEqual([403, 415, 204, 409]);

    const read = await photo("GET", groupId, "p1", guest);
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toStrictEqual(JPEG);
    const outside = await photo("GET", groupId, "p1", outsider);
    expect(outside.status).toBe(403);
  });

  it("keep a small version beside the photo, read in its place when there", async () => {
    const { groupId, guest, maker } = await pair();
    const small = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]);
    const bytesOf = async (photoId: string, size: string) => {
      const read = await photo("GET", groupId, photoId, guest, undefined, size);
      return new Uint8Array(await read.arrayBuffer());
    };
    await photo("PUT", groupId, "p1", maker, JPEG);
    // None yet: the photo itself.
    await expect(bytesOf("p1", "small")).resolves.toStrictEqual(JPEG);
    const theirs = await photo("PUT", groupId, "p1", guest, small, "small");
    expect(theirs.status).toBe(409);
    await photo("PUT", groupId, "p1", maker, small, "small");
    await expect(bytesOf("p1", "small")).resolves.toStrictEqual(small);
    await expect(bytesOf("p1", "")).resolves.toStrictEqual(JPEG);
  });

  it("sends the uploader's own photo once, and deletes it when taken back", async () => {
    const { groupId, guest, maker } = await pair();
    await photo("PUT", groupId, "mine", maker, JPEG, "small");
    await photo("PUT", groupId, "mine", maker, JPEG);
    await photo("PUT", groupId, "theirs", guest, JPEG);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    sendPhoto(mine.socket, "not-uploaded", "nothing");
    sendPhoto(mine.socket, "not-mine", "theirs");
    sendPhoto(mine.socket, "too-large", "mine", 4096);
    sendPhoto(
      mine.socket,
      "too-long-a-thumb-hash",
      "mine",
      100,
      new Uint8Array(26)
    );
    sendPhoto(mine.socket, "a", "mine");
    sendPhoto(mine.socket, "again", "mine");
    const sent = [];
    // The catch-up, the photo line, and six acknowledgements.
    for (let frame = 0; frame < 8; frame += 1) {
      sent.push(
        // oxlint-disable-next-line no-await-in-loop -- frames come in order
        ...changesBesidesNotices(await mine.frames.next()).filter(
          ({ kind }) => kind.case === "chatLine"
        )
      );
    }
    // The chat's second line, after the notice of the guest's joining.
    expect(sent).toMatchObject([
      {
        kind: {
          value: {
            seq: 2n,
            ...holding("photos", {
              photos: [
                {
                  height: 100,
                  id: "mine",
                  thumbHash: THUMB_HASH,
                  width: 100,
                },
              ],
            }),
          },
        },
      },
    ]);

    sendFrame(mine.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: { case: "unsend", value: { seq: 2n, threadId: "group" } },
            opId: "u",
          },
        ],
      },
    });
    expect(changesIn(await mine.frames.next())).toMatchObject([
      { kind: { value: holding("unsent") } },
    ]);
    await expect
      .poll(async () => await env.PHOTOS.head(photoKey(groupId, "mine")))
      .toBeNull();
    await expect
      .poll(
        async () => await env.PHOTOS.head(smallKey(photoKey(groupId, "mine")))
      )
      .toBeNull();
  });

  it("deletes a photo whose send was taken back before it came, the send never coming", async () => {
    const { groupId, guest, maker } = await pair();
    await photo("PUT", groupId, "early", maker, JPEG, "small");
    await photo("PUT", groupId, "early", maker, JPEG);
    await photo("PUT", groupId, "theirs", guest, JPEG);
    const later = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    const recall = (sendOpId: string, photoId: string, opId: string) => {
      sendFrame(later.socket, {
        case: "chatEdits",
        value: {
          edits: [
            {
              kind: {
                case: "recall",
                value: { photoIds: [photoId], sendOpId, threadId: "group" },
              },
              opId,
            },
          ],
        },
      });
    };
    recall("a", "early", "r1");
    // Naming someone else's photo deletes nothing.
    recall("b", "theirs", "r2");
    await expect
      .poll(async () => await env.PHOTOS.head(photoKey(groupId, "early")))
      .toBeNull();
    await expect
      .poll(
        async () => await env.PHOTOS.head(smallKey(photoKey(groupId, "early")))
      )
      .toBeNull();
    await expect(
      env.PHOTOS.head(photoKey(groupId, "theirs"))
    ).resolves.not.toBeNull();

    // Should the send come after all, it is dropped, its photo gone.
    const before = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    sendPhoto(before.socket, "a", "early");
    sendFrame(before.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "send",
              value: {
                content: { kind: { case: "words", value: { text: "次" } } },
                threadId: "group",
              },
            },
            opId: "n",
          },
        ],
      },
    });
    const sent: string[] = [];
    while (!sent.includes("n")) {
      // oxlint-disable-next-line no-await-in-loop -- frames come in order
      const frame = await before.frames.next();
      for (const { kind } of changesBesidesNotices(frame)) {
        if (kind.case === "chatLine") {
          sent.push(kind.value.opId);
        }
      }
    }
    expect(sent).toStrictEqual(["n"]);
  });

  it("deletes the photos no line came to carry once their uploader has uploaded nothing for as long as a line goes by itself", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, guest, maker } = await pair();
    const group = env.GROUPS.getByName(groupId);
    const own = crypto.randomUUID();
    await photo("PUT", groupId, "lost", maker, JPEG, "small");
    await photo("PUT", groupId, "lost", maker, JPEG);
    await photo("PUT", groupId, "sent", maker, JPEG);
    await photo("PUT", groupId, own, maker, JPEG);
    await call("GroupService/SetGroupPhoto", { groupId, photoId: own }, maker);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    sendPhoto(mine.socket, "a", "sent");
    let acked = false;
    while (!acked) {
      // oxlint-disable-next-line no-await-in-loop -- frames come in order
      const frame = await mine.frames.next();
      acked = frame.kind.case === "acked";
    }
    const uploadedAgo = async (ms: number, ...ids: string[]) => {
      await runInDurableObject(group, (_, state) => {
        for (const id of ids) {
          state.storage.sql.exec(
            "update group_photos set uploaded_at = ? where id = ?",
            Date.now() - ms,
            id
          );
        }
      });
    };
    const stored = async (id: string) =>
      (await env.PHOTOS.head(photoKey(groupId, id))) !== null;
    await uploadedAgo(chatRules.unsentAfterMs, "lost", "sent", own);
    await photo("PUT", groupId, "fresh", guest, JPEG);
    await uploadedAgo(chatRules.unsentAfterMs - 60_000, "fresh");

    // The uploads set the alarm, so a group that goes quiet sweeps too.
    await expect(runAlarm(group)).resolves.toBeTruthy();
    const kept = {
      fresh: await stored("fresh"),
      lost: await stored("lost"),
      lostSmall:
        (await env.PHOTOS.head(smallKey(photoKey(groupId, "lost")))) !== null,
      own: await stored(own),
      sent: await stored("sent"),
    };
    expect(kept).toStrictEqual({
      fresh: true,
      lost: false,
      lostSmall: false,
      own: true,
      sent: true,
    });
    // Its id is free of its line for good: a send naming it is dropped.
    await expect(
      runInDurableObject(group, (_, state) =>
        state.storage.sql
          .exec<{ id: string }>("select id from group_photos order by id")
          .toArray()
          .map(({ id }) => id)
      )
    ).resolves.toStrictEqual([own, "fresh", "sent"].toSorted());

    // The alarm comes back for the one still within its time.
    await uploadedAgo(chatRules.unsentAfterMs, "fresh");
    await expect(runAlarm(group)).resolves.toBeTruthy();
    await expect(stored("fresh")).resolves.toBeFalsy();
  });

  it("keeps a member's photos not sent while they upload more, as the rest of a frame's go up", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, maker } = await pair();
    const group = env.GROUPS.getByName(groupId);
    await photo("PUT", groupId, "first", maker, JPEG);
    await runInDurableObject(group, (_, state) => {
      state.storage.sql.exec(
        "update group_photos set uploaded_at = ?",
        Date.now() - chatRules.unsentAfterMs
      );
    });
    await photo("PUT", groupId, "second", maker, JPEG);
    await expect(runAlarm(group)).resolves.toBeTruthy();
    await expect(
      env.PHOTOS.head(photoKey(groupId, "first"))
    ).resolves.not.toBeNull();
  });
});

/** What an upload is answered with. */
const putStatus = async (
  groupId: string,
  photoId: string,
  token: string,
  body: Uint8Array,
  size = ""
): Promise<number> => {
  const answer = await photo("PUT", groupId, photoId, token, body, size);
  return answer.status;
};

// Other bytes of a JPEG, as someone would put in a photo's place.
const OTHER_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);

/** A photo's bytes as stored, or its small version's; null for none. */
const storedBytes = async (
  groupId: string,
  photoId: string,
  small = false
): Promise<Uint8Array | null> => {
  const key = photoKey(groupId, photoId);
  const object = await env.PHOTOS.get(small ? smallKey(key) : key);
  return object === null ? null : new Uint8Array(await object.arrayBuffer());
};

/** A photo of the user's own, uploaded to `/v1/me/photos`. */
const ownPhoto = async (token: string): Promise<string> => {
  const photoId = crypto.randomUUID();
  await exports.default.fetch(`${ORIGIN}/v1/me/photos/${photoId}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  return photoId;
};

/** The user's usual photo set and pushed into the group. */
const usualFace = async (token: string, groupId: string): Promise<string> => {
  const photoId = await ownPhoto(token);
  await call("UserService/SetProfile", { name: "さくら", photoId }, token);
  await push(await userIdOf(token));
  await expect(storedBytes(groupId, photoId)).resolves.not.toBeNull();
  return photoId;
};

/** The group's mark made one of the user's own photos. */
const photoMark = async (token: string, groupId: string): Promise<string> => {
  const photoId = await ownPhoto(token);
  const renamed = await call(
    "GroupService/RenameGroup",
    { groupId, mark: { photoId }, name: "いとこ会" },
    token
  );
  expect(renamed.status).toBe(200);
  return photoId;
};

/**
 * Every photo's upload made long past, and the alarm an upload set run:
 * whether it ran.
 */
const sweepAll = async (groupId: string): Promise<boolean> => {
  const { runInDurableObject } = await import("cloudflare:test");
  const group = env.GROUPS.getByName(groupId);
  await runInDurableObject(group, (_, state) => {
    state.storage.sql.exec(
      "update group_photos set uploaded_at = ?",
      Date.now() - chatRules.unsentAfterMs
    );
  });
  return await runAlarm(group);
};

describe("a group's photo once stored", () => {
  it("is never replaced by an upload under a face's or the mark's id", async () => {
    const { groupId, guest, maker } = await pair();
    const face = await usualFace(maker, groupId);
    const mark = await photoMark(maker, groupId);
    // Another member, or the photo's own person, uploading in its place.
    const answers = [
      await putStatus(groupId, face, guest, OTHER_JPEG),
      await putStatus(groupId, face, guest, OTHER_JPEG, "small"),
      await putStatus(groupId, mark, guest, OTHER_JPEG),
      await putStatus(groupId, face, maker, OTHER_JPEG),
      await putStatus(groupId, mark, maker, OTHER_JPEG),
    ];
    expect(answers).toStrictEqual([409, 409, 409, 409, 409]);
    const stored = {
      face: await storedBytes(groupId, face),
      faceSmall: await storedBytes(groupId, face, true),
      mark: await storedBytes(groupId, mark),
    };
    expect(stored).toStrictEqual({ face: JPEG, faceSmall: null, mark: JPEG });
    // Nor set as another member's own photo in the group.
    const taken = await call(
      "GroupService/SetGroupPhoto",
      { groupId, photoId: face },
      guest
    );
    expect(taken.status).toBe(400);
  });

  it("is never swept as a face, an own group photo or the mark", async () => {
    const { groupId, guest, maker } = await pair();
    const face = await usualFace(maker, groupId);
    const own = crypto.randomUUID();
    await photo("PUT", groupId, own, guest, JPEG);
    await call("GroupService/SetGroupPhoto", { groupId, photoId: own }, guest);
    const mark = await photoMark(guest, groupId);
    // An upload under the face's id first, as one would to have it swept,
    // and a photo no line came to carry, which goes.
    await photo("PUT", groupId, face, guest, OTHER_JPEG);
    await photo("PUT", groupId, "lost", maker, JPEG);
    await expect(sweepAll(groupId)).resolves.toBeTruthy();
    const kept = {
      face: await storedBytes(groupId, face),
      lost: await storedBytes(groupId, "lost"),
      mark: await storedBytes(groupId, mark),
      own: await storedBytes(groupId, own),
    };
    expect(kept).toStrictEqual({
      face: JPEG,
      lost: null,
      mark: JPEG,
      own: JPEG,
    });
  });

  it("is never replaced once a line carries it, its sender's send tried again still going through", async () => {
    const { groupId, guest, maker } = await pair();
    await photo("PUT", groupId, "sent", maker, JPEG);
    const first = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    sendPhoto(first.socket, "a", "sent");
    let acked = false;
    while (!acked) {
      // oxlint-disable-next-line no-await-in-loop -- frames come in order
      const frame = await first.frames.next();
      acked = frame.kind.case === "acked";
    }
    // Its answer lost, the device uploads the photo again before sending
    // the line again: taken, storing nothing. Anyone else is refused.
    const answers = [
      await putStatus(groupId, "sent", maker, OTHER_JPEG),
      await putStatus(groupId, "sent", maker, OTHER_JPEG, "small"),
      await putStatus(groupId, "sent", guest, OTHER_JPEG),
    ];
    expect(answers).toStrictEqual([204, 204, 409]);
    const stored = {
      photo: await storedBytes(groupId, "sent"),
      small: await storedBytes(groupId, "sent", true),
    };
    expect(stored).toStrictEqual({ photo: JPEG, small: null });
    // The send again is the line sent already, so only the next one comes.
    const again = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    // The catch-up, the line sent already in it.
    await again.frames.next();
    sendPhoto(again.socket, "a", "sent");
    sendFrame(again.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "send",
              value: {
                content: { kind: { case: "words", value: { text: "次" } } },
                threadId: "group",
              },
            },
            opId: "n",
          },
        ],
      },
    });
    const lines: string[] = [];
    while (!lines.includes("n")) {
      // oxlint-disable-next-line no-await-in-loop -- frames come in order
      const frame = await again.frames.next();
      for (const { kind } of changesBesidesNotices(frame)) {
        if (kind.case === "chatLine") {
          lines.push(kind.value.opId);
        }
      }
    }
    expect(lines).toStrictEqual(["n"]);
  });

  it("goes as a copy of someone's photo the group never came to name", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, maker, makerId } = await pair();
    const face = await usualFace(maker, groupId);
    // Copied in, then the push or group that would name it failed.
    const stray = await ownPhoto(maker);
    await sharePersonPhoto(env, makerId, stray, groupId);
    await expect(storedBytes(groupId, stray)).resolves.toStrictEqual(JPEG);
    await expect(sweepAll(groupId)).resolves.toBeTruthy();
    const kept = {
      face: await storedBytes(groupId, face),
      stray: await storedBytes(groupId, stray),
    };
    expect(kept).toStrictEqual({ face: JPEG, stray: null });
    await expect(
      runInDurableObject(env.GROUPS.getByName(groupId), (_, state) =>
        state.storage.sql
          .exec<{ id: string }>("select id from group_photos")
          .toArray()
          .map(({ id }) => id)
      )
    ).resolves.toStrictEqual([face]);
  });

  it("is uploaded again by its uploader until sent, kept longer with its first bytes", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, maker } = await pair();
    const group = env.GROUPS.getByName(groupId);
    await photo("PUT", groupId, "again", maker, JPEG);
    const long = Date.now() - chatRules.unsentAfterMs;
    await runInDurableObject(group, (_, state) => {
      state.storage.sql.exec("update group_photos set uploaded_at = ?", long);
    });
    const again = await photo("PUT", groupId, "again", maker, OTHER_JPEG);
    expect(again.status).toBe(204);
    await expect(
      runInDurableObject(
        group,
        (_, state) =>
          state.storage.sql
            .exec<{ at: number }>("select uploaded_at as at from group_photos")
            .one().at
      )
    ).resolves.toBeGreaterThan(long);
    await expect(runAlarm(group)).resolves.toBeTruthy();
    await expect(storedBytes(groupId, "again")).resolves.toStrictEqual(JPEG);
    // And its line still goes.
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    sendPhoto(mine.socket, "a", "again");
    const sent = [];
    while (sent.length === 0) {
      sent.push(
        // oxlint-disable-next-line no-await-in-loop -- frames come in order
        ...changesBesidesNotices(await mine.frames.next()).filter(
          ({ kind }) => kind.case === "chatLine"
        )
      );
    }
    expect(sent).toMatchObject([
      { kind: { value: holding("photos", { photos: [{ id: "again" }] }) } },
    ]);
  });

  it("is copied in again when noted again while the sweep deletes it", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, maker, makerId } = await pair();
    const group = env.GROUPS.getByName(groupId);
    const stray = await ownPhoto(maker);
    await sharePersonPhoto(env, makerId, stray, groupId);
    // No run of the runtime's goes with the test's own below.
    await alarmsSettled(group);
    await runInDurableObject(group, (_, state) => {
      state.storage.sql.exec(
        "update group_photos set uploaded_at = ?",
        Date.now() - chatRules.unsentAfterMs
      );
    });
    await runInDurableObject(group, async (instance) => {
      // The sweep is waiting on storage once the alarm returns.
      const sweeping = instance.alarm();
      // Shared again while the sweep waits: the copy finds it still stored.
      await instance.sharePhoto(stray, makerId);
      await sweeping;
    });
    await expect(storedBytes(groupId, stray)).resolves.toStrictEqual(JPEG);
    await expect(
      runInDurableObject(group, (_, state) =>
        state.storage.sql
          .exec<{ id: string; state: string }>(
            "select id, state from group_photos"
          )
          .toArray()
      )
    ).resolves.toStrictEqual([{ id: stray, state: "shown" }]);
  });

  it("is copied in anew by the next sweep when the copy after the delete fails", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, maker, makerId } = await pair();
    const group = env.GROUPS.getByName(groupId);
    const stray = await ownPhoto(maker);
    await sharePersonPhoto(env, makerId, stray, groupId);
    // No run of the runtime's goes with the test's own below.
    await alarmsSettled(group);
    await runInDurableObject(group, (_, state) => {
      state.storage.sql.exec(
        "update group_photos set uploaded_at = ?",
        Date.now() - chatRules.unsentAfterMs
      );
    });
    const get = vi
      .spyOn(env.PHOTOS, "get")
      .mockRejectedValueOnce(new Error("R2 out of reach"));
    const retryAt = await runInDurableObject(group, async (instance, state) => {
      const sweeping = instance.alarm();
      await instance.sharePhoto(stray, makerId);
      await sweeping;
      return await state.storage.getAlarm();
    });
    get.mockRestore();
    // Not copied in again yet, and the alarm comes back for it.
    await expect(storedBytes(groupId, stray)).resolves.toBeNull();
    expect(retryAt).not.toBeNull();
    await expect(runAlarm(group)).resolves.toBeTruthy();
    await expect(storedBytes(groupId, stray)).resolves.toStrictEqual(JPEG);
    await expect(
      runInDurableObject(group, (_, state) =>
        state.storage.sql
          .exec<{ id: string; state: string }>(
            "select id, state from group_photos"
          )
          .toArray()
      )
    ).resolves.toStrictEqual([{ id: stray, state: "shown" }]);
  });

  it("makes its uploader wait while the sweep deletes it, then stores it anew", async () => {
    const { runInDurableObject } = await import("cloudflare:test");
    const { groupId, maker, makerId } = await pair();
    const group = env.GROUPS.getByName(groupId);
    await photo("PUT", groupId, "lost", maker, JPEG);
    // No run of the runtime's goes with the test's own below.
    await alarmsSettled(group);
    await runInDurableObject(group, (_, state) => {
      state.storage.sql.exec(
        "update group_photos set uploaded_at = ?",
        Date.now() - chatRules.unsentAfterMs
      );
    });
    const noted = await runInDurableObject(group, async (instance) => {
      // The sweep is waiting on storage's delete once the alarm returns.
      const sweeping = instance.alarm();
      const note = await instance.storePhoto("lost", makerId, OTHER_JPEG, {
        contentType: "image/jpeg",
        small: false,
      });
      await sweeping;
      return note;
    });
    expect(noted).toBe("going");
    await expect(
      runInDurableObject(group, (_, state) =>
        state.storage.sql.exec("select id from group_photos").toArray()
      )
    ).resolves.toStrictEqual([]);
    // Its id is free once forgotten: the upload tried again stores it.
    await expect(putStatus(groupId, "lost", maker, JPEG)).resolves.toBe(204);
    await expect(
      env.PHOTOS.head(photoKey(groupId, "lost"))
    ).resolves.not.toBeNull();
  });
});
