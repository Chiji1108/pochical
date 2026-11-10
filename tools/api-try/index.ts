// Tries the server's group and invitation API by hand, before the apps
// exist: makes a group as a new anonymous user, prints its invitation link
// (to paste into LINE and see its card), lets another user join, remakes
// the link, and cleans up after itself.
//
//   mise run api:try -- <command> [--local]
//
//   create [name] [emoji]  a new user makes a group and gets its link
//   join                   another new user joins with the link
//   preview                what the link shows: the API's preview and the
//                          site's page title (the card's title)
//   remake                 the maker remakes the link; the old one stops
//   cleanup                deletes the users this tool made and the link
//
// Production (https://api.pochical.app) by default; --local uses
// `mise run server` (POCHICAL_DEV_SERVER, http://localhost:8787 by
// default) and `mise run web` (http://localhost:3000). What it made is
// kept in tools/api-try/out/state.json
// for the next command. cleanup deletes through wrangler, so it needs the
// Cloudflare login wrangler uses; the groups' Durable Objects stay, but
// nothing can reach them once their users and link are gone.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { devServer } from "../dev-server";
import { fail, rpc, signIn, textOf } from "../group-client";

type User = { name: string; token: string; userId: string };

type State = {
  local: boolean;
  users: User[];
  groupId?: string;
  inviteCode?: string;
};

const local = process.argv.includes("--local");
const [command = "", ...rest] = process.argv
  .slice(2)
  .filter((arg) => arg !== "--local");
const api = local ? devServer : "https://api.pochical.app";
const site = local ? "http://localhost:3000" : "https://pochical.app";
const outDir = path.join(import.meta.dirname, "out");
const statePath = path.join(outDir, "state.json");
const serverDir = path.join(import.meta.dirname, "../../apps/server");

// Ids that go into SQL for cleanup: better-auth's ids and UUIDs.
const SAFE_ID = /^[\w-]+$/u;
const TITLE = /<title>(?<title>[^<]*)<\/title>/u;

// SQL string list of ids already checked against SAFE_ID.
const sqlList = (values: string[]): string =>
  values.map((value) => `'${value}'`).join(", ");

const isState = (value: unknown): value is State =>
  typeof value === "object" &&
  value !== null &&
  "local" in value &&
  typeof value.local === "boolean" &&
  "users" in value &&
  Array.isArray(value.users);

const loadState = async (): Promise<State> => {
  if (!existsSync(statePath)) {
    return { local, users: [] };
  }
  const state: unknown = JSON.parse(await readFile(statePath, "utf-8"));
  if (!isState(state)) {
    return fail("out/state.json is not this tool's; delete it");
  }
  if (state.local !== local) {
    fail(
      `out/state.json is for ${state.local ? "--local" : "production"}; run cleanup there first`
    );
  }
  return state;
};

