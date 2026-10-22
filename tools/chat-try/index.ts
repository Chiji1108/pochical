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
// the order of their names, or all as one line (an album) with `--album`
// (chatRules.photosPerSend at most); `--face
// <jpeg>` gives the user that face in the group first. A JPEG longer than
// `chatRules.photoMaxEdge` on a side is refused before anything goes up,
// as the group would refuse its line; the apps shrink theirs to it. Lines
// the group refuses are named, and the script fails. Local only
// (http://localhost:8787, or CHAT_TRY_API's); the user it made stays in
// the group, to be removed from the app.
//
//   bun tools/chat-try/index.ts <invite code> --photos <dir> [--album] [--face <jpeg>]
//
// With `--react <emoji> --to <words>` it sends no lines: it puts that
// reaction on the latest line of exactly those words instead, as another
// member reacting while the chat is open.
//
//   bun tools/chat-try/index.ts <invite code> --react <emoji> --to <words> [--face <jpeg>]

import { readdir } from "node:fs/promises";
import path from "node:path";

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../../apps/server/src/gen/pochical/v1/sync_pb";

const api = process.env.CHAT_TRY_API ?? "http://localhost:8787";
const GROUP_THREAD = "group";
const PROTOCOL_VERSION = 1;
const DEFAULT_COUNT = 10;
const ACK_TIMEOUT_MS = 10_000;

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
const reaction = valueOf("--react");
const reactTo = valueOf("--to");
const [code, countArg] = args.filter(
  (_, index) =>
    !["--every", "--photos", "--face", "--react", "--to"].some((flag) => {
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

type Sending = { photos: Photo[]; files: string[] } | { text: string };

// Each send by its op_id: what it was, to name it if refused, and the
// group's answer to it.
const sent = new Map<
  string,
  { what: string; answered: PromiseWithResolvers<undefined> }
>();

const send = (socket: WebSocket, lines: Sending[]): void => {
  const edits = lines.map((line) => {
    const opId = crypto.randomUUID();
    sent.set(opId, {
      answered: Promise.withResolvers<undefined>(),
      what: "text" in line ? line.text : line.files.join(", "),
    });
    return { line, opId };
  });
  const frame = create(ClientFrameSchema, {
    kind: {
      case: "chatEdits",
      value: {
        edits: edits.map(({ line, opId }) => ({
          kind: {
            case: "send" as const,
            value: {
              content: {
                kind:
                  "text" in line
                    ? { case: "words" as const, value: { text: line.text } }
                    : {
                        case: "photos" as const,
                        value: { photos: line.photos },
                      },
              },
              threadId: GROUP_THREAD,
            },
          },
          opId,
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

type Jpeg = { bytes: Uint8Array<ArrayBuffer>; file: string };

const readJpeg = async (file: string): Promise<Jpeg> => ({
  bytes: await Bun.file(file).bytes(),
  file,
});

// A photo line's JPEG, refused when its longer side is past what the
// group takes for one.
const readPhoto = async (file: string): Promise<Jpeg> => {
  const jpeg = await readJpeg(file);
  const { height, width } = jpegSize(jpeg.bytes);
  if (Math.max(height, width) > chatRules.photoMaxEdge) {
    fail(
      `${file}: ${width}×${height}, longer than chatRules.photoMaxEdge (${chatRules.photoMaxEdge}px) on a side; shrink it first`
    );
  }
  return jpeg;
};

// One JPEG uploaded to the group's photos.
const upload = async (
  { bytes, file }: Jpeg,
  groupId: string,
  token: string
): Promise<Photo> => {
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

const files = photoDir === undefined ? [] : await jpegsIn(photoDir);
if (album && files.length > chatRules.photosPerSend) {
  fail(
    `--album: ${files.length} JPEGs, more than one line holds (chatRules.photosPerSend, ${chatRules.photosPerSend})`
  );
}
const jpegs = await Promise.all(files.map(readPhoto));

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
  const { id } = await upload(await readJpeg(face), groupId, token);
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
// The catch-up has all come: the Pong to the Ping after Welcome.
const caughtUp = Promise.withResolvers<undefined>();
// The latest line of each words, by its seq.
const seqOfWords = new Map<string, bigint>();
// The sends the group took as lines.
const taken = new Set<string>();
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
  } else if (frame.kind.case === "pong") {
    caughtUp.resolve(undefined);
  } else if (frame.kind.case === "changes") {
    for (const { kind } of frame.kind.value.changes) {
      if (kind.case === "chatLine") {
        taken.add(kind.value.opId);
        const { content, seq } = kind.value;
        if (content?.kind.case === "words") {
          seqOfWords.set(content.kind.value.text, seq);
        }
      }
    }
  } else if (frame.kind.case === "acked") {
    for (const opId of frame.kind.value.opIds) {
      sent.get(opId)?.answered.resolve(undefined);
    }
  } else if (frame.kind.case === "error") {
    fail(`server: ${JSON.stringify(frame.kind.value)}`);
  }
});
socket.addEventListener("error", () => fail("socket: could not connect"));
await welcomed.promise;

if (reaction !== undefined) {
  socket.send(
    toBinary(
      ClientFrameSchema,
      create(ClientFrameSchema, {
        kind: { case: "ping", value: { nonce: 1 } },
      })
    )
  );
  await caughtUp.promise;
  const seq =
    seqOfWords.get(reactTo ?? "") ?? fail(`no line of the words ${reactTo}`);
  const opId = crypto.randomUUID();
  const answered = Promise.withResolvers<undefined>();
  sent.set(opId, { answered, what: reaction });
  socket.send(
    toBinary(
      ClientFrameSchema,
      create(ClientFrameSchema, {
        kind: {
          case: "chatEdits",
          value: {
            edits: [
              {
                kind: {
                  case: "react",
                  value: {
                    emoji: reaction,
                    on: true,
                    seq,
                    threadId: GROUP_THREAD,
                  },
                },
                opId,
              },
            ],
          },
        },
      })
    )
  );
  await answered.promise;
  socket.close();
  console.log(`${name}として${reactTo}に${reaction}を付けました`);
  process.exit(0);
}

const lines = richLines(userId);
const uploaded = await Promise.all(
  jpegs.map(async (jpeg) => ({
    file: jpeg.file,
    photo: await upload(jpeg, groupId, token),
  }))
);
const photoLines: Sending[] = album
  ? [
      {
        files: uploaded.map(({ file }) => file),
        photos: uploaded.map(({ photo }) => photo),
      },
    ]
  : uploaded.map(({ file, photo }) => ({ files: [file], photos: [photo] }));
const sendings: Sending[] =
  photoDir === undefined
    ? Array.from({ length: count }, (_, index) => ({
        text: rich
          ? (lines[index % lines.length] ?? "")
          : `テスト ${index + 1}`,
      }))
    : photoLines;
if (every > 0) {
  for (const sending of sendings) {
    send(socket, [sending]);
    // oxlint-disable-next-line no-await-in-loop -- one at a time, as a person sends them
    await Bun.sleep(every);
  }
} else {
  send(socket, sendings);
}
// Until the group has answered every send: the lines it took come before
// its Acked, and a send acked with no line was refused.
const unanswered = setTimeout(() => {
  fail("no answer from the group");
}, ACK_TIMEOUT_MS);
await Promise.all(
  [...sent.values()].map(async ({ answered }) => {
    await answered.promise;
  })
);
clearTimeout(unanswered);
socket.close();
const refused = [...sent]
  .filter(([opId]) => !taken.has(opId))
  .map(([, { what }]) => `  ${what}`);
console.log(`${name}として${sent.size - refused.length}行送りました`);
if (refused.length > 0) {
  fail(`refused by the group:\n${refused.join("\n")}`);
}
