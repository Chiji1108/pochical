import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const upload = async (path: string, token: string): Promise<void> => {
  const put = await exports.default.fetch(`${ORIGIN}${path}`, {
    body: JPEG,
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
  });
  expect(put.status).toBe(204);
};

type Sent = { photo: string; album: string } | { text: string; album: string };

// Sends lines at once, as the composer sends an album, once taken.
const send = async (
  { socket, frames }: Awaited<ReturnType<typeof syncSocket>>,
  lines: Sent[]
): Promise<void> => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: lines.map((line) => ({
        kind: {
          case: "send" as const,
          value:
            "photo" in line
              ? {
                  album: line.album,
                  photo: { height: 10, id: line.photo, width: 10 },
                  threadId: "group",
                }
              : { album: line.album, text: line.text, threadId: "group" },
        },
        opId: crypto.randomUUID(),
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
  const lines: { seq: number; album: string; photo?: string; text: string }[] =
    [];
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- frames come in order
    const frame = await settled(socket, frames);
    if (frame.kind.case === "pong") {
      return lines;
    }
    for (const { kind } of changesIn(frame)) {
      if (kind.case === "chatLine" && kind.value.notice === undefined) {
        lines.push({
          album: kind.value.album,
          photo: kind.value.photo?.id,
          seq: Number(kind.value.seq),
          text: kind.value.text,
        });
      }
    }
  }
};

describe("an album", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is photos sent at once under one name, which words cannot take", async () => {
    const { groupId, guest, maker } = await pair();
    for (const id of ["a1", "a2", "b1"]) {
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await upload(`/v1/groups/${groupId}/photos/${id}`, maker);
    }
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    await send(mine, [
      { album: "x", photo: "a1" },
      { album: "x", photo: "a2" },
      // Words never go in an album.
      { album: "x", text: "見て" },
      // A name past 64 characters is refused.
      { album: "y".repeat(65), photo: "b1" },
    ]);
    await expect(linesOf(groupId, guest)).resolves.toStrictEqual([
      { album: "x", photo: "a1", seq: 2, text: "" },
      { album: "x", photo: "a2", seq: 3, text: "" },
    ]);
  });

  it("comes as one notification, each photo in the last one's place", async () => {
    const { groupId, guest, maker } = await pair();
    await call(
      "UserService/RegisterPushToken",
      { sandbox: true, token: "a1".repeat(32) },
      guest
    );
    for (const id of ["a1", "a2", "solo"]) {
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await upload(`/v1/groups/${groupId}/photos/${id}`, maker);
    }
    const collapse: (string | null)[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      collapse.push(new Request(input, init).headers.get("apns-collapse-id"));
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const mine = await syncSocket(`/v1/groups/${groupId}/socket`, maker);
    // Each as its upload ends, as the outbox sends them.
    await send(mine, [{ album: "x", photo: "a1" }]);
    await send(mine, [{ album: "x", photo: "a2" }]);
    await send(mine, [{ album: "", photo: "solo" }]);
    await expect.poll(() => collapse.length).toBe(3);
    expect(collapse).toStrictEqual(["group/x", "group/x", null]);
  });
});
