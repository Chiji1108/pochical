// Sends lines into a group's chat on `mise run server`, as another member,
// so a simulator signed in to that server sees others' lines come in:
// unread ones to open on ここから新着, lines arriving while it is open, a
// page of earlier ones.
//
//   pnpm exec tsx tools/chat-try/index.ts <invite code> [count] [--every <ms>] [--rich]
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
// (POCHICAL_DEV_SERVER, http://localhost:8787 by default); the user it
// made stays in the group, to be removed from the app.
//
//   pnpm exec tsx tools/chat-try/index.ts <invite code> --photos <dir> [--album] [--face <jpeg>]
//
// With `--react <emoji> --to <words>` it sends no lines: it puts that
// reaction on the latest line of exactly those words instead, as another
// member reacting while the chat is open.
//
//   pnpm exec tsx tools/chat-try/index.ts <invite code> --react <emoji> --to <words> [--face <jpeg>]

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { chatRules } from "@pochical/design/chat";

import { devServer } from "../dev-server";
import {
  fail,
  GROUP_THREAD,
  groupSocket,
  inTime,
  openSocket,
  rpc,
  signIn,
  textOf,
  upload,
} from "../group-client";
import type { SyncSocket } from "../group-client";

const DEFAULT_COUNT = 10;

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
    "pnpm exec tsx tools/chat-try/index.ts <invite code> [count] [--every <ms>] [--rich] [--photos <dir> [--album]] [--face <jpeg>]"
  );
}

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

// Each send by its op_id: what it was, to name it if refused.
const sent = new Map<string, string>();

const send = (socket: SyncSocket, lines: Sending[]): void => {
  const edits = lines.map((line) => {
    const opId = crypto.randomUUID();
    sent.set(opId, "text" in line ? line.text : line.files.join(", "));
    return { line, opId };
  });
  socket.send({
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
  });
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
  bytes: new Uint8Array(await readFile(file)),
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

// One JPEG uploaded to the group's photos, as a line carries it.
const uploadPhoto = async (
  jpeg: Jpeg,
  groupId: string,
  token: string
): Promise<Photo> => ({
  id: await upload(devServer, jpeg, groupId, token),
  ...jpegSize(jpeg.bytes),
});

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

const { token, userId } = await signIn(devServer);
const name = `テスト送信${Math.floor(Math.random() * 100)}`;
const groupId = textOf(
  await rpc(
    devServer,
    "GroupService/JoinGroup",
    { displayName: name, inviteCode: code },
    token
  ),
  "groupId"
);

if (face !== undefined) {
  const photoId = await upload(devServer, await readJpeg(face), groupId, token);
  await rpc(
    devServer,
    "GroupService/SetGroupPhoto",
    { groupId, photoId },
    token
  );
}

// The latest line of each words, by its seq.
const seqOfWords = new Map<string, bigint>();
// Who chose each emoji on each line, by its seq, as the group last sent it.
const reactionsOf = new Map<bigint, Map<string, string[]>>();
// The sends the group took as lines.
const taken = new Set<string>();
const socket = await openSocket(
  devServer,
  groupSocket(groupId),
  token,
  ({ kind }) => {
    if (kind.case !== "chatLine") {
      return;
    }
    taken.add(kind.value.opId);
    const { content, reactions, seq } = kind.value;
    // The latest of lines of the same words, whatever order the catch-up
    // brings them in (by cursor, not seq).
    if (
      content?.kind.case === "words" &&
      seq > (seqOfWords.get(content.kind.value.text) ?? 0n)
    ) {
      seqOfWords.set(content.kind.value.text, seq);
    }
    reactionsOf.set(
      seq,
      new Map(reactions.map(({ emoji, userIds }) => [emoji, userIds]))
    );
  }
);

if (reaction !== undefined) {
  await socket.caughtUp();
  const seq =
    seqOfWords.get(reactTo ?? "") ?? fail(`no line of the words ${reactTo}`);
  const opId = crypto.randomUUID();
  socket.send({
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: {
            case: "react",
            value: { emoji: reaction, on: true, seq, threadId: GROUP_THREAD },
          },
          opId,
        },
      ],
    },
  });
  await inTime(socket.answered(opId));
  socket.close();
  // The group answers every edit, taken or not: the line it sent again
  // says whether the reaction is on it.
  if (!(reactionsOf.get(seq)?.get(reaction)?.includes(userId) ?? false)) {
    fail(`refused by the group: ${reaction} on ${reactTo}`);
  }
  console.log(`${name}として${reactTo}に${reaction}を付けました`);
  process.exit(0);
}

const lines = richLines(userId);
const uploaded = await Promise.all(
  jpegs.map(async (jpeg) => ({
    file: jpeg.file,
    photo: await uploadPhoto(jpeg, groupId, token),
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
    await sleep(every);
  }
} else {
  send(socket, sendings);
}
// Until the group has answered every send: the lines it took come before
// its Acked, and a send acked with no line was refused.
await inTime(
  Promise.all([...sent.keys()].map(async (opId) => await socket.answered(opId)))
);
socket.close();
const refused = [...sent]
  .filter(([opId]) => !taken.has(opId))
  .map(([, what]) => `  ${what}`);
console.log(`${name}として${sent.size - refused.length}行送りました`);
if (refused.length > 0) {
  fail(`refused by the group:\n${refused.join("\n")}`);
}
