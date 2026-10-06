import { chatRules } from "@pochical/design/chat";
import { describe, expect, it } from "vitest";

import {
  PAIR_ROSTER,
  changesIn,
  pair,
  sendFrame,
  settled,
  syncSocket,
} from "./sync-helpers";

// A member's chat edit as their outbox sends it.
const chat = (
  socket: WebSocket,
  edits: { opId: string; kind: Parameters<typeof sendChatKind>[0] }[]
): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: edits.map(({ opId, kind }) => ({
        kind: sendChatKind(kind),
        opId,
      })),
    },
  });
};

type ChatKind =
  | { send: string }
  | { change: [number, string] }
  | { unsend: number }
  | { read: number };

const thread = "group";

function sendChatKind(kind: ChatKind) {
  if ("send" in kind) {
    return {
      case: "send",
      value: { text: kind.send, threadId: thread },
    } as const;
  }
  if ("change" in kind) {
    return {
      case: "change",
      value: {
        seq: BigInt(kind.change[0]),
        text: kind.change[1],
        threadId: thread,
      },
    } as const;
  }
  if ("unsend" in kind) {
    return {
      case: "unsend",
      value: { seq: BigInt(kind.unsend), threadId: thread },
    } as const;
  }
  return {
    case: "read",
    value: { lastReadSeq: BigInt(kind.read), threadId: thread },
  } as const;
}

const groupSocket = async (
  groupId: string,
  token: string,
  cursor = PAIR_ROSTER
) => await syncSocket(`/v1/groups/${groupId}/socket`, token, cursor);

describe("a group's chat", () => {
  it("takes a member's line once and gives it to everyone with the group open", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);

    chat(mine.socket, [
      { kind: { send: "今週どう？" }, opId: "a" },
      { kind: { send: "今週どう？" }, opId: "a" },
    ]);
    const line = {
      kind: {
        case: "chatLine",
        value: {
          authorId: makerId,
          opId: "a",
          seq: 1n,
          text: "今週どう？",
          threadId: thread,
        },
      },
    };
    expect(changesIn(await mine.frames.next())).toMatchObject([line]);
    await expect(mine.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["a", "a"] } },
    });
    expect(changesIn(await theirs.frames.next())).toMatchObject([line]);
    await expect(settled(theirs.socket, theirs.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("changes or takes back only the writer's own lines", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(mine.socket, [{ kind: { send: "はじめ" }, opId: "a" }]);
    await mine.frames.next();
    await mine.frames.next();
    await theirs.frames.next();

    // Someone else's line comes back as it is.
    chat(theirs.socket, [{ kind: { change: [1, "ちがう"] }, opId: "b" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { edited: false, text: "はじめ" } } },
    ]);
    await theirs.frames.next();

    chat(mine.socket, [{ kind: { change: [1, "なおした"] }, opId: "c" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { edited: true, text: "なおした" } } },
    ]);
    chat(mine.socket, [{ kind: { unsend: 1 }, opId: "d" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { text: "", unsent: true } } },
    ]);
  });

  it("moves a read mark only forward, and not past the chat's end", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(mine.socket, [
      { kind: { send: "1" }, opId: "a" },
      { kind: { send: "2" }, opId: "b" },
    ]);
    await theirs.frames.next();

    chat(theirs.socket, [
      { kind: { read: 9 }, opId: "r1" },
      { kind: { read: 1 }, opId: "r2" },
    ]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      {
        kind: {
          case: "readMark",
          value: { lastReadSeq: 2n, threadId: thread },
        },
      },
    ]);
    await expect(theirs.frames.next()).resolves.toMatchObject({
      kind: { case: "acked" },
    });
  });

  it("starts someone who joins at the chat's end", async () => {
    const { groupId, inviteCode, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    chat(mine.socket, [{ kind: { send: "前の話" }, opId: "a" }]);
    await mine.frames.next();
    await mine.frames.next();

    const { call, signInAnonymously, userIdOf } = await import("./helpers");
    const newcomer = await signInAnonymously();
    await call(
      "GroupService/JoinGroup",
      { displayName: "あや", inviteCode },
      newcomer
    );
    const newcomerId = await userIdOf(newcomer);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      { kind: { case: "member" } },
      {
        kind: {
          case: "readMark",
          value: { lastReadSeq: 1n, userId: newcomerId },
        },
      },
    ]);
  });

  it("gives a device catching up only each chat's latest page, the rest as pages", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const count = chatRules.pageSize + 5;
    chat(
      mine.socket,
      Array.from({ length: count }, (_, at) => ({
        kind: { send: `${at + 1}` },
        opId: `m${at}`,
      }))
    );
    await mine.frames.next();
    await mine.frames.next();

    const later = await groupSocket(groupId, guest);
    const lines = changesIn(await later.frames.next()).filter(
      ({ kind }) => kind.case === "chatLine"
    );
    expect(lines).toHaveLength(chatRules.pageSize);
    expect(lines[0]).toMatchObject({ kind: { value: { seq: 6n } } });

    sendFrame(later.socket, {
      case: "chatPageRequest",
      value: { beforeSeq: 6n, threadId: thread },
    });
    await expect(later.frames.next()).resolves.toMatchObject({
      kind: {
        case: "chatPage",
        value: { atStart: true, lines: [{ seq: 1n }, {}, {}, {}, { seq: 5n }] },
      },
    });
  });
});
