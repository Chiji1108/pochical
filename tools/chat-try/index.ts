// Sends lines into a group's chat on `mise run server`, as another member,
// so a simulator signed in to that server sees others' lines come in:
// unread ones to open on ここから新着, lines arriving while it is open, a
// page of earlier ones.
//
//   bun tools/chat-try/index.ts <invite code> [count] [--every <ms>] [--rich]
//
// A new anonymous user joins with the invite code (the group's 招待 link
// ends with it) and sends `count` lines (10 by default) to the group chat,
// one at a time `--every` ms apart (0 by default: all at once). With
// `--rich` the lines are a long chat's, for measuring how it scrolls:
// long words cut at 続きを読む, links, mentions and large emoji. With
// `--photos <dir>` it sends the dir's JPEGs instead, each its own line, in
// the order of their names, or as one album with `--album`; `--face
// <jpeg>` gives the user that face in the group first. Local only
// (http://localhost:8787, or CHAT_TRY_API's); the user it made stays in
// the group, to be removed from the app.
//
//   bun tools/chat-try/index.ts <invite code> --photos <dir> [--album] [--face <jpeg>]

import { readdir } from "node:fs/promises";
import path from "node:path";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../../apps/server/src/gen/pochical/v1/sync_pb";

const api = process.env.CHAT_TRY_API ?? "http://localhost:8787";
const GROUP_THREAD = "group";
const PROTOCOL_VERSION = 1;
const DEFAULT_COUNT = 10;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const flags = new Set(["--rich", "--album"]);
const args = process.argv.slice(2).filter((arg) => !flags.has(arg));
const rich = process.argv.includes("--rich");
const album = process.argv.includes("--album");
const valueOf = (flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
const every = Number(valueOf("--every") ?? 0);
const photoDir = valueOf("--photos");
const face = valueOf("--face");
const [code, countArg] = args.filter(
  (_, index) =>
    !["--every", "--photos", "--face"].some((flag) => {
      const at = args.indexOf(flag);
      return at !== -1 && (index === at || index === at + 1);
    })
);
const count = countArg === undefined ? DEFAULT_COUNT : Number(countArg);
if (code === undefined || !Number.isInteger(count) || count < 1) {
  fail(
    "bun tools/chat-try/index.ts <invite code> [count] [--every <ms>] [--rich] [--photos <dir> [--album]] [--face <jpeg>]"
  );
}

// A Connect JSON call, as the apps make one.
const rpc = async (
  method: string,
  body: Record<string, unknown>,
  token?: string
): Promise<Record<string, unknown>> => {
  const response = await fetch(`${api}/pochical.v1.${method}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    method: "POST",
  });
  const data: unknown = await response.json();
  if (!response.ok || typeof data !== "object" || data === null) {
    return fail(`${method}: ${response.status} ${JSON.stringify(data)}`);
  }
  return Object.fromEntries(Object.entries(data));
};

const signIn = async (): Promise<{ token: string; userId: string }> => {
  const response = await fetch(`${api}/api/auth/sign-in/anonymous`, {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const token = response.headers.get("set-auth-token");
  const body: unknown = await response.json();
  const user =
    typeof body === "object" && body !== null && "user" in body
      ? body.user
      : undefined;
  const userId =
    typeof user === "object" && user !== null && "id" in user
      ? user.id
      : undefined;
  if (!response.ok || token === null || typeof userId !== "string") {
    return fail(`sign-in: ${response.status} ${JSON.stringify(body)}`);
  }
  return { token, userId };
};

// A long chat's lines, in turn: long words, links, a mention, emoji.
const richLines = (userId: string): string[] => [
  "明日のシフト、朝からだっけ？",
  `${"来週の予定をまとめておきます。月曜は早番、火曜は休み、水曜と木曜は遅番で、金曜は研修があるので午後から入ります。".repeat(4)}よろしくお願いします！`,
  "これ見て https://www.apple.com/jp/iphone/ と https://ja.wikipedia.org/wiki/チャット のところ",
  `<@${userId}> 土曜の夜、代わってもらえたりしますか？ 詳しくは https://example.com/shifts/2026/10/swap?from=sat&to=sun に`,
  "🎉🎉",
  "了解です、ありがとう！ 店長にも https://pochical.app で共有しておきます。",
];

type Photo = {
  height: number;
  id: string;
  width: number;
};

type Sending = { photo: Photo } | { text: string };

const send = (socket: WebSocket, lines: Sending[], albumName = ""): void => {
  const frame = create(ClientFrameSchema, {
    kind: {
      case: "chatEdits",
      value: {
        edits: lines.map((line) => ({
          kind: {
            case: "send" as const,
            value:
              "text" in line
                ? { text: line.text, threadId: GROUP_THREAD }
                : {
                    album: albumName,
                    photo: line.photo,
                    threadId: GROUP_THREAD,
                  },
          },
          opId: crypto.randomUUID(),
        })),
      },
    },
  });
  socket.send(toBinary(ClientFrameSchema, frame));
};

const START_OF_FRAME = new Set([0xc0, 0xc1, 0xc2]);

// A JPEG's size, from its start-of-frame segment.
const jpegSize = (bytes: Uint8Array): { height: number; width: number } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 9 < bytes.length) {
    const marker = bytes[at + 1] ?? 0;
    if (START_OF_FRAME.has(marker)) {
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + view.getUint16(at + 2);
  }
  return fail("not a JPEG with a size");
};

// One JPEG uploaded to the group's photos.
const upload = async (
  file: string,
  groupId: string,
  token: string
): Promise<Photo> => {
  const bytes = await Bun.file(file).bytes();
  const id = crypto.randomUUID();
  const response = await fetch(`${api}/v1/groups/${groupId}/photos/${id}`, {
    body: bytes,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/jpeg",
    },
    method: "PUT",
  });
  if (!response.ok) {
    const answer = await response.text();
    fail(`upload ${file}: ${response.status} ${answer}`);
  }
  return { id, ...jpegSize(bytes) };
};

