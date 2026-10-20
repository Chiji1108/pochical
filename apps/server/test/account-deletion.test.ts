import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { supportPlace } from "../src/support-lines";
import { appleKeys, idToken, link } from "./apple-helpers";
import {
  call,
  failTelling,
  ORIGIN,
  signInAnonymously,
  userIdOf,
} from "./helpers";
import {
  pair,
  sendFrame,
  supportChat,
  syncSocket,
  untilAcked,
} from "./sync-helpers";

/** A line in the group's chat, sent and taken. */
const say = async (groupId: string, token: string, text: string) => {
  const { frames, socket } = await syncSocket(
    `/v1/groups/${groupId}/socket`,
    token
  );
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: [
        {
          kind: { case: "send", value: { text, threadId: "group" } },
          opId: crypto.randomUUID(),
        },
      ],
    },
  });
  await untilAcked(frames);
  socket.close();
};

/** The rows of `sql` in the group's own database. */
const inGroup = async (groupId: string, sql: string) =>
  await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) =>
    state.storage.sql.exec(sql).toArray()
  );

const deleteAccount = async (token: string, appleAuthorizationCode = "") => {
  const response = await call(
    "UserService/DeleteAccount",
    { appleAuthorizationCode },
    token
  );
  return response.status;
};

const signedIn = async (token: string): Promise<number> => {
  const response = await call("UserService/GetMe", {}, token);
  return response.status;
};

