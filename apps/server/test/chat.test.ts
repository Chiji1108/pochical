import type { MessageInitShape } from "@bufbuild/protobuf";
import { chatRules } from "@pochical/design/chat";
import { describe, expect, it, vi } from "vitest";

import type { ChatEditSchema } from "../src/gen/pochical/v1/sync_pb";
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
  | { days: string[] }
  | { poll: string[] }
  | { vote: [number, string, boolean] }
  | { decide: [number, string] }
  | { pin: [number, boolean] }
  | { react: [number, string, boolean] }
  | { send: string }
  | { reply: [number, string] }
  | { change: [number, string] }
  | { unsend: number }
  | { recall: string }
  | { read: number };

function sendChatKind(kind: ChatKind, threadId: string) {
  if ("poll" in kind) {
    return {
      case: "send",
      value: { days: kind.poll, poll: true, text: "", threadId },
    } as const;
  }
  if ("vote" in kind) {
    const [seq, day, on] = kind.vote;
    return {
      case: "vote",
      value: { day, on, seq: BigInt(seq), threadId },
    } as const;
  }
  if ("decide" in kind) {
    const [seq, day] = kind.decide;
    return {
      case: "decide",
      value: { day, seq: BigInt(seq), threadId },
    } as const;
  }
  if ("days" in kind) {
    return {
      case: "send",
      value: { days: kind.days, text: "", threadId },
    } as const;
  }
  if ("pin" in kind) {
    const [seq, on] = kind.pin;
    return {
      case: "pin",
      value: { on, seq: BigInt(seq), threadId },
    } as const;
  }
  if ("react" in kind) {
    const [seq, emoji, on] = kind.react;
    return {
      case: "react",
      value: { emoji, on, seq: BigInt(seq), threadId },
    } as const;
  }
  if ("send" in kind) {
    return {
      case: "send",
      value: { text: kind.send, threadId },
    } as const;
  }
  if ("reply" in kind) {
    const [seq, text] = kind.reply;
    return {
      case: "send",
      value: { replyTo: BigInt(seq), text, threadId },
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
  if ("recall" in kind) {
    return {
      case: "recall",
      value: { sendOpId: kind.recall, threadId },
    } as const;
  }
  return {
    case: "read",
    value: { lastReadSeq: BigInt(kind.read), threadId },
  } as const;
}

// A link's page as the app attaches one.
const page = (url: string) => ({ site: "Cafe", title: "店", url });

// pair()'s chat starts with the notice of the guest's joining, at seq 1,
// so the first line a member writes there is at seq 2.
const groupSocket = async (
  groupId: string,
  token: string,
  cursor = PAIR_ROSTER
) => await syncSocket(`/v1/groups/${groupId}/socket`, token, cursor);

// A page of numbered lines from `from`, as one member's outbox sends them.
const pageOfLines = (from: number) =>
  Array.from({ length: chatRules.pageSize }, (_, at) => ({
    kind: { send: `${from + at}` },
    opId: `m${from + at}`,
  }));

// A group of three, its maker's and the guest's one-to-one chat, and
// each member's group socket past the third joining: their member, the
// notice of it and their read mark.
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
  const roster = PAIR_ROSTER + 3n;
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
          seq: 2n,
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
    chat(theirs.socket, [{ kind: { change: [2, "ちがう"] }, opId: "b" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { edited: false, text: "はじめ" } } },
    ]);
    await theirs.frames.next();

    chat(mine.socket, [{ kind: { change: [2, "なおした"] }, opId: "c" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { edited: true, text: "なおした" } } },
    ]);
    chat(mine.socket, [{ kind: { unsend: 2 }, opId: "d" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { text: "", unsent: true } } },
    ]);
  });

  it("keeps a reply's line when it is one of the chat's, and drops it as the reply is taken back", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(mine.socket, [{ kind: { send: "はじめ" }, opId: "a" }]);
    // The line, then its acknowledgement.
    await mine.frames.next();
    await mine.frames.next();
    await theirs.frames.next();

    // A line that is not there cannot be answered: the line goes without
    // its quote.
    chat(theirs.socket, [
      { kind: { reply: [9, "どれ？"] }, opId: "b" },
      { kind: { reply: [2, "なに？"] }, opId: "c" },
    ]);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      { kind: { value: { replyTo: 0n, seq: 3n, text: "どれ？" } } },
      { kind: { value: { replyTo: 2n, seq: 4n, text: "なに？" } } },
    ]);

    chat(theirs.socket, [{ kind: { unsend: 4 }, opId: "d" }]);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      { kind: { value: { replyTo: 0n, seq: 4n, unsent: true } } },
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
          value: { lastReadSeq: 3n, threadId: thread },
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
    // Read up to the notice of their own joining.
    expect(changesIn(await mine.frames.next())).toMatchObject([
      { kind: { case: "member" } },
      { kind: { case: "chatLine", value: { authorId: newcomerId, seq: 3n } } },
      {
        kind: {
          case: "readMark",
          value: { lastReadSeq: 3n, userId: newcomerId },
        },
      },
    ]);
  });

  it("gives a device catching up only each chat's latest page, the rest as pages", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    // With the notice, five lines more than a page.
    const count = chatRules.pageSize + 4;
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
    chat(theirs.socket, [{ kind: { read: 3 }, opId: "r" }]);
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
    await user.setUnread(groupId, thread, { count: 0, mentions: 0 }, 12);
    await user.setUnread(groupId, thread, { count: 1, mentions: 0 }, 11);
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
    const mine = await groupSocket(groupId, maker, PAIR_ROSTER + 2n);
    chat(mine.socket, [{ kind: { send: "いる？" }, opId: "a" }], direct);
    await expect(mine.frames.next()).resolves.toMatchObject({
      kind: { case: "acked" },
    });
  });

  it("goes on with a one-to-one chat once the other joins again", async () => {
    const { call, userIdOf } = await import("./helpers");
    const { directThread } = await import("../src/group-chat");
    const { groupId, guest, inviteCode, maker, makerId } = await pair();
    const direct = directThread(makerId, await userIdOf(guest));
    const before = await groupSocket(groupId, maker);
    chat(before.socket, [{ kind: { send: "またね" }, opId: "a" }], direct);
    await before.frames.next();
    await before.frames.next();

    await call("GroupService/LeaveGroup", { groupId }, guest);
    await call(
      "GroupService/JoinGroup",
      { displayName: "ゆうき", inviteCode },
      guest
    );
    // Back, they catch up on what was said before they left…
    const theirs = await groupSocket(groupId, guest, 0n);
    const earlier = changesIn(await theirs.frames.next()).flatMap(({ kind }) =>
      kind.case === "chatLine" ? [kind.value.text] : []
    );
    expect(earlier).toContain("またね");

    // …and the chat takes new lines again.
    chat(theirs.socket, [{ kind: { send: "ただいま" }, opId: "b" }], direct);
    await expect(theirs.frames.next()).resolves.toMatchObject({
      kind: {
        case: "changes",
        value: {
          changes: [
            {
              kind: { case: "chatLine", value: { seq: 2n, text: "ただいま" } },
            },
          ],
        },
      },
    });
  });

  it("keeps each member's reactions on a line, in the order chosen", async () => {
    const { groupId, guest, maker, makerId } = await pair();
    const { userIdOf } = await import("./helpers");
    const guestId = await userIdOf(guest);
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(mine.socket, [{ kind: { send: "21日どう？" }, opId: "a" }]);
    await theirs.frames.next();

    chat(theirs.socket, [
      { kind: { react: [2, "👍", true] }, opId: "r1" },
      // Put on twice: the second changes nothing.
      { kind: { react: [2, "👍", true] }, opId: "r2" },
      { kind: { react: [2, "🎉", true] }, opId: "r3" },
    ]);
    chat(mine.socket, [{ kind: { react: [2, "👍", true] }, opId: "r4" }]);
    const reactionsIn = async () => {
      const changes = changesIn(await theirs.frames.next());
      const last = changes.at(-1)?.kind;
      return last?.case === "chatLine" ? last.value.reactions : undefined;
    };
    await expect(reactionsIn()).resolves.toMatchObject([
      { emoji: "👍", userIds: [guestId] },
      { emoji: "🎉", userIds: [guestId] },
    ]);
    // Their Acked, then the other's reaction.
    await theirs.frames.next();
    await expect(reactionsIn()).resolves.toMatchObject([
      { emoji: "👍", userIds: [guestId, makerId] },
      { emoji: "🎉", userIds: [guestId] },
    ]);
  });

  it("shares days with no words, in order and a month at most", async () => {
    const { SHARED_DAYS_MAX } = await import("@pochical/design/limits");
    const { groupId, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const month = Array.from(
      { length: SHARED_DAYS_MAX + 1 },
      (_, at) =>
        `2026-${at < 31 ? "10" : "11"}-${String((at % 31) + 1).padStart(2, "0")}`
    );
    chat(mine.socket, [
      { kind: { days: ["2026-10-11", "2026-10-10"] }, opId: "backward" },
      { kind: { days: ["2026-10-10", "2026-10-10"] }, opId: "twice" },
      { kind: { days: ["2026-02-30"] }, opId: "no-day" },
      { kind: { days: month }, opId: "too-many" },
      { kind: { days: ["2026-10-10", "2026-10-12"] }, opId: "a" },
    ]);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      {
        kind: {
          value: { days: ["2026-10-10", "2026-10-12"], seq: 2n, text: "" },
        },
      },
    ]);
    await mine.frames.next();

    // A line of days has no words to change; taken back, its days go.
    chat(mine.socket, [{ kind: { change: [2, "ことば"] }, opId: "b" }]);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      {
        kind: { value: { days: ["2026-10-10", "2026-10-12"], edited: false } },
      },
    ]);
    await mine.frames.next();
    chat(mine.socket, [{ kind: { unsend: 2 }, opId: "c" }]);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      { kind: { value: { days: [], unsent: true } } },
    ]);
  });

  it("takes votes on a poll until its writer settles and pins it", async () => {
    const { userIdOf } = await import("./helpers");
    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    const days = ["2026-10-10", "2026-10-11", "2026-10-12"];
    chat(mine.socket, [
      { kind: { poll: ["2026-10-10"] }, opId: "one-day" },
      { kind: { poll: days }, opId: "p" },
    ]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { days, poll: true, seq: 2n } } },
    ]);
    await mine.frames.next();
    await mine.frames.next();

    chat(theirs.socket, [
      { kind: { vote: [2, "2026-10-11", true] }, opId: "v1" },
      { kind: { vote: [2, "2026-10-13", true] }, opId: "not-on-it" },
      // Only its writer settles it while they are in the group.
      { kind: { decide: [2, "2026-10-11"] }, opId: "not-theirs" },
    ]);
    expect(changesIn(await mine.frames.next())).toMatchObject([
      {
        kind: {
          value: { votes: [{ day: "2026-10-11", userIds: [guestId] }] },
        },
      },
    ]);
    // Their own change and acknowledgement.
    await theirs.frames.next();
    await theirs.frames.next();
    chat(mine.socket, [
      { kind: { vote: [2, "2026-10-11", true] }, opId: "v2" },
      { kind: { decide: [2, "2026-10-11"] }, opId: "d" },
      { kind: { vote: [2, "2026-10-10", true] }, opId: "too-late" },
    ]);
    const changes = changesIn(await theirs.frames.next());
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({
      kind: {
        value: {
          decided: "2026-10-11",
          votes: [{ day: "2026-10-11", userIds: [guestId, makerId] }],
        },
      },
    });
    const decided = changes[1]?.kind;
    expect(
      decided?.case === "chatLine" && decided.value.pinnedOrder > 0n
    ).toBeTruthy();
  });

  it("lets anyone settle a poll once its writer has left", async () => {
    const { call } = await import("./helpers");
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(mine.socket, [
      { kind: { poll: ["2026-10-10", "2026-10-11"] }, opId: "p" },
    ]);
    await theirs.frames.next();
    await call("GroupService/LeaveGroup", { groupId }, maker);
    // Their leaving comes first.
    await theirs.frames.next();
    chat(theirs.socket, [{ kind: { decide: [2, "2026-10-10"] }, opId: "d" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { decided: "2026-10-10" } } },
    ]);
  });

  it("keeps a line's page while its first link stays, as the edit says", async () => {
    const { groupId, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const edit = (
      opId: string,
      kind: MessageInitShape<typeof ChatEditSchema>["kind"]
    ) => {
      sendFrame(mine.socket, {
        case: "chatEdits",
        value: { edits: [{ kind, opId }] },
      });
    };
    const lineAfter = async () => {
      const [change] = changesIn(await mine.frames.next());
      await mine.frames.next();
      return change?.kind.case === "chatLine" ? change.kind.value : undefined;
    };
    edit("a", {
      case: "send",
      value: {
        preview: page("https://cafe.example"),
        text: "ここ https://cafe.example",
        threadId: thread,
      },
    });
    const sent = await lineAfter();
    edit("b", {
      case: "change",
      value: {
        keepsPreview: true,
        seq: 2n,
        text: "ここどう？ https://cafe.example",
        threadId: thread,
      },
    });
    const kept = await lineAfter();
    edit("c", {
      case: "change",
      value: { seq: 2n, text: "やっぱりいいや", threadId: thread },
    });
    const none = await lineAfter();
    expect([
      sent?.preview?.url,
      kept?.preview?.url,
      none?.preview,
    ]).toStrictEqual([
      "https://cafe.example",
      "https://cafe.example",
      undefined,
    ]);
  });

  it("reads the page of a line sent before its preview came, unless taken off", async () => {
    const fetched: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      fetched.push(new Request(input).url);
      return await Promise.resolve(
        new Response('<meta property="og:title" content="あとから">', {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      );
    });
    const { groupId, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const send = (opId: string, text: string, withoutPreview = false) => {
      sendFrame(mine.socket, {
        case: "chatEdits",
        value: {
          edits: [
            {
              kind: {
                case: "send",
                value: { text, threadId: thread, withoutPreview },
              },
              opId,
            },
          ],
        },
      });
    };
    send("off", "これは https://off.example", true);
    const [off] = changesIn(await mine.frames.next());
    await mine.frames.next();
    send("late", "ここ https://late.example/menu");
    const [sent] = changesIn(await mine.frames.next());
    await mine.frames.next();
    const [added] = changesIn(await mine.frames.next());
    vi.restoreAllMocks();
    const lineOf = (change: typeof sent) =>
      change?.kind.case === "chatLine" ? change.kind.value : undefined;
    expect([
      lineOf(off)?.preview,
      lineOf(sent)?.preview,
      lineOf(added)?.seq,
      lineOf(added)?.preview?.title,
      fetched,
    ]).toStrictEqual([
      undefined,
      undefined,
      lineOf(sent)?.seq,
      "あとから",
      ["https://late.example/menu"],
    ]);
  });

  it("relays typing to the others who may read the chat, never kept", async () => {
    const { aside, direct, mine, theirs } = await trio();
    const typing = (threadId: string) => {
      sendFrame(theirs.socket, {
        case: "typing",
        value: { on: true, threadId, userId: "forged" },
      });
    };
    typing(thread);
    typing(direct);
    // A one-to-one chat's typing goes to its other member alone.
    const toMaker = [await mine.frames.next(), await mine.frames.next()];
    const toThird = await aside.frames.next();
    expect(
      toMaker.map(({ kind }) =>
        kind.case === "typing" ? kind.value.threadId : kind.case
      )
    ).toStrictEqual([thread, direct]);
    expect(toThird).toMatchObject({
      kind: { case: "typing", value: { on: true, threadId: thread } },
    });
    expect(
      toThird.kind.case === "typing" && toThird.kind.value.userId !== "forged"
    ).toBeTruthy();
  });

  it("keeps a report of a line with the lines around it", async () => {
    const { call } = await import("./helpers");
    const { env } = await import("cloudflare:workers");
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    chat(mine.socket, [{ kind: { send: "ひどい" }, opId: "a" }]);
    await mine.frames.next();
    await mine.frames.next();
    const report = async (token: string) => {
      const answer = await call(
        "ChatService/Report",
        {
          groupId,
          line: { seq: "2", threadId: thread },
          reason: "REPORT_REASON_HARASSMENT",
        },
        token
      );
      return answer.status;
    };
    // What reaches Pochical's people's Slack.
    const posted: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const body: unknown = await new Request(input, init).json();
      posted.push(
        typeof body === "object" && body !== null && "text" in body
          ? String(body.text)
          : ""
      );
      return Response.json({ ok: true, ts: "1.1" });
    });
    // The writer cannot report their own line.
    expect([await report(maker), await report(guest)]).toStrictEqual([
      404, 200,
    ]);
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    vi.restoreAllMocks();
    expect(posted[0]?.split("\n")).toStrictEqual([
      "新しい通報：嫌がらせ・いじめ（メッセージを通報）",
      "グループ：いとこ会",
      "通報した人：ゆうき　通報された人：さくら",
      "▶ さくら：ひどい",
      "<https://admin.pochical.app/reports|管理サイトで開く>",
    ]);
    const kept = await env.DB.prepare(
      "select reason, context from reports where group_id = ?"
    )
      .bind(groupId)
      .all<{ reason: string; context: string }>();
    const [row] = kept.results;
    expect([row?.reason, row?.context.includes("ひどい")]).toStrictEqual([
      "harassment",
      true,
    ]);
  });

  it("keeps a blocked member's one-to-one lines from the one who blocked them", async () => {
    const { call, userIdOf } = await import("./helpers");
    const { directThread } = await import("../src/group-chat");
    const { groupId, guest, maker, makerId } = await pair();
    const guestId = await userIdOf(guest);
    const direct = directThread(guestId, makerId);
    const blocked = await call(
      "UserService/SetBlocked",
      { blocked: true, userId: guestId },
      maker
    );
    expect(blocked.status).toBe(200);
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(theirs.socket, [{ kind: { send: "見て" }, opId: "a" }], direct);
    // Sent for the writer, never delivered to the one who blocked them.
    const [toWriter] = changesIn(await theirs.frames.next());
    const [toBlocker] = changesIn(await mine.frames.next());
    expect([toWriter?.kind.value, toBlocker?.kind.value]).toMatchObject([
      { hidden: false, text: "見て" },
      { hidden: true, text: "" },
    ]);
  });

  it("takes reactions off with a line taken back, and takes no word as one", async () => {
    const { groupId, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    chat(mine.socket, [{ kind: { send: "まちがい" }, opId: "a" }]);
    await mine.frames.next();
    await mine.frames.next();
    chat(mine.socket, [
      { kind: { react: [2, "OK", true] }, opId: "r1" },
      { kind: { react: [2, "👀", true] }, opId: "r2" },
      { kind: { unsend: 2 }, opId: "u" },
      { kind: { react: [2, "👀", true] }, opId: "r3" },
    ]);
    const changes = changesIn(await mine.frames.next());
    expect(changes).toHaveLength(2);
    expect(changes[1]).toMatchObject({
      kind: { case: "chatLine", value: { reactions: [], unsent: true } },
    });
  });

  it("takes back by its send's op_id a line whose Acked was lost, once", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(mine.socket, [{ kind: { send: "まちがい" }, opId: "a" }]);
    await mine.frames.next();
    await mine.frames.next();
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { seq: 2n, unsent: false } } },
    ]);

    chat(mine.socket, [
      { kind: { recall: "a" }, opId: "r1" },
      { kind: { recall: "a" }, opId: "r2" },
    ]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { seq: 2n, text: "", unsent: true } } },
    ]);
    await expect(settled(theirs.socket, theirs.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
    expect(changesIn(await mine.frames.next())).toHaveLength(1);
    await expect(mine.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["r1", "r2"] } },
    });
  });

  it("drops a send taken back before it came, as from a socket that died with it", async () => {
    const { groupId, guest, maker } = await pair();
    const before = await groupSocket(groupId, maker);
    const after = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);

    chat(after.socket, [{ kind: { recall: "a" }, opId: "r" }]);
    await expect(after.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["r"] } },
    });
    chat(before.socket, [
      { kind: { send: "まちがい" }, opId: "a" },
      { kind: { send: "明日休み？" }, opId: "b" },
    ]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { opId: "b", seq: 2n, text: "明日休み？" } } },
    ]);
    await expect(settled(theirs.socket, theirs.frames)).resolves.toMatchObject({
      kind: { case: "pong" },
    });
  });

  it("takes back by op_id only the member's own line, from any of their devices", async () => {
    const { groupId, guest, maker } = await pair();
    const phone = await groupSocket(groupId, maker);
    const tablet = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(phone.socket, [{ kind: { send: "まちがい" }, opId: "a" }]);
    await theirs.frames.next();

    // Someone else naming it changes nothing, nor keeps it from them.
    chat(theirs.socket, [{ kind: { recall: "a" }, opId: "x" }]);
    await expect(theirs.frames.next()).resolves.toMatchObject({
      kind: { case: "acked", value: { opIds: ["x"] } },
    });
    chat(tablet.socket, [{ kind: { recall: "a" }, opId: "r" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { opId: "a", seq: 2n, unsent: true } } },
    ]);
  });

  it("pins a line for everyone, a sixth taking the place of the oldest", async () => {
    const { groupId, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const count = chatRules.maxPins + 1;
    chat(
      mine.socket,
      Array.from({ length: count }, (_, at) => ({
        kind: { send: `${at + 1}` },
        opId: `s${at}`,
      }))
    );
    await mine.frames.next();
    await mine.frames.next();
    chat(
      mine.socket,
      Array.from({ length: count }, (_, at) => ({
        kind: { pin: [at + 2, true] },
        opId: `p${at}`,
      }))
    );
    const pinned = changesIn(await mine.frames.next()).flatMap(({ kind }) =>
      kind.case === "chatLine"
        ? [[Number(kind.value.seq), kind.value.pinnedOrder > 0n]]
        : []
    );
    // The last pin, then the first one coming off for it.
    expect(pinned.slice(-2)).toStrictEqual([
      [count + 1, true],
      [2, false],
    ]);
  });

  it("takes a pin off with its line taken back", async () => {
    const { groupId, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    chat(mine.socket, [{ kind: { send: "大事" }, opId: "a" }]);
    await mine.frames.next();
    await mine.frames.next();
    chat(mine.socket, [
      { kind: { pin: [2, true] }, opId: "p" },
      { kind: { unsend: 2 }, opId: "u" },
      { kind: { pin: [2, false] }, opId: "q" },
    ]);
    const lines = changesIn(await mine.frames.next());
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({
      kind: { case: "chatLine", value: { pinnedOrder: 0n, unsent: true } },
    });
  });

  it("gives a device catching up every line changed since, each with its reactions, past a query's hundred values", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const count = 120;
    chat(
      mine.socket,
      Array.from({ length: count }, (_, at) => ({
        kind: { send: `${at + 1}` },
        opId: `m${at}`,
      }))
    );
    await mine.frames.next();
    await mine.frames.next();
    chat(
      mine.socket,
      Array.from({ length: count }, (_, at) => ({
        kind: { react: [at + 2, at % 2 === 0 ? "👍" : "🎉", true] },
        opId: `r${at}`,
      }))
    );
    await mine.frames.next();
    await mine.frames.next();

    const later = await groupSocket(
      groupId,
      guest,
      PAIR_ROSTER + BigInt(count)
    );
    const lines = changesIn(await later.frames.next()).flatMap(({ kind }) =>
      kind.case === "chatLine"
        ? [[Number(kind.value.seq), kind.value.reactions.map((r) => r.emoji)]]
        : []
    );
    expect(lines).toStrictEqual(
      Array.from({ length: count }, (_, at) => [
        at + 2,
        [at % 2 === 0 ? "👍" : "🎉"],
      ])
    );
  });

  it("gives a device catching up a pinned line however far back", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    chat(
      mine.socket,
      Array.from({ length: chatRules.pageSize + 5 }, (_, at) => ({
        kind: { send: `${at + 1}` },
        opId: `m${at}`,
      }))
    );
    await mine.frames.next();
    await mine.frames.next();
    chat(mine.socket, [{ kind: { pin: [2, true] }, opId: "p" }]);
    await mine.frames.next();
    await mine.frames.next();
    const later = await groupSocket(groupId, guest);
    const first = changesIn(await later.frames.next()).find(
      ({ kind }) => kind.case === "chatLine" && kind.value.seq === 2n
    );
    expect(first).toMatchObject({
      kind: { value: { text: "1" } },
    });
  });

  it("sends the line a reply answers with it, however far back", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    const theirs = await groupSocket(groupId, guest);
    chat(
      mine.socket,
      Array.from({ length: chatRules.pageSize + 5 }, (_, at) => ({
        kind: { send: `${at + 1}` },
        opId: `m${at}`,
      }))
    );
    await mine.frames.next();
    await mine.frames.next();
    await theirs.frames.next();

    // Live: the answered line, then the reply.
    chat(mine.socket, [{ kind: { reply: [2, "これ"] }, opId: "r" }]);
    expect(changesIn(await theirs.frames.next())).toMatchObject([
      { kind: { value: { seq: 2n, text: "1" } } },
      { kind: { value: { replyTo: 2n, text: "これ" } } },
    ]);
    await mine.frames.next();
    await mine.frames.next();

    // Catching up: the latest page, and the line its reply answers.
    const later = await groupSocket(groupId, guest);
    const lines = changesIn(await later.frames.next()).filter(
      ({ kind }) => kind.case === "chatLine"
    );
    expect(lines).toHaveLength(chatRules.pageSize + 1);
    expect(lines[0]).toMatchObject({ kind: { value: { seq: 2n, text: "1" } } });
  });

  it("gives a page the lines its replies answer from before it", async () => {
    const { groupId, guest, maker } = await pair();
    const mine = await groupSocket(groupId, maker);
    // "1" at seq 2, a page of lines, a reply to "1", then a page more.
    chat(mine.socket, [
      { kind: { send: "1" }, opId: "first" },
      ...pageOfLines(2),
      { kind: { reply: [2, "これ"] }, opId: "r" },
      ...pageOfLines(100),
    ]);
    await mine.frames.next();
    await mine.frames.next();

    const later = await groupSocket(groupId, guest);
    await later.frames.next();
    const replySeq = BigInt(chatRules.pageSize + 3);
    sendFrame(later.socket, {
      case: "chatPageRequest",
      value: { beforeSeq: replySeq + 1n, threadId: thread },
    });
    const frame = await later.frames.next();
    expect(frame).toMatchObject({
      kind: { case: "chatPage", value: { quoted: [{ seq: 2n, text: "1" }] } },
    });
    expect(
      frame.kind.case === "chatPage" ? frame.kind.value.lines.at(-1) : undefined
    ).toMatchObject({ replyTo: 2n, seq: replySeq });
  });
});
