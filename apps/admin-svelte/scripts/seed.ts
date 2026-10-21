// Gives a local `mise run server` something for the admin pages to show: a
// user's support chat (words, a reply, a photo, a link) and a report in a
// group of two. Local only: SEED_API, or http://localhost:8787.
//
//   bun apps/admin-svelte/scripts/seed.ts
//
// A throwaway helper of the SvelteKit sketch, not held to the repo's lint.
/* oxlint-disable promise/avoid-new, typescript/no-unsafe-type-assertion, typescript/promise-function-async */

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import sharp from "sharp";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../../server/src/gen/pochical/v1/sync_pb";

const api = process.env.SEED_API ?? "http://localhost:8787";

const signIn = async (): Promise<{ token: string; userId: string }> => {
  const response = await fetch(`${api}/api/auth/sign-in/anonymous`, {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const token = response.headers.get("set-auth-token");
  const body = (await response.json()) as { user?: { id?: string } };
  if (token === null || body.user?.id === undefined) {
    throw new Error(`sign-in: ${response.status}`);
  }
  return { token, userId: body.user.id };
};

const rpc = async <T>(method: string, body: unknown, token: string) => {
  const response = await fetch(`${api}/pochical.v1.${method}`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`${method}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
};

const user = await signIn();
const other = await signIn();
const { groupId, inviteCode } = await rpc<{
  groupId: string;
  inviteCode: string;
}>(
  "GroupService/CreateGroup",
  {
    displayName: "通報される人",
    mark: { emoji: "🧪" },
    name: "棚卸しのテスト",
    requestId: crypto.randomUUID(),
  },
  user.token
);
await rpc(
  "GroupService/JoinGroup",
  { displayName: "通報する人", inviteCode },
  other.token
);
await rpc(
  "ChatService/Report",
  { groupId, reason: "REPORT_REASON_HARASSMENT", userId: user.userId },
  other.token
);

const jpeg = await sharp({
  create: { background: "#4a6648", channels: 3, height: 300, width: 400 },
})
  .jpeg()
  .toBuffer();
const photoId = crypto.randomUUID();
const uploaded = await fetch(`${api}/v1/support/photos/${photoId}`, {
  body: jpeg,
  headers: {
    Authorization: `Bearer ${user.token}`,
    "Content-Type": "image/jpeg",
  },
  method: "PUT",
});
if (!uploaded.ok) {
  throw new Error(`photo: ${uploaded.status} ${await uploaded.text()}`);
}

const socket = new WebSocket(
  `${api.replace(/^http/u, "ws")}/v1/me/support/socket`,
  { headers: { Authorization: `Bearer ${user.token}` } }
);
socket.binaryType = "arraybuffer";
const frames: ((frame: ReturnType<typeof read>) => void)[] = [];
const read = (data: ArrayBuffer) =>
  fromBinary(ServerFrameSchema, new Uint8Array(data));
socket.addEventListener("message", (event) => {
  if (event.data instanceof ArrayBuffer) {
    const frame = read(event.data);
    for (const listener of frames) {
      listener(frame);
    }
  }
});
const next = (kind: string) =>
  new Promise<ReturnType<typeof read>>((resolve) => {
    frames.push((frame) => {
      if (frame.kind.case === kind) {
        resolve(frame);
      }
    });
  });
await new Promise((resolve) => {
  socket.addEventListener("open", resolve);
});
const welcomed = next("welcome");
socket.send(
  toBinary(
    ClientFrameSchema,
    create(ClientFrameSchema, {
      kind: { case: "hello", value: { cursor: 0n, protocolVersion: 1 } },
    })
  )
);
await welcomed;

const device = "ポチカル 1.0・iPhone (iOS 26.0)";
const sends = [
  { device, text: "シフトが保存できません", threadId: "group" },
  {
    device,
    photos: [{ height: 300, id: photoId, width: 400 }],
    threadId: "group",
  },
  {
    device,
    replyTo: 1n,
    text: "これの続きです。https://pochical.app を見ました",
    threadId: "group",
  },
];
const acked = next("acked");
socket.send(
  toBinary(
    ClientFrameSchema,
    create(ClientFrameSchema, {
      kind: {
        case: "chatEdits",
        value: {
          edits: sends.map((value) => ({
            kind: { case: "send" as const, value },
            opId: crypto.randomUUID(),
          })),
        },
      },
    })
  )
);
await acked;
socket.close();
console.log(JSON.stringify({ groupId, supportUser: user.userId }));