// Each JPEG in `dir`, in the order of their names.
const jpegsIn = async (dir: string): Promise<string[]> => {
  const names = await readdir(dir);
  return names
    .filter((file) => file.toLowerCase().endsWith(".jpg"))
    .toSorted()
    .map((file) => path.join(dir, file));
};

const { token, userId } = await signIn();
const name = `テスト送信${Math.floor(Math.random() * 100)}`;
const joined = await rpc(
  "GroupService/JoinGroup",
  { displayName: name, inviteCode: code },
  token
);
const groupId =
  typeof joined.groupId === "string"
    ? joined.groupId
    : fail(`JoinGroup: no group id in ${JSON.stringify(joined)}`);

if (face !== undefined) {
  const { id } = await upload(face, groupId, token);
  await rpc("GroupService/SetGroupPhoto", { groupId, photoId: id }, token);
}

const socket = new WebSocket(
  `${api.replace(/^http/u, "ws")}/v1/groups/${groupId}/socket`,
  {
    headers: { Authorization: `Bearer ${token}` },
  }
);
socket.binaryType = "arraybuffer";

const welcomed = Promise.withResolvers<undefined>();
socket.addEventListener("open", () => {
  const hello = create(ClientFrameSchema, {
    kind: {
      case: "hello",
      value: { cursor: 0n, protocolVersion: PROTOCOL_VERSION },
    },
  });
  socket.send(toBinary(ClientFrameSchema, hello));
});
socket.addEventListener("message", (event) => {
  if (!(event.data instanceof ArrayBuffer)) {
    return;
  }
  const frame = fromBinary(ServerFrameSchema, new Uint8Array(event.data));
  if (frame.kind.case === "welcome") {
    welcomed.resolve(undefined);
  } else if (frame.kind.case === "error") {
    fail(`server: ${JSON.stringify(frame.kind.value)}`);
  }
});
socket.addEventListener("error", () => fail("socket: could not connect"));
await welcomed.promise;

const lines = richLines(userId);
const files = photoDir === undefined ? [] : await jpegsIn(photoDir);
const photos = await Promise.all(
  files.map(async (file) => await upload(file, groupId, token))
);
const sendings: Sending[] =
  photoDir === undefined
    ? Array.from({ length: count }, (_, index) => ({
        text: rich
          ? (lines[index % lines.length] ?? "")
          : `テスト ${index + 1}`,
      }))
    : photos.map((photo) => ({ photo }));
if (album) {
  send(socket, sendings, crypto.randomUUID());
} else if (every > 0) {
  for (const sending of sendings) {
    send(socket, [sending]);
    // oxlint-disable-next-line no-await-in-loop -- one at a time, as a person sends them
    await Bun.sleep(every);
  }
} else {
  send(socket, sendings);
}
// Time for the group to take them before the socket closes.
await Bun.sleep(1000);
socket.close();
console.log(`${name}として${sendings.length}行送りました`);
