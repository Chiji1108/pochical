import { chatPlaces, chatRules } from "@pochical/design/chat";
import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { supportPlace } from "../src/group-chat";
import { call, signInAnonymously, userIdOf } from "./helpers";
import { changesIn, sendFrame, settled, syncSocket } from "./sync-helpers";

// A user's chat with Pochical's people, kept as a group's chats are and
// doing what chatPlaces.support lets it (spec/chat.md, Where a chat is
// kept).

const thread = "group";

const supportSocket = async (token: string, cursor = 0n) =>
  await syncSocket("/v1/me/support/socket", token, cursor);

const send = (
  socket: WebSocket,
  opId: string,
  value: {
    text?: string;
    days?: string[];
    poll?: boolean;
    device?: string;
  }
): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: [
        { kind: { case: "send", value: { threadId: thread, ...value } }, opId },
      ],
    },
  });
};

const kept = async (userId: string, sql: string) =>
  await runInDurableObject(
    env.GROUPS.getByName(supportPlace(userId)),
    (_, state) => state.storage.sql.exec(sql).toArray()
  );

describe("the chat with Pochical's people", () => {
  it("is a chat of two, the user and Pochical's people, said nowhere in it", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const { welcome, frames, socket } = await supportSocket(token);
    expect(welcome.kind.case).toBe("welcome");

    const caughtUp = changesIn(await frames.next());
    const members = caughtUp.flatMap(({ kind }) =>
      kind.case === "member" ? [kind.value.userId] : []
    );
    expect(members).toStrictEqual([userId, chatRules.pochicalMember]);
    expect(caughtUp.some(({ kind }) => kind.case === "chatLine")).toBeFalsy();
    await expect(settled(socket, frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("takes words with the app's word on itself, and keeps it", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const { frames, socket } = await supportSocket(token);
    await frames.next();

    send(socket, "a", {
      device: "ポチカル 1.0・iPhone (iOS 26.0)",
      text: "アプリが落ちます",
    });
    expect(changesIn(await frames.next())).toMatchObject([
      {
        kind: {
          case: "chatLine",
          value: { authorId: userId, seq: 1n, text: "アプリが落ちます" },
        },
      },
    ]);
    await expect(frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["a"] } },
    });
    await expect(
      kept(userId, "select device from chat_lines")
    ).resolves.toStrictEqual([{ device: "ポチカル 1.0・iPhone (iOS 26.0)" }]);
  });

  it("drops what a support chat does not take: days, polls, 編集 and pins", async () => {
    expect(chatPlaces.support).toMatchObject({
      days: false,
      edit: false,
      pins: false,
      polls: false,
    });
    const token = await signInAnonymously();
    const { frames, socket } = await supportSocket(token);
    await frames.next();
    send(socket, "a", { text: "はじめ" });
    await frames.next();
    await frames.next();

    sendFrame(socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "send",
              value: { days: ["2026-10-20"], text: "", threadId: thread },
            },
            opId: "b",
          },
          {
            kind: {
              case: "send",
              value: {
                days: ["2026-10-20", "2026-10-21"],
                poll: true,
                text: "",
                threadId: thread,
              },
            },
            opId: "c",
          },
          {
            kind: {
              case: "change",
              value: { seq: 1n, text: "なおした", threadId: thread },
            },
            opId: "d",
          },
          {
            kind: {
              case: "pin",
              value: { on: true, seq: 1n, threadId: thread },
            },
            opId: "e",
          },
        ],
      },
    });
    // Nothing changed: the frame is acknowledged with no changes before.
    await expect(frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["b", "c", "d", "e"] } },
    });
  });

  it("takes reactions, replies and taking back, as a group's chat does", async () => {
    const token = await signInAnonymously();
    const { frames, socket } = await supportSocket(token);
    await frames.next();
    send(socket, "a", { text: "はじめ" });
    await frames.next();
    await frames.next();

    sendFrame(socket, {
      case: "chatEdits",
      value: {
        edits: [
          {
            kind: {
              case: "react",
              value: { emoji: "🙏", on: true, seq: 1n, threadId: thread },
            },
            opId: "b",
          },
          {
            kind: {
              case: "send",
              value: { replyTo: 1n, text: "つづき", threadId: thread },
            },
            opId: "c",
          },
          {
            kind: { case: "unsend", value: { seq: 2n, threadId: thread } },
            opId: "d",
          },
        ],
      },
    });
    const lines = changesIn(await frames.next()).flatMap(({ kind }) =>
      kind.case === "chatLine" ? [kind.value] : []
    );
    expect(lines).toMatchObject([
      { reactions: [{ emoji: "🙏" }], seq: 1n },
      { replyTo: 1n, seq: 2n, text: "つづき" },
      { seq: 2n, unsent: true },
    ]);
  });

  it("is reported by no one", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const { frames } = await supportSocket(token);
    await frames.next();
    const reported = await runInDurableObject(
      env.GROUPS.getByName(supportPlace(userId)),
      (instance) =>
        instance.reportContext(userId, { userId: chatRules.pochicalMember })
    );
    expect(reported).toBeNull();
  });

  it("is never made of a group, nor of another's place", async () => {
    const token = await signInAnonymously();
    const userId = await userIdOf(token);
    const created = await call(
      "GroupService/CreateGroup",
      {
        displayName: "さくら",
        mark: { emoji: "🍉" },
        name: "いとこ会",
        requestId: crypto.randomUUID(),
      },
      token
    );
    const { groupId } = (await created.json()) as { groupId: string };
    await expect(
      env.GROUPS.getByName(groupId).setUpSupport(userId)
    ).resolves.toBeFalsy();
    await expect(
      env.GROUPS.getByName(supportPlace("someone")).setUpSupport(userId)
    ).resolves.toBeFalsy();
  });
});