describe("deleting an account", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes back every line the user wrote and their name, and the rest of the group goes on", async () => {
    const { groupId, guest, maker } = await pair();
    const guestId = await userIdOf(guest);
    await say(groupId, maker, "やあ");
    await say(groupId, guest, "こんにちは");
    const support = await supportChat(guest);
    await support.say("消してください");
    await env.PHOTOS.put(`groups/${supportPlace(guestId)}/photos/p1`, "jpeg");
    await expect(deleteAccount(guest)).resolves.toBe(200);

    // The app's notices of their joining and leaving stay, as the group's.
    const lines = await inGroup(
      groupId,
      "select text, unsent from chat_lines where notice is null order by seq"
    );
    const notices = await inGroup(
      groupId,
      `select author_id, notice ->> '$.kind' as kind from chat_lines where notice is not null and author_id = '${guestId}' order by seq`
    );
    const theirs = await inGroup(
      groupId,
      `select display_name, deleted, left_at is not null as gone from members where user_id = '${guestId}'`
    );
    const supportLines = await runInDurableObject(
      env.GROUPS.getByName(supportPlace(guestId)),
      (_, state) =>
        state.storage.sql
          .exec<{ n: number }>("select count(*) as n from chat_lines")
          .one().n
    );
    const indexed = await env.DB.prepare(
      "select count(*) as n from support_chats where user_id = ?"
    )
      .bind(guestId)
      .first<number>("n");
    const photos = await env.PHOTOS.list({
      prefix: `groups/${supportPlace(guestId)}/`,
    });
    const groups = await runInDurableObject(
      env.USERS.getByName(guestId),
      (_, state) =>
        state.storage.sql.exec("select * from memberships").toArray()
    );
    expect({
      groups,
      lines,
      notices,
      photos: photos.objects.length,
      signedIn: await signedIn(guest),
      support: [supportLines, indexed],
      theirs,
    }).toStrictEqual({
      groups: [],
      lines: [
        { text: "やあ", unsent: 0 },
        { text: "", unsent: 1 },
      ],
      notices: [
        { author_id: guestId, kind: "joined" },
        { author_id: guestId, kind: "left" },
      ],
      photos: 0,
      signedIn: 401,
      support: [0, 0],
      theirs: [{ deleted: 1, display_name: "", gone: 1 }],
    });
  });

  it("leaves no name or photo in a group their own DO never heard they joined", async () => {
    const { groupId, inviteCode } = await pair();
    const guest = await signInAnonymously();
    const guestId = await userIdOf(guest);
    const restore = await failTelling(groupId, guestId);
    const joined = await call(
      "GroupService/JoinGroup",
      { displayName: "ひかる", inviteCode },
      guest
    );
    expect(joined.status).toBe(503);
    // Their face, as their DO would have pushed it.
    await runInDurableObject(env.GROUPS.getByName(groupId), (_, state) => {
      state.storage.sql.exec(
        "update members set usual_photo = 'face' where user_id = ?",
        guestId
      );
    });

    await expect(deleteAccount(guest)).resolves.toBe(200);
    await restore();
    await expect(
      inGroup(
        groupId,
        `select deleted, display_name, usual_name, usual_photo, own_name, own_photo, left_at is not null as gone from members where user_id = '${guestId}'`
      )
    ).resolves.toStrictEqual([
      {
        deleted: 1,
        display_name: "",
        gone: 1,
        own_name: null,
        own_photo: null,
        usual_name: "",
        usual_photo: "",
      },
    ]);
    await expect(
      inGroup(groupId, "select * from membership_outbox")
    ).resolves.toStrictEqual([]);
  });

  it("deletes a group whole when no one else is left in it", async () => {
    const maker = await signInAnonymously();
    const created = await call(
      "GroupService/CreateGroup",
      {
        displayName: "さくら",
        mark: { emoji: "🍉" },
        name: "ひとり",
        requestId: crypto.randomUUID(),
      },
      maker
    );
    const body: unknown = await created.json();
    const groupId =
      typeof body === "object" && body !== null && "groupId" in body
        ? String(body.groupId)
        : "";
    await env.PHOTOS.put(`groups/${groupId}/photos/p1`, "jpeg");
    await expect(deleteAccount(maker)).resolves.toBe(200);
    const invite = await env.DB.prepare(
      "select count(*) as n from invites where group_id = ?"
    )
      .bind(groupId)
      .first<number>("n");
    const photos = await env.PHOTOS.list({ prefix: `groups/${groupId}/` });
    expect([
      invite,
      photos.objects.length,
      await inGroup(groupId, "select * from members"),
    ]).toStrictEqual([0, 0, []]);
  });

  it("revokes Apple's tokens first, and goes no further without a code Apple takes", async () => {
    const asked: { path: string; form: URLSearchParams }[] = [];
    let takes: "none" | "other" | "theirs" = "none";
    appleKeys((request) => {
      const url = new URL(request.url);
      if (url.host !== "appleid.apple.com") {
        return undefined;
      }
      void request.text().then((text) => {
        asked.push({ form: new URLSearchParams(text), path: url.pathname });
      });
      if (url.pathname === "/auth/token") {
        if (takes === "none") {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        const sub = takes === "other" ? "someone-else" : "apple-del";
        const body = btoa(JSON.stringify({ sub }));
        return Response.json({
          id_token: `head.${body}.signature`,
          refresh_token: "refresh-1",
        });
      }
      return new Response(null, { status: 200 });
    });
    const token = await signInAnonymously();
    await link(token, await idToken("apple-del", "n1"), "n1");
    const statuses = [
      await deleteAccount(token),
      await deleteAccount(token, "stale-code"),
    ];
    takes = "other";
    statuses.push(
      await deleteAccount(token, "another-apple-id"),
      await signedIn(token)
    );
    takes = "theirs";
    statuses.push(
      await deleteAccount(token, "fresh-code"),
      await signedIn(token)
    );
    const revoke = asked.find(({ path }) => path === "/auth/revoke");
    expect([
      statuses,
      revoke?.form.get("token"),
      revoke?.form.get("client_id"),
    ]).toStrictEqual([
      [400, 400, 400, 200, 200, 401],
      "refresh-1",
      "app.pochical",
    ]);
  });

  it("is refused without a session", async () => {
    const response = await exports.default.fetch(
      `${ORIGIN}/pochical.v1.UserService/DeleteAccount`,
      {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    expect(response.status).toBe(401);
  });

  it("is not done by better-auth alone, which would leave the groups behind", async () => {
    const token = await signInAnonymously();
    const response = await exports.default.fetch(
      `${ORIGIN}/api/auth/delete-anonymous-user`,
      {
        body: "{}",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    );
    expect([response.status, await signedIn(token)]).toStrictEqual([400, 200]);
  });
});
