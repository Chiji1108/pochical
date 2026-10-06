import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { photoKey } from "../src/photos";
import { ORIGIN, signInAnonymously } from "./helpers";
import { changesIn, pair, sendFrame, syncSocket } from "./sync-helpers";

// A JPEG's first bytes and a little more, as the app sends one.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const photo = async (
  method: "GET" | "PUT",
  groupId: string,
  photoId: string,
  token: string,
  body?: Uint8Array
): Promise<Response> =>
  await exports.default.fetch(
    `${ORIGIN}/v1/groups/${groupId}/photos/${photoId}`,
    {
      body,
      headers: { Authorization: `Bearer ${token}` },
      method,
    }
  );

const sendPhoto = (
  socket: WebSocket,
  opId: string,
  id: string,
  size = 100
): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: {
            case: "send",
            value: {
              photo: { height: size, id, width: size },
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

  it("sends the uploader's own photo once, and deletes it when taken back", async () => {
    const { groupId, guest, maker } = await pair();
    await photo("PUT", groupId, "mine", maker, JPEG);
    await photo("PUT", groupId, "theirs", guest, JPEG);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    sendPhoto(mine.socket, "not-uploaded", "nothing");
    sendPhoto(mine.socket, "not-mine", "theirs");
    sendPhoto(mine.socket, "too-large", "mine", 4096);
    sendPhoto(mine.socket, "a", "mine");
    sendPhoto(mine.socket, "again", "mine");
    const sent = [];
    // The catch-up, the photo line, and five acknowledgements.
    for (let frame = 0; frame < 7; frame += 1) {
      sent.push(
        // oxlint-disable-next-line no-await-in-loop -- frames come in order
        ...changesIn(await mine.frames.next()).filter(
          ({ kind }) => kind.case === "chatLine"
        )
      );
    }
    expect(sent).toMatchObject([
      {
        kind: {
          value: { photo: { height: 100, id: "mine", width: 100 }, seq: 1n },
        },
      },
    ]);

    sendFrame(mine.socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: { case: "unsend", value: { seq: 1n, threadId: "group" } },
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
  });
});
