// Usage: bun other.ts <cmd> [args]: the second account, on localhost:8788.
//   init                  sign in, create the group, print its invite code
//   send <text>...        send each text as a line
//   lines                 list the chat's lines: seq, author, text
//   react <seq> <emoji> on|off
//   edit <seq> <text>
//   link <text>           send words with a link, no preview (the server reads it)
//   photos <n> <jpg>...   send n photos as one album
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const worktree = "/Users/chiji/js/pochical/.claude/worktrees/agent-ad0b901a812dfd4e8";
const { create, toBinary, fromBinary } = await import(
  `${worktree}/node_modules/@bufbuild/protobuf/dist/esm/index.js`
);
const sync = await import(`${worktree}/apps/server/src/gen/pochical/v1/sync_pb.ts`);
const ORIGIN = "http://localhost:8788";
const stateFile = `${import.meta.dir}/other.json`;
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));
const [cmd, ...args] = process.argv.slice(2);

const call = async (method: string, body: unknown, token?: string) => {
  const r = await fetch(`${ORIGIN}/pochical.v1.${method}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    method: "POST",
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${r.status} ${t}`);
  return JSON.parse(t);
};

const socket = async () => {
  const ws = new WebSocket(`${ORIGIN.replace("http", "ws")}/v1/groups/${state.groupId}/socket`, {
    headers: { Authorization: `Bearer ${state.token}` },
  } as never);
  ws.binaryType = "arraybuffer";
  const lines = new Map<bigint, any>();
  const waiters: ((f: any) => void)[] = [];
  ws.onmessage = (e) => {
    const f = fromBinary(sync.ServerFrameSchema, new Uint8Array(e.data as ArrayBuffer));
    if (f.kind.case === "changes") {
      for (const c of f.kind.value.changes) {
        if (c.kind.case === "chatLine" && c.kind.value.threadId === "group") lines.set(c.kind.value.seq, c.kind.value);
      }
    }
    if (f.kind.case === "error") console.error("server error", JSON.stringify(f.kind.value));
    for (const w of waiters.splice(0)) w(f);
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const next = (kind: string) => new Promise<any>((r) => {
    const wait = (f: any) => (f.kind.case === kind ? r(f) : waiters.push(wait));
    waiters.push(wait);
  });
  const send = (kind: unknown) => ws.send(toBinary(sync.ClientFrameSchema, create(sync.ClientFrameSchema, { kind } as never)));
  send({ case: "hello", value: { cursor: 0n, protocolVersion: 1 } });
  await next("welcome");
  await Bun.sleep(500);
  const edit = async (kind: unknown) => {
    send({ case: "chatEdits", value: { edits: [{ kind, opId: crypto.randomUUID() }] } });
    await next("acked");
  };
  return { edit, lines, ws };
};

if (cmd === "init") {
  const r = await fetch(`${ORIGIN}/api/auth/sign-in/anonymous`, { body: "{}", headers: { "Content-Type": "application/json" }, method: "POST" });
  state.token = r.headers.get("set-auth-token");
  const g = await call("GroupService/CreateGroup", { displayName: "ゆうき", mark: { emoji: "🍉" }, name: "テスト会", requestId: crypto.randomUUID() }, state.token);
  state.groupId = g.groupId;
  state.inviteCode = g.inviteCode;
  save();
  console.log(JSON.stringify({ groupId: g.groupId, inviteCode: g.inviteCode }));
  process.exit(0);
}
const s = await socket();
if (cmd === "send") {
  for (const text of args) await s.edit({ case: "send", value: { text, threadId: "group" } });
} else if (cmd === "long") {
  const l = "来週の予定をまとめておきます。月曜は早番、火曜は休み、水曜と木曜は遅番で、金曜は研修があるので午後から入ります。";
  await s.edit({ case: "send", value: { text: `${l.repeat(5)}よろしくお願いします！`, threadId: "group" } });
} else if (cmd === "many") {
  for (let i = 0; i < Number(args[0]); i++) await s.edit({ case: "send", value: { text: `${args[1] ?? "line"} ${i + 1}`, threadId: "group" } });
} else if (cmd === "lines") {
  for (const [seq, l] of [...s.lines].sort((a, b) => Number(a[0] - b[0])).slice(-Number(args[0] ?? 15))) {
    console.log(seq, l.authorId === state.userId ? "other" : l.authorId.slice(0, 6), JSON.stringify(l.text.slice(0, 30)), l.photo ? "photo" : "", l.reactions.map((x: any) => `${x.emoji}${x.userIds.length}`).join(""), l.preview ? "preview" : "");
  }
} else if (cmd === "react") {
  await s.edit({ case: "react", value: { emoji: args[1], on: args[2] !== "off", seq: BigInt(args[0]), threadId: "group" } });
} else if (cmd === "unsend") {
  await s.edit({ case: "unsend", value: { seq: BigInt(args[0]), threadId: "group" } });
} else if (cmd === "edit") {
  await s.edit({ case: "change", value: { seq: BigInt(args[0]), text: args[1], threadId: "group" } });
} else if (cmd === "link") {
  await s.edit({ case: "send", value: { text: args[0], threadId: "group" } });
} else if (cmd === "photos") {
  const n = Number(args[0]);
  const album = `album${Date.now()}`;
  for (let i = 0; i < n; i++) {
    const id = crypto.randomUUID();
    const bytes = readFileSync(args[1 + (i % (args.length - 1))]);
    const put = await fetch(`${ORIGIN}/v1/groups/${state.groupId}/photos/${id}`, { body: bytes, headers: { Authorization: `Bearer ${state.token}` }, method: "PUT" });
    if (put.status !== 204) throw new Error(`put ${put.status} ${await put.text()}`);
    await s.edit({ case: "send", value: { album, photo: { height: 600, id, width: 800 }, threadId: "group" } });
  }
}
s.ws.close();
console.log("ok", cmd);
process.exit(0);
