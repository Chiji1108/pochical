import { chatRules } from "@pochical/design/chat";
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { photoKey, smallKey } from "../src/photos";
import { ORIGIN, signInAnonymously } from "./helpers";
import {
  changesBesidesNotices,
  changesIn,
  pair,
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
              photo: { height: size, id, thumbHash, width: size },
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
            photo: {
              height: 100,
              id: "mine",
              thumbHash: THUMB_HASH,
              width: 100,
            },
            seq: 2n,
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
      { kind: { value: { unsent: true } } },
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
                value: { photoId, sendOpId, threadId: "group" },
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
            kind: { case: "send", value: { text: "次", threadId: "group" } },
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
    const { runDurableObjectAlarm, runInDurableObject } =
      await import("cloudflare:test");
    const { call } = await import("./helpers");
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
            "update chat_photos set uploaded_at = ? where id = ?",
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
    await expect(runDurableObjectAlarm(group)).resolves.toBeTruthy();
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
          .exec<{ id: string }>("select id from chat_photos order by id")
          .toArray()
          .map(({ id }) => id)
      )
    ).resolves.toStrictEqual([own, "fresh", "sent"].toSorted());

    // The alarm comes back for the one still within its time.
    await uploadedAgo(chatRules.unsentAfterMs, "fresh");
    await expect(runDurableObjectAlarm(group)).resolves.toBeTruthy();
    await expect(stored("fresh")).resolves.toBeFalsy();
  });

  it("keeps a member's photos not sent while they upload more, as the rest of a frame's go up", async () => {
    const { runDurableObjectAlarm, runInDurableObject } =
      await import("cloudflare:test");
    const { groupId, maker } = await pair();
    const group = env.GROUPS.getByName(groupId);
    await photo("PUT", groupId, "first", maker, JPEG);
    await runInDurableObject(group, (_, state) => {
      state.storage.sql.exec(
        "update chat_photos set uploaded_at = ?",
        Date.now() - chatRules.unsentAfterMs
      );
    });
    await photo("PUT", groupId, "second", maker, JPEG);
    await runDurableObjectAlarm(group);
    await expect(
      env.PHOTOS.head(photoKey(groupId, "first"))
    ).resolves.not.toBeNull();
  });
});