const saveState = async (state: State): Promise<void> => {
  await mkdir(outDir, { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
};

// A new user, by the name they take in the group.
const newUser = async (name: string): Promise<User> => ({
  name,
  ...(await signIn(api)),
});

const linkOf = (code: string): string => `${site}/invite/${code}`;

const requireGroup = (state: State): { groupId: string; code: string } => {
  if (state.groupId === undefined || state.inviteCode === undefined) {
    return fail("No group yet: run create first");
  }
  return { code: state.inviteCode, groupId: state.groupId };
};

const create = async (state: State): Promise<void> => {
  const [name = "ポチカルのテスト", emoji = "🧪"] = rest;
  const maker = await newUser(`テスト${state.users.length + 1}`);
  const made = await rpc(
    api,
    "GroupService/CreateGroup",
    {
      displayName: maker.name,
      mark: { emoji },
      name,
      requestId: crypto.randomUUID(),
    },
    maker.token
  );
  const groupId = textOf(made, "groupId");
  const inviteCode = textOf(made, "inviteCode");
  await saveState({
    ...state,
    groupId,
    inviteCode,
    users: [...state.users, maker],
  });
  console.log(`「${name}」を作りました（${maker.name}）`);
  console.log(`招待リンク: ${linkOf(inviteCode)}`);
};

const join = async (state: State): Promise<void> => {
  const { code } = requireGroup(state);
  const guest = await newUser(`テスト${state.users.length + 1}`);
  const { alreadyMember } = await rpc(
    api,
    "GroupService/JoinGroup",
    { displayName: guest.name, inviteCode: code },
    guest.token
  );
  await saveState({ ...state, users: [...state.users, guest] });
  console.log(
    alreadyMember === true
      ? `${guest.name}はもう参加しています`
      : `${guest.name}が参加しました`
  );
};

const preview = async (state: State): Promise<void> => {
  const { code } = requireGroup(state);
  const shown = await rpc(api, "InviteService/GetInvitePreview", {
    inviteCode: code,
  });
  // Connect's JSON leaves out a mark that is no emoji and a count of 0.
  const mark = shown.groupMark;
  const emoji =
    typeof mark === "object" &&
    mark !== null &&
    "emoji" in mark &&
    typeof mark.emoji === "string"
      ? mark.emoji
      : "";
  const members = typeof shown.memberCount === "number" ? shown.memberCount : 0;
  console.log(`${emoji} ${textOf(shown, "groupName")}（${members}人）`);
  const page = await fetch(linkOf(code));
  const title = TITLE.exec(await page.text())?.groups?.title;
  console.log(`ページのタイトル: ${title ?? `（${page.status}）`}`);
};

const remake = async (state: State): Promise<void> => {
  const { code: old, groupId } = requireGroup(state);
  const [maker] = state.users;
  if (!maker) {
    return fail("No maker in out/state.json");
  }
  const inviteCode = textOf(
    await rpc(api, "GroupService/RemakeInviteLink", { groupId }, maker.token),
    "inviteCode"
  );
  await saveState({ ...state, inviteCode });
  console.log(`作り直しました: ${linkOf(inviteCode)}`);
  console.log(`（古いリンク ${linkOf(old)} はもう使えません）`);
};

const cleanup = async (state: State): Promise<void> => {
  const ids = state.users.map((user) => user.userId);
  const groupIds = state.groupId === undefined ? [] : [state.groupId];
  if (![...ids, ...groupIds].every((id) => SAFE_ID.test(id))) {
    return fail("Unexpected id in out/state.json; not deleting");
  }
  if (ids.length > 0 || groupIds.length > 0) {
    const sql = [
      ids.length > 0 &&
        `DELETE FROM session WHERE user_id IN (${sqlList(ids)})`,
      ids.length > 0 &&
        `DELETE FROM account WHERE user_id IN (${sqlList(ids)})`,
      ids.length > 0 && `DELETE FROM user WHERE id IN (${sqlList(ids)})`,
      groupIds.length > 0 &&
        `DELETE FROM invites WHERE group_id IN (${sqlList(groupIds)})`,
    ]
      .filter(Boolean)
      .join("; ");
    const wrangler = spawnSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "pochical",
        local ? "--local" : "--remote",
        "--command",
        sql,
      ],
      { cwd: serverDir, stdio: ["ignore", "ignore", "inherit"] }
    );
    if (wrangler.status !== 0) {
      return fail("wrangler d1 execute failed; out/state.json is kept");
    }
  }
  await rm(statePath, { force: true });
  console.log(
    `${ids.length}人のユーザーと${groupIds.length}つのグループのリンクを削除しました`
  );
};

const commands: Record<string, (state: State) => Promise<void>> = {
  cleanup,
  create,
  join,
  preview,
  remake,
};

const run = commands[command];
if (run) {
  await run(await loadState());
} else {
  fail(
    "使い方: mise run api:try -- <create [名前] [絵文字] | join | preview | remake | cleanup> [--local]"
  );
}
