import { chatRules } from "@pochical/design/chat";
import { describe, expect, it } from "vitest";

import {
  PAIR_ROSTER,
  changesIn,
  device,
  pair,
  sendFrame,
  settled,
  syncSocket,
} from "./sync-helpers";

const thread = "group";

// A member's chat edit as their outbox sends it.
const chat = (
  socket: WebSocket,
  edits: { opId: string; kind: Parameters<typeof sendChatKind>[0] }[],
  threadId = thread
): void => {
  sendFrame(socket, {
    case: "chatEdits",
    value: {
      edits: edits.map(({ opId, kind }) => ({
        kind: sendChatKind(kind, threadId),
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

function sendChatKind(kind: ChatKind, threadId: string) {
  if ("send" in kind) {
    return {
      case: "send",
      value: { text: kind.send, threadId },
    } as const;
  }
  if ("change" in kind) {
    return {
      case: "change",
      value: {
        seq: BigInt(kind.change[0]),
        text: kind.change[1],
        threadId,
      },
    } as const;
  }
  if ("unsend" in kind) {
    return {
      case: "unsend",
      value: { seq: BigInt(kind.unsend), threadId },
    } as const;
  }
  return {
    case: "read",
    value: { lastReadSeq: BigInt(kind.read), threadId },
  } as const;
}

const groupSocket = async (
  groupId: string,
  token: string,
  cursor = PAIR_ROSTER
) => await syncSocket(`/v1/groups/${groupId}/socket`, token, cursor);

// A group of three, its maker's and the guest's one-to-one chat, and
// each member's group socket past the third joining (no read mark is kept
// for an empty chat).
const trio = async () => {
  const { call, signInAnonymously, userIdOf } = await import("./helpers");
  const { directThread } = await import("../src/group-chat");
  const { groupId, guest, inviteCode, maker, makerId } = await pair();
  const third = await signInAnonymously();
  await call(
    "GroupService/JoinGroup",
    { displayName: "あや", inviteCode },
    third
  );
  const roster = PAIR_ROSTER + 1n;
  return {
    aside: await groupSocket(groupId, third, roster),
    direct: directThread(await userIdOf(guest), makerId),
    groupId,
    guest,
    mine: await groupSocket(groupId, maker, roster),
    roster,
    theirs: await groupSocket(groupId, guest, roster),
    third,
  };
};

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

  it("tells each member's own devices how many lines they have not read", async () => {
    const { groupId, guest, maker } = await pair();
    const phone = await device(guest);
    await phone.frames.next();
    const mine = await groupSocket(groupId, maker);
    chat(mine.socket, [
      { kind: { send: "明日ひま？" }, opId: "a" },
      { kind: { send: "ご飯いこ" }, opId: "b" },
    ]);
    const unread = (n: number) => [
      {
        kind: {
          case: "unreadCount",
          value: { count: n, groupId, threadId: thread },
        },
      },
    ];
    expect(changesIn(await phone.frames.next())).toMatchObject(unread(2));

    const theirs = await groupSocket(groupId, guest);
    chat(theirs.socket, [{ kind: { read: 2 }, opId: "r" }]);
    expect(changesIn(await phone.frames.next())).toMatchObject(unread(0));
  });

  it("drops a group's counts as the member leaves it", async () => {
    const { call } = await import("./helpers");
    const { groupId, guest, maker } = await pair();
    const phone = await device(guest);
    await phone.frames.next();
    const mine = await groupSocket(groupId, maker);
    chat(mine.socket, [{ kind: { send: "明日ひま？" }, opId: "a" }]);
    await phone.frames.next();

    await call("GroupService/LeaveGroup", { groupId }, guest);
    const later = await device(guest);
    const kinds = changesIn(await later.frames.next()).map(
      ({ kind }) => kind.case
    );
    expect(kinds).not.toContain("unreadCount");
  });

  it("keeps the newest count when counts arrive out of order", async () => {
    const { env } = await import("cloudflare:workers");
    const { groupId, guest } = await pair();
    const { userIdOf } = await import("./helpers");
    const user = env.USERS.getByName(await userIdOf(guest));
    // Read up at the group's cursor 12, then a send's count from 11.
    await user.setUnread(groupId, thread, 0, 12);
    await user.setUnread(groupId, thread, 1, 11);
    const phone = await device(guest);
    const counts = changesIn(await phone.frames.next()).filter(
      ({ kind }) => kind.case === "unreadCount"
    );
    expect(counts).toMatchObject([
      { kind: { value: { count: 0, groupId, threadId: thread } } },
    ]);
  });

  it("gives a one-to-one chat's line to its two members alone", async () => {
    const { aside, direct, mine, theirs } = await trio();
    chat(mine.socket, [{ kind: { send: "ふたりで" }, opId: "d" }], direct);
    const line = [{ kind: { case: "chatLine", value: { threadId: direct } } }];
    expect(changesIn(await mine.frames.next())).toMatchObject(line);
    expect(changesIn(await theirs.frames.next())).toMatchObject(line);
    await expect(settled(aside.socket, aside.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("counts a one-to-one chat's line unread for the other alone", async () => {
    const { direct, guest, mine, third } = await trio();
    const guestPhone = await device(guest);
    await guestPhone.frames.next();
    const thirdPhone = await device(third);
    await thirdPhone.frames.next();
    chat(mine.socket, [{ kind: { send: "ふたりで" }, opId: "d" }], direct);
    expect(changesIn(await guestPhone.frames.next())).toMatchObject([
      { kind: { case: "unreadCount", value: { count: 1, threadId: direct } } },
    ]);
    await expect(
      settled(thirdPhone.socket, thirdPhone.frames)
    ).resolves.toMatchObject({ kind: { case: "pong" } });
  });

  it("lets no one else read or write in a one-to-one chat", async () => {
    const { direct, groupId, mine, roster, theirs, third } = await trio();
    chat(mine.socket, [{ kind: { send: "ふたりで" }, opId: "d" }], direct);
    await mine.frames.next();
    await theirs.frames.next();
    // Catching up brings them nothing of it.
    const later = await groupSocket(groupId, third, roster);
    await expect(settled(later.socket, later.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
    sendFrame(later.socket, {
      case: "chatPageRequest",
      value: { beforeSeq: 0n, threadId: direct },
    });
    await expect(later.frames.next()).resolves.toMatchObject({
      kind: { case: "chatPage", value: { atStart: true, lines: [] } },
    });
    chat(later.socket, [{ kind: { send: "割り込み" }, opId: "x" }], direct);
    await expect(later.frames.next()).resolves.toMatchObject({
      kind: { case: "acked" },
    });
    await expect(settled(theirs.socket, theirs.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("takes no new line in a one-to-one chat once the other has left", async () => {
    const { call, userIdOf } = await import("./helpers");
    const { directThread } = await import("../src/group-chat");
    const { groupId, guest, maker, makerId } = await pair();
    const direct = directThread(makerId, await userIdOf(guest));
    await call("GroupService/LeaveGroup", { groupId }, guest);
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 1n);
    chat(mine.socket, [{ kind: { send: "いる？" }, opId: "a" }], direct);
    await expect(mine.frames.next()).resolves.toMatchObject({
      kind: { case: "acked" },
    });
  });
});
