import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { directThread } from "../src/group-chat";
import { call, ORIGIN, userIdOf } from "./helpers";
import type { framesOf } from "./sync-helpers";
import {
  pair,
  sendFrame,
  supportChat,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

// A JPEG's first bytes, as the app sends one.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const upload = async (path: string, token: string): Promise<void> => {
  const put = await exports.default.fetch(`${ORIGIN}${path}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  expect(put.status).toBe(204);
};

type Sent = { photo: string } | { text: string } | { unsend: number };

// Sends lines and takes them back, as a member's outbox does, once taken.
const send = async (
  {
    socket,
    frames,
  }: { socket: WebSocket; frames: ReturnType<typeof framesOf> },
  lines: Sent[]
): Promise<void> => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: lines.map((line) => ({
        kind:
          "unsend" in line
            ? {
                case: "unsend" as const,
                value: { seq: BigInt(line.unsend), threadId: "group" },
              }
            : {
                case: "send" as const,
                value:
                  "photo" in line
                    ? {
                        photo: { height: 10, id: line.photo, width: 10 },
                        threadId: "group",
                      }
                    : { text: line.text, threadId: "group" },
              },
        opId: crypto.randomUUID(),
      })),
    },
  });
  await untilAcked(frames);
};

// A page of the chat's photos, as the socket's next ChatPhotos says it.
const photosOf = async (
  {
    socket,
    frames,
  }: { socket: WebSocket; frames: ReturnType<typeof framesOf> },
  seq: number,
  after: boolean,
  threadId = "group"
) => {
  sendFrame(socket, {
    case: "chatPhotosRequest",
    value: { after, seq: BigInt(seq), threadId },
  });
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- frames come in order
    const frame = await frames.next();
    if (frame.kind.case === "chatPhotos") {
      const { offset, photos, total } = frame.kind.value;
      return {
        ids: photos.map(({ photo }) => photo?.id),
        offset,
        seqs: photos.map(({ seq: each }) => Number(each)),
        total,
      };
    }
  }
};

// A group of two whose chat has photos: the maker's m1, m2 and m3 with
// words between, and the guest's g1, at seqs 2, 4, 5 and 6 (after the
// notice of the guest's joining, and the words at 3).
const withPhotos = async () => {
  const { groupId, guest, maker, makerId } = await pair();
  for (const id of ["m1", "m2", "m3"]) {
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await upload(`/v1/groups/${groupId}/photos/${id}`, maker);
  }
  await upload(`/v1/groups/${groupId}/photos/g1`, guest);
  const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
  const theirs = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
  await send(mine, [
    { photo: "m1" },
    { text: "見て" },
    { photo: "m2" },
    { photo: "m3" },
  ]);
  await send(theirs, [{ photo: "g1" }]);
  return { guest, maker, makerId, mine, theirs };
};

describe("a chat's photos alone", () => {
  it("come a page at a time, with how many the reader sees", async () => {
    const { mine, theirs } = await withPhotos();
    await expect(photosOf(mine, 0, false)).resolves.toStrictEqual({
      ids: ["m1", "m2", "m3", "g1"],
      offset: 0,
      seqs: [2, 4, 5, 6],
      total: 4,
    });
    await expect(photosOf(mine, 2, true)).resolves.toMatchObject({
      ids: ["m2", "m3", "g1"],
      offset: 1,
    });
    await expect(photosOf(mine, 5, false)).resolves.toMatchObject({
      ids: ["m1", "m2"],
      offset: 0,
    });

    // Taken back, a photo is no longer among them.
    await send(mine, [{ unsend: 4 }]);
    await expect(photosOf(theirs, 0, false)).resolves.toMatchObject({
      ids: ["m1", "m3", "g1"],
      total: 3,
    });
  });

  it("leave out a blocked member's in the place's own chat, and others' chats", async () => {
    const { guest, maker, makerId, mine, theirs } = await withPhotos();
    // Someone blocked has their photos fold away in the place's own chat,
    // for the one who blocked them alone.
    const guestId = await userIdOf(guest);
    await call(
      "UserService/SetBlocked",
      { blocked: true, userId: guestId },
      maker
    );
    await expect
      .poll(async () => {
        const page = await photosOf(mine, 0, false);
        return page.ids;
      })
      .toStrictEqual(["m1", "m2", "m3"]);
    const unblocked = await photosOf(theirs, 0, false);
    expect(unblocked.total).toBe(4);

    // Nor are someone else's one-to-one chat's photos theirs to page.
    const elsewhere = directThread(makerId, "someone-else");
    await expect(photosOf(theirs, 0, false, elsewhere)).resolves.toStrictEqual({
      ids: [],
      offset: 0,
      seqs: [],
      total: 0,
    });
  });

  it("come the same way in the chat with Pochical's people", async () => {
    const { signInAnonymously } = await import("./helpers");
    const token = await signInAnonymously();
    const support = await supportChat(token);
    await upload("/v1/support/photos/s1", token);
    await send(support, [{ text: "これです" }, { photo: "s1" }]);
    await expect(photosOf(support, 0, false)).resolves.toMatchObject({
      ids: ["s1"],
      offset: 0,
      total: 1,
    });
  });
});
