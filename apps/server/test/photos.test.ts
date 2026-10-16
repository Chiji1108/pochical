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
});
