// Sends lines into a group's chat on `mise run server`, as another member,
// so a simulator signed in to that server sees others' lines come in:
// unread ones to open on ここから新着, lines arriving while it is open, a
// page of earlier ones.
//
//   bun tools/chat-try/index.ts <invite code> [count] [--every <ms>]
//
// A new anonymous user joins with the invite code (the group's 招待 link
// ends with it) and sends `count` lines (10 by default) to the group chat,
// one at a time `--every` ms apart (0 by default: all at once). Local only
// (http://localhost:8787); the user it made stays in the group, to be
// removed from the app.

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";

import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../../apps/server/src/gen/pochical/v1/sync_pb";

const api = "http://localhost:8787";
const GROUP_THREAD = "group";
const PROTOCOL_VERSION = 1;
const DEFAULT_COUNT = 10;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
const everyAt = args.indexOf("--every");
const every = everyAt === -1 ? 0 : Number(args[everyAt + 1]);
const [code, countArg] = args.filter(
  (_, index) => everyAt === -1 || (index !== everyAt && index !== everyAt + 1)
);
const count = countArg === undefined ? DEFAULT_COUNT : Number(countArg);
if (code === undefined || !Number.isInteger(count) || count < 1) {
  fail("bun tools/chat-try/index.ts <invite code> [count] [--every <ms>]");
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

const signIn = async (): Promise<string> => {
  const response = await fetch(`${api}/api/auth/sign-in/anonymous`, {
    body: "{}",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const token = response.headers.get("set-auth-token");
  if (!response.ok || token === null) {
    return fail(`sign-in: ${response.status} ${await response.text()}`);
  }
  return token;
};

const send = (socket: WebSocket, texts: string[]): void => {
  const frame = create(ClientFrameSchema, {
    kind: {
      case: "chatEdits",
      value: {
        edits: texts.map((text) => ({
          kind: { case: "send", value: { text, threadId: GROUP_THREAD } },
          opId: crypto.randomUUID(),
        })),
      },
    },
  });
  socket.send(toBinary(ClientFrameSchema, frame));
};

const token = await signIn();
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

const socket = new WebSocket(
  `ws://localhost:8787/v1/groups/${groupId}/socket`,
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

const texts = Array.from(
  { length: count },
  (_, index) => `テスト ${index + 1}`
);
if (every > 0) {
  for (const text of texts) {
    send(socket, [text]);
    // oxlint-disable-next-line no-await-in-loop -- one at a time, as a person sends them
    await Bun.sleep(every);
  }
} else {
  send(socket, texts);
}
// Time for the group to take them before the socket closes.
await Bun.sleep(1000);
socket.close();
console.log(`${name}として${count}行送りました`);
