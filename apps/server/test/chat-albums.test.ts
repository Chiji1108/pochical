import type { MessageInitShape } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChatEditSchema } from "../src/gen/pochical/v1/sync_pb";
import { photoKey } from "../src/photos";
import { call, ORIGIN } from "./helpers";
import {
  changesIn,
  pair,
  sendFrame,
  settled,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

// A JPEG's first bytes, as the app sends one.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** How the group answers an upload of the photo. */
const putStatus = async (
  groupId: string,
  id: string,
  token: string
): Promise<number> => {
  const put = await exports.default.fetch(
    `${ORIGIN}/v1/groups/${groupId}/photos/${id}`,
    {
      body: JPEG,
      headers: { Authorization: `Bearer ${token}` },
      method: "PUT",
    }
  );
  return put.status;
};

const upload = async (
  groupId: string,
  ids: string[],
  token: string
): Promise<void> => {
  for (const id of ids) {
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await expect(putStatus(groupId, id, token)).resolves.toBe(204);
  }
};

type Kind = MessageInitShape<typeof ChatEditSchema>["kind"];

/** A send of the photos as one line, as the composer sends them. */
const photoLine = (ids: string[]): Kind => ({
  case: "send",
  value: {
    content: {
      kind: {
        case: "photos",
        value: { photos: ids.map((id) => ({ height: 10, id, width: 10 })) },
      },
    },
    threadId: "group",
  },
});

/** Edits of the chat in one frame, once taken; each its own op_id. */
const edit = async (
  { socket, frames }: Awaited<ReturnType<typeof syncSocket>>,
  kinds: Kind[],
  opIds: string[] = []
): Promise<void> => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: kinds.map((kind, at) => ({
        kind,
        opId: opIds[at] ?? crypto.randomUUID(),
      })),
    },
  });
  await untilAcked(frames);
};

// The chat's lines as a member's device catches up on them, past the
// notice of the guest's joining.
const linesOf = async (groupId: string, token: string) => {
  const { socket, frames } = await syncSocket(
    `/v1/groups/${groupId}/socket`,
    token
  );
  const lines = new Map<
    number,
    {
      photos: string[];
      pinned: boolean;
      reactions: string[];
      seq: number;
      unsent: boolean;
    }
  >();
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- frames come in order
    const frame = await settled(socket, frames);
    if (frame.kind.case === "pong") {
      return [...lines.values()].toSorted((a, b) => a.seq - b.seq);
    }
    for (const { kind } of changesIn(frame)) {
      const content =
        kind.case === "chatLine" ? kind.value.content?.kind : undefined;
      if (kind.case === "chatLine" && content?.case !== "notice") {
        const { pinnedOrder, reactions, seq } = kind.value;
        lines.set(Number(seq), {
          photos:
            content?.case === "photos"
              ? content.value.photos.map(({ id }) => id)
              : [],
          pinned: pinnedOrder > 0n,
          reactions: reactions.map(({ emoji }) => emoji),
          seq: Number(seq),
          unsent: content?.case === "unsent",
        });
      }
    }
  }
};

const storedIn = async (groupId: string, ids: string[]) =>
  await Promise.all(
    ids.map(
      async (id) => (await env.PHOTOS.head(photoKey(groupId, id))) !== null
    )
  );

