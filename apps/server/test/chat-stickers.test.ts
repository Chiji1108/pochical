import type { MessageInitShape } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { groupReferences } from "../src/bucket-audit";
import type { ChatEditSchema } from "../src/gen/pochical/v1/sync_pb";
import { photoKey } from "../src/photos";
import { alarmsSettled } from "./alarms";
import { arrived, call, ORIGIN } from "./helpers";
import {
  changesIn,
  pair,
  sendFrame,
  settled,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

// A sticker (spec/chat.md, Stickers) as the apps upload one: a WebP or a
// GIF, told by its first bytes.
const ascii = (text: string): number[] =>
  Array.from(text, (letter) => letter.codePointAt(0) ?? 0);
const WEBP = new Uint8Array([
  ...ascii("RIFF"),
  4,
  0,
  0,
  0,
  ...ascii("WEBPVP8L"),
]);
const GIF = new Uint8Array(ascii("GIF89a\u0001\u0000\u0001\u0000"));
const PNG = new Uint8Array([0x89, ...ascii("PNG\r\n\u001A\n")]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** `start` followed by zeros, `size` bytes in all. */
const sized = (start: Uint8Array, size: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes.set(start);
  return bytes;
};

/** How the server answers an upload of `body` to `path`. */
const putStatus = async (
  path: string,
  body: Uint8Array,
  token: string
): Promise<number> => {
  const put = await exports.default.fetch(`${ORIGIN}${path}`, {
    body,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  return put.status;
};

type Kind = MessageInitShape<typeof ChatEditSchema>["kind"];

/** A send of the sticker as its own line, as the composer sends one. */
const stickerLine = (id: string, width = 300, height = 200): Kind => ({
  case: "send",
  value: {
    content: { kind: { case: "sticker", value: { height, id, width } } },
    threadId: "group",
  },
});

const edit = async (
  { socket, frames }: Awaited<ReturnType<typeof syncSocket>>,
  kinds: Kind[]
): Promise<void> => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: kinds.map((kind) => ({ kind, opId: crypto.randomUUID() })),
    },
  });
  await untilAcked(frames);
};

// The chat's lines as a member's device catches up on them, past the
// notice of the guest's joining: each line's sticker, or what it is.
const linesOf = async (groupId: string, token: string) => {
  const { socket, frames } = await syncSocket(
    `/v1/groups/${groupId}/socket`,
    token
  );
  const lines = new Map<number, unknown>();
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- frames come in order
    const frame = await settled(socket, frames);
    if (frame.kind.case === "pong") {
      return [...lines.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([, line]) => line);
    }
    for (const { kind } of changesIn(frame)) {
      const content =
        kind.case === "chatLine" ? kind.value.content?.kind : undefined;
      if (kind.case === "chatLine" && content?.case !== "notice") {
        const { height, id, width } =
          content?.case === "sticker" ? content.value : {};
        lines.set(
          Number(kind.value.seq),
          content?.case === "sticker"
            ? { height, id, width }
            : (content?.case ?? "none")
        );
      }
    }
  }
};

const stored = async (groupId: string, id: string): Promise<boolean> =>
  (await env.PHOTOS.head(photoKey(groupId, id))) !== null;

describe("a sticker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is uploaded as a WebP or a GIF within its limit, a photo as a JPEG within its own", async () => {
    const { groupId, maker } = await pair();
    const at = (id: string) => `/v1/groups/${groupId}/photos/${id}`;
    await expect(
      Promise.all([
        putStatus(at("w"), WEBP, maker),
        putStatus(at("g"), GIF, maker),
        putStatus(at("p"), PNG, maker),
        putStatus(at("big"), sized(WEBP, chatRules.stickerMaxBytes + 1), maker),
        putStatus(
          at("photo"),
          sized(JPEG, chatRules.stickerMaxBytes + 1),
          maker
        ),
        // A small version is a photo's alone, and a face is a photo.
        putStatus(`${at("w2")}?size=small`, WEBP, maker),
        putStatus("/v1/me/photos/face", WEBP, maker),
      ])
    ).resolves.toStrictEqual([204, 204, 415, 413, 204, 415, 415]);

    // Read back as the type it was stored as.
    const read = await exports.default.fetch(`${ORIGIN}${at("w")}`, {
      headers: { Authorization: `Bearer ${maker}` },
    });
    expect(read.headers.get("Content-Type")).toBe("image/webp");
    await expect(read.arrayBuffer()).resolves.toStrictEqual(WEBP.buffer);
  });

  it("is a line of its own, sent once, the sender's own, within its size, and taken back deletes it", async () => {
    const { groupId, guest, maker } = await pair();
    const at = (id: string) => `/v1/groups/${groupId}/photos/${id}`;
    await expect(
      Promise.all([
        putStatus(at("s"), WEBP, maker),
        putStatus(at("large"), WEBP, maker),
        putStatus(at("theirs"), WEBP, guest),
      ])
    ).resolves.toStrictEqual([204, 204, 204]);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [stickerLine("s")]);
    await edit(mine, [
      // Sent already, someone else's, never uploaded, or larger than a
      // sticker is sent.
      stickerLine("s"),
      stickerLine("theirs"),
      stickerLine("nowhere"),
      stickerLine("large", chatRules.stickerMaxEdge + 1, 10),
    ]);
    await expect(linesOf(groupId, guest)).resolves.toStrictEqual([
      { height: 200, id: "s", width: 300 },
    ]);

    await edit(mine, [
      { case: "unsend", value: { seq: 2n, threadId: "group" } },
    ]);
    await expect(linesOf(groupId, guest)).resolves.toStrictEqual(["unsent"]);
    await alarmsSettled(env.GROUPS.getByName(groupId));
    await expect(stored(groupId, "s")).resolves.toBeFalsy();
  });

  it("is named by its line, so the bucket's audit never takes it for an orphan", async () => {
    const { groupId, maker } = await pair();
    await putStatus(`/v1/groups/${groupId}/photos/s`, WEBP, maker);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [stickerLine("s")]);
    await expect(
      runInDurableObject(
        env.GROUPS.getByName(groupId),
        (_, state) => groupReferences(drizzle(state.storage)).photos.s
      )
    ).resolves.toBe("referenced");
  });

  it("is left out of the chat's photos", async () => {
    const { groupId, maker } = await pair();
    await putStatus(`/v1/groups/${groupId}/photos/s`, WEBP, maker);
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [stickerLine("s")]);
    sendFrame(mine.socket, {
      case: "chatPhotosRequest",
      value: { threadId: "group" },
    });
    let frame = await settled(mine.socket, mine.frames);
    while (frame.kind.case !== "chatPhotos") {
      // oxlint-disable-next-line no-await-in-loop -- frames come in order
      frame = await settled(mine.socket, mine.frames);
    }
    expect(frame.kind.value).toMatchObject({ photos: [], total: 0 });
  });

  it("notifies as a sticker, for the app to word", async () => {
    const { groupId, guest, maker } = await pair();
    await call(
      "UserService/RegisterPushToken",
      { platform: "PUSH_PLATFORM_APNS", sandbox: true, token: "a1".repeat(32) },
      guest
    );
    await putStatus(`/v1/groups/${groupId}/photos/s`, WEBP, maker);
    const calls: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(await new Request(input, init).json());
      return new Response(null, { status: 200 });
    });
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await edit(mine, [stickerLine("s")]);
    await arrived(calls, 1);
    expect(calls[0]).toMatchObject({
      aps: {
        alert: { "loc-args": ["さくら"], "loc-key": "CHAT_GROUP_STICKER" },
      },
    });
  });
});