describe("a line of photos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("holds the photos sent at once, in the order sent, none of them to send again", async () => {
    const { groupId, guest, maker } = await pair();
    await upload(groupId, ["c", "a", "b"], maker);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [photoLine(["b", "c", "a"])]);
    await edit(mine, [photoLine(["a"]), photoLine(["c"])]);
    await expect(linesOf(groupId, guest)).resolves.toMatchObject([
      { photos: ["b", "c", "a"], seq: 2 },
    ]);
  });

  it("takes reactions and a pin as one line, and taken back deletes all its photos", async () => {
    const { groupId, guest, maker } = await pair();
    await upload(groupId, ["p1", "p2", "kept"], maker);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    const theirs = await syncSocket(`/v1/groups/${groupId}/socket`, guest);
    await edit(mine, [photoLine(["p1", "p2"])]);
    await edit(theirs, [
      {
        case: "react",
        value: { emoji: "👍", on: true, seq: 2n, threadId: "group" },
      },
      { case: "pin", value: { on: true, seq: 2n, threadId: "group" } },
    ]);
    await expect(linesOf(groupId, guest)).resolves.toStrictEqual([
      {
        photos: ["p1", "p2"],
        pinned: true,
        reactions: ["👍"],
        seq: 2,
        unsent: false,
      },
    ]);

    await edit(mine, [
      { case: "unsend", value: { seq: 2n, threadId: "group" } },
    ]);
    await expect(linesOf(groupId, guest)).resolves.toStrictEqual([
      { photos: [], pinned: false, reactions: [], seq: 2, unsent: true },
    ]);
    await expect
      .poll(async () => await storedIn(groupId, ["p1", "p2", "kept"]))
      .toStrictEqual([false, false, true]);

    // Its photos' ids are spent: neither uploaded nor sent again.
    await expect(putStatus(groupId, "p1", maker)).resolves.toBe(409);
    await edit(mine, [photoLine(["p2"]), photoLine(["kept"])]);
    await expect(linesOf(groupId, guest)).resolves.toMatchObject([
      { seq: 2, unsent: true },
      { photos: ["kept"], seq: 3 },
    ]);
    await expect(storedIn(groupId, ["p1"])).resolves.toStrictEqual([false]);
  });

  it("taken back before it came deletes every photo it names, the send never coming", async () => {
    const { groupId, guest, maker } = await pair();
    await upload(groupId, ["r1", "r2"], maker);
    await upload(groupId, ["theirs"], guest);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [
      {
        case: "recall",
        value: {
          photoIds: ["r1", "r2", "theirs"],
          sendOpId: "late",
          threadId: "group",
        },
      },
    ]);
    await expect
      .poll(async () => await storedIn(groupId, ["r1", "r2", "theirs"]))
      .toStrictEqual([false, false, true]);
    await edit(mine, [photoLine(["r1", "r2"])], ["late"]);
    await expect(linesOf(groupId, guest)).resolves.toStrictEqual([]);
  });

  it("taken back before it came naming more photos than a send holds deletes none", async () => {
    const { groupId, maker } = await pair();
    const many = Array.from(
      { length: chatRules.photosPerSend + 1 },
      (_, at) => `m${at}`
    );
    await upload(groupId, many, maker);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [
      {
        case: "recall",
        value: { photoIds: many, sendOpId: "late", threadId: "group" },
      },
      // Taken after it, a recall within the most deletes its photo.
      {
        case: "recall",
        value: { photoIds: ["m0"], sendOpId: "later", threadId: "group" },
      },
    ]);
    await expect
      .poll(async () => await storedIn(groupId, many))
      .toStrictEqual(many.map((id) => id !== "m0"));
  });

  it("is dropped empty, or unless its photos are the sender's own, unsent, each once, as many as one send holds", async () => {
    const { groupId, guest, maker } = await pair();
    const many = Array.from(
      { length: chatRules.photosPerSend + 1 },
      (_, at) => `m${at}`
    );
    await upload(groupId, [...many, "sent"], maker);
    await upload(groupId, ["theirs"], guest);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [photoLine(["sent"])]);
    await edit(mine, [
      photoLine(["m0", "m0"]),
      photoLine(many),
      photoLine(["m0", "theirs"]),
      photoLine(["m0", "sent"]),
      photoLine([]),
      { case: "send", value: { threadId: "group" } },
    ]);
    // None of those took m0 and m1, which still go.
    await edit(mine, [photoLine(["m0", "m1"])]);
    await expect(linesOf(groupId, guest)).resolves.toMatchObject([
      { photos: ["sent"], seq: 2 },
      { photos: ["m0", "m1"], seq: 3 },
    ]);
  });

  it("comes as one notification, which nothing collapses", async () => {
    const { groupId, guest, maker } = await pair();
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: "a1".repeat(32) },
      guest
    );
    await upload(groupId, ["n1", "n2", "n3"], maker);
    const pushes: (string | null)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      pushes.push(request.headers.get("apns-collapse-id"));
      // Read through, as APNs reads the payload.
      await request.text();
      return new Response(null, { status: 200 });
    });
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [photoLine(["n1", "n2", "n3"])]);
    await expect.poll(() => pushes.length).toBe(1);
    expect(pushes).toStrictEqual([null]);
  });
});
